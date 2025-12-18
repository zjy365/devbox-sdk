use super::types::FileInfo;
use crate::error::AppError;
use crate::response::ApiResponse;
use crate::state::AppState;
use crate::utils::path::validate_path;
use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::fs;

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListFilesResponse {
    files: Vec<FileInfo>,
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
