use crate::error::AppError;
use crate::response::ApiResponse;
use crate::state::AppState;
use crate::utils::path::{ensure_directory, validate_path};
use axum::{
    body::Body,
    extract::{Multipart, Query, State},
    http::header,
    response::{IntoResponse, Response},
    Json,
};
use flate2::write::GzEncoder;
use flate2::Compression;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListFilesParams {
    path: Option<String>,
    #[serde(default)]
    show_hidden: bool,
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default)]
    offset: usize,
}

fn default_limit() -> usize {
    100
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    name: String,
    path: String,
    size: u64,
    is_dir: bool,
    mime_type: Option<String>,
    permissions: Option<String>,
    modified: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListFilesResponse {
    files: Vec<FileInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOperationResponse {
    success: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileResponse {
    path: String,
    size: u64,
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

pub async fn list_files(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListFilesParams>,
) -> Result<Json<ApiResponse<ListFilesResponse>>, AppError> {
    let path_str = params.path.as_deref().unwrap_or(".");
    let valid_path = validate_path(&state.config.workspace_path, path_str)?;

    let mut entries = fs::read_dir(&valid_path).await?;
    let mut files = Vec::new();

    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        if !params.show_hidden && name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata().await?;
        let is_dir = metadata.is_dir();
        let size = metadata.len();

        let mime_type = if !is_dir {
            Some(crate::utils::common::mime_guess(std::path::Path::new(&name)).to_string())
        } else {
            None
        };

        #[cfg(unix)]
        let permissions = {
            use std::os::unix::fs::PermissionsExt;
            Some(format!("0{:o}", metadata.permissions().mode() & 0o777))
        };
        #[cfg(not(unix))]
        let permissions = None;

        let modified = metadata.modified().ok().map(|t| {
            let duration = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
            crate::utils::common::format_time(duration.as_secs())
        });

        files.push(FileInfo {
            name,
            path: entry.path().to_string_lossy().to_string(),
            size,
            is_dir,
            mime_type,
            permissions,
            modified,
        });
    }

    let total = files.len();
    let end = std::cmp::min(params.offset + params.limit, total);
    let paged_files = if params.offset < total {
        files[params.offset..end].to_vec()
    } else {
        Vec::new()
    };

    Ok(Json(ApiResponse::success(ListFilesResponse {
        files: paged_files,
    })))
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

    // Create a tar.gz archive in memory.
    // For true streaming with large files, we would need a more complex setup.
    // Here we use spawn_blocking for the synchronous tar creation.

    let format = req.format.as_deref().unwrap_or("tar.gz");
    let workspace_path = state.config.workspace_path.clone();

    match format {
        "tar" => {
            let tar_data = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, AppError> {
                let mut tar = tar::Builder::new(Vec::new());
                for path in valid_paths {
                    let rel_path = match path.strip_prefix(&workspace_path) {
                        Ok(p) => p,
                        Err(_) => {
                            std::path::Path::new(path.file_name().unwrap_or(path.as_os_str()))
                        }
                    };
                    if path.is_dir() {
                        tar.append_dir_all(rel_path, &path).map_err(|e| {
                            AppError::InternalServerError(format!("Failed to append dir: {}", e))
                        })?;
                    } else {
                        tar.append_path_with_name(&path, rel_path).map_err(|e| {
                            AppError::InternalServerError(format!("Failed to append file: {}", e))
                        })?;
                    }
                }
                tar.finish().map_err(|e| {
                    AppError::InternalServerError(format!("Failed to finish tar: {}", e))
                })?;
                tar.into_inner().map_err(|e| {
                    AppError::InternalServerError(format!("Failed to get tar data: {}", e))
                })
            })
            .await
            .map_err(|e| AppError::InternalServerError(format!("Task join error: {}", e)))??;

            let headers = [
                (header::CONTENT_TYPE, "application/x-tar".to_string()),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"download.tar\"".to_string(),
                ),
            ];
            Ok((headers, tar_data).into_response())
        }
        "multipart" | "mixed" => {
            let boundary = crate::utils::common::generate_id();
            let mut body = Vec::new();

            // Use a stack for recursive traversal
            let mut stack = valid_paths.clone();

            while let Some(path) = stack.pop() {
                if path.is_dir() {
                    let mut entries = fs::read_dir(&path).await?;
                    while let Some(entry) = entries.next_entry().await? {
                        stack.push(entry.path());
                    }
                } else {
                    let mime = crate::utils::common::mime_guess(&path);

                    let content = fs::read(&path).await.map_err(|e| {
                        AppError::InternalServerError(format!("Failed to read file: {}", e))
                    })?;

                    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
                    body.extend_from_slice(
                        format!(
                            "Content-Disposition: attachment; filename=\"{}\"\r\n",
                            path.to_string_lossy()
                        )
                        .as_bytes(),
                    );
                    body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", mime).as_bytes());
                    body.extend_from_slice(&content);
                    body.extend_from_slice(b"\r\n");
                }
            }
            body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

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
            let tar_data = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, AppError> {
                let mut enc = GzEncoder::new(Vec::new(), Compression::default());
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
                            tar.append_dir_all(rel_path, &path).map_err(|e| {
                                AppError::InternalServerError(format!(
                                    "Failed to append dir: {}",
                                    e
                                ))
                            })?;
                        } else {
                            tar.append_path_with_name(&path, rel_path).map_err(|e| {
                                AppError::InternalServerError(format!(
                                    "Failed to append file: {}",
                                    e
                                ))
                            })?;
                        }
                    }
                    tar.finish().map_err(|e| {
                        AppError::InternalServerError(format!("Failed to finish tar: {}", e))
                    })?;
                }
                enc.finish().map_err(|e| {
                    AppError::InternalServerError(format!("Failed to finish gzip: {}", e))
                })
            })
            .await
            .map_err(|e| AppError::InternalServerError(format!("Task join error: {}", e)))??;

            let headers = [
                (header::CONTENT_TYPE, "application/gzip".to_string()),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"download.tar.gz\"".to_string(),
                ),
            ];
            Ok((headers, tar_data).into_response())
        }
    }
}

