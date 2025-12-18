use super::types::{FileOperationResponse, WriteFileResponse};
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
use futures::StreamExt;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;

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
