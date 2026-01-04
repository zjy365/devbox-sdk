use crate::error::AppError;
use crate::response::ApiResponse;
use crate::state::AppState;
use crate::utils::path::{ensure_directory, validate_path};
use axum::{
    body::Body,
    extract::{Multipart, State},
    http::header,
    response::{IntoResponse, Response},
    Json,
};
use flate2::write::GzEncoder;
use flate2::Compression;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::sync::Arc;
use tokio::fs;
use tokio::io::AsyncWriteExt;

struct ChannelWriter {
    tx: tokio::sync::mpsc::Sender<Result<Vec<u8>, std::io::Error>>,
}

impl std::io::Write for ChannelWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let data = buf.to_vec();
        let len = data.len();
        match self.tx.blocking_send(Ok(data)) {
            Ok(_) => Ok(len),
            Err(_) => Err(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "Channel closed",
            )),
        }
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[derive(Deserialize)]
pub struct DownloadFilesRequest {
    paths: Vec<String>,
    #[serde(default)]
    format: Option<String>,
}

pub async fn batch_download(
    State(state): State<Arc<AppState>>,
    Json(req): Json<DownloadFilesRequest>,
) -> Result<Response, AppError> {
    if req.paths.is_empty() {
        return Err(AppError::BadRequest("No paths provided".to_string()));
    }

    let mut valid_paths = Vec::new();
    for path in &req.paths {
        let valid_path = validate_path(&state.config.workspace_path, path)?;
        if !valid_path.exists() {
            return Err(AppError::NotFound(format!("File not found: {}", path)));
        }
        valid_paths.push(valid_path);
    }

    let format = req.format.as_deref().unwrap_or("tar.gz");
    let workspace_path = state.config.workspace_path.clone();

    match format {
        "tar" => {
            let (tx, rx) = tokio::sync::mpsc::channel::<Result<Vec<u8>, std::io::Error>>(10);
            let valid_paths = valid_paths.clone();
            let tx_err = tx.clone();

            tokio::task::spawn_blocking(move || {
                let writer = ChannelWriter { tx };
                let mut tar = tar::Builder::new(writer);
                for path in valid_paths {
                    let rel_path = match path.strip_prefix(&workspace_path) {
                        Ok(p) => p,
                        Err(_) => {
                            std::path::Path::new(path.file_name().unwrap_or(path.as_os_str()))
                        }
                    };
                    if path.is_dir() {
                        if let Err(e) = tar.append_dir_all(rel_path, &path) {
                            let _ = tx_err.blocking_send(Err(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                format!("Failed to append dir: {}", e),
                            )));
                            return;
                        }
                    } else {
                        if let Err(e) = tar.append_path_with_name(&path, rel_path) {
                            let _ = tx_err.blocking_send(Err(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                format!("Failed to append file: {}", e),
                            )));
                            return;
                        }
                    }
                }
                if let Err(e) = tar.finish() {
                    let _ = tx_err.blocking_send(Err(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Failed to finish tar: {}", e),
                    )));
                }
            });

            let stream = tokio_stream::wrappers::ReceiverStream::new(rx);
            let body = Body::from_stream(stream);

            let headers = [
                (header::CONTENT_TYPE, "application/x-tar".to_string()),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"download.tar\"".to_string(),
                ),
            ];
            Ok((headers, body).into_response())
        }
        "multipart" | "mixed" => {
            let boundary = crate::utils::common::generate_id();
            let boundary_clone = boundary.clone();
            let (tx, rx) = tokio::sync::mpsc::channel::<Result<Vec<u8>, std::io::Error>>(10);
            let valid_paths = valid_paths.clone();
            let tx_err = tx.clone();

            tokio::task::spawn_blocking(move || {
                let mut writer = ChannelWriter { tx };
                let mut stack = valid_paths.clone();

                while let Some(path) = stack.pop() {
                    if path.is_dir() {
                        if let Ok(entries) = std::fs::read_dir(&path) {
                            for entry in entries.flatten() {
                                stack.push(entry.path());
                            }
                        }
                    } else {
                        let mime = "application/octet-stream";
                        let header = format!(
                            "--{}\r\nContent-Disposition: attachment; filename=\"{}\"\r\nContent-Type: {}\r\n\r\n",
                            boundary_clone,
                            path.to_string_lossy(),
                            mime
                        );
                        if writer.write_all(header.as_bytes()).is_err() {
                            return;
                        }

                        if let Ok(mut file) = std::fs::File::open(&path) {
                            if std::io::copy(&mut file, &mut writer).is_err() {
                                let _ = tx_err.blocking_send(Err(std::io::Error::new(
                                    std::io::ErrorKind::Other,
                                    "Failed to read file",
                                )));
                                return;
                            }
                        }
                        if writer.write_all(b"\r\n").is_err() {
                            return;
                        }
                    }
                }
                let _ = writer.write_all(format!("--{}--\r\n", boundary_clone).as_bytes());
            });

            let stream = tokio_stream::wrappers::ReceiverStream::new(rx);
            let body = Body::from_stream(stream);

            let headers = [
                (
                    header::CONTENT_TYPE,
                    format!("multipart/mixed; boundary={}", boundary),
                ),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"download.multipart\"".to_string(),
                ),
            ];
            Ok((headers, body).into_response())
        }
        _ => {
            // tar.gz
            let (tx, rx) = tokio::sync::mpsc::channel::<Result<Vec<u8>, std::io::Error>>(10);
            let valid_paths = valid_paths.clone();
            let tx_err = tx.clone();

            tokio::task::spawn_blocking(move || {
                let writer = ChannelWriter { tx };
                let mut enc = GzEncoder::new(writer, Compression::default());
                {
                    let mut tar = tar::Builder::new(&mut enc);
                    for path in valid_paths {
                        let rel_path = match path.strip_prefix(&workspace_path) {
                            Ok(p) => p,
                            Err(_) => {
                                std::path::Path::new(path.file_name().unwrap_or(path.as_os_str()))
                            }
                        };
                        if path.is_dir() {
                            if let Err(e) = tar.append_dir_all(rel_path, &path) {
                                let _ = tx_err.blocking_send(Err(std::io::Error::new(
                                    std::io::ErrorKind::Other,
                                    format!("Failed to append dir: {}", e),
                                )));
                                return;
                            }
                        } else {
                            if let Err(e) = tar.append_path_with_name(&path, rel_path) {
                                let _ = tx_err.blocking_send(Err(std::io::Error::new(
                                    std::io::ErrorKind::Other,
                                    format!("Failed to append file: {}", e),
                                )));
                                return;
                            }
                        }
                    }
                    if let Err(e) = tar.finish() {
                        let _ = tx_err.blocking_send(Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!("Failed to finish tar: {}", e),
                        )));
                        return;
                    }
                }
                if let Err(e) = enc.finish() {
                    let _ = tx_err.blocking_send(Err(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Failed to finish gzip: {}", e),
                    )));
                }
            });

            let stream = tokio_stream::wrappers::ReceiverStream::new(rx);
            let body = Body::from_stream(stream);

            let headers = [
                (header::CONTENT_TYPE, "application/gzip".to_string()),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"download.tar.gz\"".to_string(),
                ),
            ];
            Ok((headers, body).into_response())
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchUploadResult {
    path: String,
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchUploadResponse {
    results: Vec<BatchUploadResult>,
    total_files: usize,
    success_count: usize,
}

/// Mimics the Go server's behavior of manually parsing Content-Disposition
/// to extract a filename, allowing for paths in the filename field.
fn extract_full_filename(field: &axum::extract::multipart::Field) -> String {
    let default_filename = field.file_name().unwrap_or("unknown").to_string();

    if let Some(cd) = field.headers().get(axum::http::header::CONTENT_DISPOSITION) {
        if let Ok(cd_str) = cd.to_str() {
            for part in cd_str.split(';') {
                let part = part.trim();
                if part.starts_with("filename=") {
                    // Extract the value, trim quotes, and if it's not empty, use it.
                    let filename = part
                        .strip_prefix("filename=")
                        .unwrap_or_default()
                        .trim_matches('"');
                    if !filename.is_empty() {
                        return filename.to_string();
                    }
                }
            }
        }
    }

    // Fallback to the default (potentially sanitized) filename
    default_filename
}

pub async fn batch_upload(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<BatchUploadResponse>>, AppError> {
    let mut results = Vec::new();
    let mut success_count = 0;
    let mut total_files = 0;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "files" || name == "file" {
            total_files += 1;
            let filename = extract_full_filename(&field);

            let target_path_res = validate_path(&state.config.workspace_path, &filename);

            match target_path_res {
                Ok(target_path) => {
                    if let Some(parent) = target_path.parent() {
                        if let Err(e) = ensure_directory(parent).await {
                            results.push(BatchUploadResult {
                                path: filename,
                                success: false,
                                error: Some(e.to_string()),
                                size: None,
                            });
                            continue;
                        }
                    }

                    let mut file = match fs::File::create(&target_path).await {
                        Ok(f) => f,
                        Err(e) => {
                            results.push(BatchUploadResult {
                                path: filename,
                                success: false,
                                error: Some(e.to_string()),
                                size: None,
                            });
                            continue;
                        }
                    };

                    let mut size = 0;
                    let mut stream = field;
                    let mut failed = false;
                    while let Some(chunk) = stream.next().await {
                        match chunk {
                            Ok(data) => {
                                size += data.len() as u64;
                                if size > state.config.max_file_size {
                                    drop(file);
                                    fs::remove_file(&target_path).await.ok();
                                    results.push(BatchUploadResult {
                                        path: filename.clone(),
                                        success: false,
                                        error: Some("File too large".to_string()),
                                        size: None,
                                    });
                                    failed = true;
                                    break;
                                }

                                if let Err(e) = file.write_all(&data).await {
                                    results.push(BatchUploadResult {
                                        path: filename.clone(),
                                        success: false,
                                        error: Some(e.to_string()),
                                        size: None,
                                    });
                                    failed = true;
                                    break;
                                }
                            }
                            Err(e) => {
                                results.push(BatchUploadResult {
                                    path: filename.clone(),
                                    success: false,
                                    error: Some(e.to_string()),
                                    size: None,
                                });
                                failed = true;
                                break;
                            }
                        }
                    }

                    if !failed {
                        success_count += 1;
                        results.push(BatchUploadResult {
                            path: target_path.to_string_lossy().to_string(),
                            success: true,
                            error: None,
                            size: Some(size),
                        });
                    }
                }
                Err(e) => {
                    results.push(BatchUploadResult {
                        path: filename,
                        success: false,
                        error: Some(e.to_string()),
                        size: None,
                    });
                }
            }
        }
    }

    Ok(Json(ApiResponse::success(BatchUploadResponse {
        results,
        total_files,
        success_count,
    })))
}