#[derive(Deserialize)]
pub struct DeleteFileRequest {
    path: String,
    #[serde(default)]
    recursive: bool,
}

pub async fn delete_file(
    State(state): State<Arc<AppState>>,
    Json(req): Json<DeleteFileRequest>,
) -> Result<Json<ApiResponse<FileOperationResponse>>, AppError> {
    let valid_path = validate_path(&state.config.workspace_path, &req.path)?;

    if !valid_path.exists() {
        return Err(AppError::NotFound("File not found".to_string()));
    }

    if valid_path.is_dir() {
        if req.recursive {
            fs::remove_dir_all(valid_path).await?;
        } else {
            fs::remove_dir(valid_path).await?;
        }
    } else {
        fs::remove_file(valid_path).await?;
    }

    Ok(Json(ApiResponse::success(FileOperationResponse {
        success: true,
    })))
}

#[derive(Deserialize)]
pub struct WriteFileRequest {
    path: String,
    content: String,
    encoding: Option<String>,
}

pub async fn write_file_json(
    State(state): State<Arc<AppState>>,
    Json(req): Json<WriteFileRequest>,
) -> Result<Json<ApiResponse<WriteFileResponse>>, AppError> {
    let valid_path = validate_path(&state.config.workspace_path, &req.path)?;

    let content_bytes = if let Some(enc) = req.encoding {
        if enc == "base64" {
            use base64::{engine::general_purpose, Engine as _};
            general_purpose::STANDARD
                .decode(&req.content)
                .map_err(|e| AppError::BadRequest(format!("Invalid base64: {}", e)))?
        } else {
            req.content.into_bytes()
        }
    } else {
        req.content.into_bytes()
    };

    if content_bytes.len() as u64 > state.config.max_file_size {
        return Err(AppError::BadRequest("File too large".to_string()));
    }

    if let Some(parent) = valid_path.parent() {
        ensure_directory(parent).await?;
    }

    fs::write(&valid_path, content_bytes).await?;

    Ok(Json(ApiResponse::success(WriteFileResponse {
        path: valid_path.to_string_lossy().to_string(),
        size: fs::metadata(&valid_path).await?.len(),
    })))
}

pub async fn write_file_multipart(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<WriteFileResponse>>, AppError> {
    let mut target_path = None;
    let mut file_saved = false;
    let mut saved_size = 0;
    let mut saved_path = PathBuf::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();

        if name == "path" {
            let val = field
                .text()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;
            target_path = Some(val);
        } else if name == "file" || name == "files" {
            let filename = field.file_name().unwrap_or("unknown").to_string();
            let path_str = target_path.clone().unwrap_or_else(|| filename.clone());
            let valid_path = validate_path(&state.config.workspace_path, &path_str)?;

            if let Some(parent) = valid_path.parent() {
                ensure_directory(parent).await?;
            }

            let mut file = fs::File::create(&valid_path).await?;
            let mut size = 0;

            let mut stream = field;
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| AppError::InternalServerError(e.to_string()))?;
                size += chunk.len() as u64;
                if size > state.config.max_file_size {
                    drop(file);
                    fs::remove_file(&valid_path).await.ok();
                    return Err(AppError::BadRequest("File too large".to_string()));
                }
                file.write_all(&chunk).await?;
            }

            file_saved = true;
            saved_size = size;
            saved_path = valid_path;
        }
    }

    if !file_saved {
        return Err(AppError::BadRequest(
            "No file found in multipart form".to_string(),
        ));
    }

    Ok(Json(ApiResponse::success(WriteFileResponse {
        path: saved_path.to_string_lossy().to_string(),
        size: saved_size,
    })))
}

pub async fn write_file_binary(
    State(state): State<Arc<AppState>>,
    Query(params): Query<std::collections::HashMap<String, String>>,
    body: Body,
) -> Result<Json<ApiResponse<WriteFileResponse>>, AppError> {
    let path_str = params
        .get("path")
        .ok_or_else(|| AppError::BadRequest("Path parameter required".to_string()))?;
    let valid_path = validate_path(&state.config.workspace_path, path_str)?;

    if let Some(parent) = valid_path.parent() {
        ensure_directory(parent).await?;
    }

    let mut file = fs::File::create(&valid_path).await?;
    let mut size = 0;

    let mut stream = body.into_data_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::InternalServerError(e.to_string()))?;
        size += chunk.len() as u64;
        if size > state.config.max_file_size {
            drop(file);
            fs::remove_file(&valid_path).await.ok();
            return Err(AppError::BadRequest("File too large".to_string()));
        }
        file.write_all(&chunk).await?;
    }

    Ok(Json(ApiResponse::success(WriteFileResponse {
        path: valid_path.to_string_lossy().to_string(),
        size,
    })))
}

#[derive(Deserialize)]
pub struct ReadFileParams {
    path: String,
}

pub async fn read_file(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ReadFileParams>,
) -> Result<Response, AppError> {
    let valid_path = validate_path(&state.config.workspace_path, &params.path)?;

    if !valid_path.exists() {
        return Err(AppError::NotFound("File not found".to_string()));
    }

    if valid_path.is_dir() {
        return Err(AppError::BadRequest(
            "Path is a directory, not a file".to_string(),
        ));
    }

    let file = fs::File::open(&valid_path).await?;
    let metadata = file.metadata().await?;
    let size = metadata.len();
    let filename = valid_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let mime_type = crate::utils::common::mime_guess(&valid_path).to_string();

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let headers = [
        (header::CONTENT_TYPE, mime_type),
        (header::CONTENT_LENGTH, size.to_string()),
        (
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", filename),
        ),
    ];

    Ok((headers, body).into_response())
}

#[derive(Deserialize)]
pub struct MoveFileRequest {
    source: String,
    destination: String,
    #[serde(default)]
    overwrite: bool,
}

pub async fn move_file(
    State(state): State<Arc<AppState>>,
    Json(req): Json<MoveFileRequest>,
) -> Result<Json<ApiResponse<FileOperationResponse>>, AppError> {
    let source_path = validate_path(&state.config.workspace_path, &req.source)?;
    let dest_path = validate_path(&state.config.workspace_path, &req.destination)?;

    if !source_path.exists() {
        return Err(AppError::NotFound("Source file not found".to_string()));
    }

    if dest_path.exists() {
        if !req.overwrite {
            return Err(AppError::Conflict("Destination already exists".to_string()));
        }
        if dest_path.is_dir() {
            fs::remove_dir_all(&dest_path).await?;
        } else {
            fs::remove_file(&dest_path).await?;
        }
    }

    if let Some(parent) = dest_path.parent() {
        ensure_directory(parent).await?;
    }

    fs::rename(source_path, dest_path).await?;

    Ok(Json(ApiResponse::success(FileOperationResponse {
        success: true,
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameFileRequest {
    old_path: String,
    new_path: String,
}

pub async fn rename_file(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RenameFileRequest>,
) -> Result<Json<ApiResponse<FileOperationResponse>>, AppError> {
    let old_path = validate_path(&state.config.workspace_path, &req.old_path)?;
    let new_path = validate_path(&state.config.workspace_path, &req.new_path)?;

    if !old_path.exists() {
        return Err(AppError::NotFound("Old path not found".to_string()));
    }

    if new_path.exists() {
        return Err(AppError::Conflict("New path already exists".to_string()));
    }

    if let Some(parent) = new_path.parent() {
        ensure_directory(parent).await?;
    }

    fs::rename(old_path, new_path).await?;

    Ok(Json(ApiResponse::success(FileOperationResponse {
        success: true,
    })))
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
