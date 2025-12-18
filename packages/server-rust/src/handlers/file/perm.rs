use crate::error::AppError;
use crate::response::ApiResponse;
use crate::state::AppState;
use crate::utils::path::validate_path;
use axum::{extract::State, Json};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::fs;

use super::types::FileOperationResponse;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChmodRequest {
    path: String,
    mode: String,
    #[serde(default)]
    recursive: bool,
    #[serde(default)]
    owner: Option<String>, // numeric forms: "uid" or "uid:gid"
}

#[cfg(unix)]
fn parse_mode(mode_str: &str) -> Result<u32, AppError> {
    let s = mode_str.trim();
    if s.is_empty() {
        return Err(AppError::BadRequest("Mode cannot be empty".to_string()));
    }

    // Accept forms like "755", "0755", or with 0o prefix
    let trimmed = s.strip_prefix("0o").or_else(|| s.strip_prefix("0O")).unwrap_or(s);
    u32::from_str_radix(trimmed, 8).map_err(|_| AppError::BadRequest("Invalid mode (expect octal like 755)".to_string()))
}

#[cfg(unix)]
async fn chmod_path(path: &Path, mode: u32) -> Result<(), AppError> {
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(mode & 0o777);
    fs::set_permissions(path, perms).await?;
    Ok(())
}

#[cfg(unix)]
async fn chmod_recursive(root: &Path, mode: u32) -> Result<(), AppError> {
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(p) = stack.pop() {
        // Set permission for current path
        let _ = chmod_path(&p, mode).await;

        // If directory, push children
        if let Ok(meta) = fs::metadata(&p).await {
            if meta.is_dir() {
                let mut rd = match fs::read_dir(&p).await {
                    Ok(rd) => rd,
                    Err(_) => continue,
                };
                while let Ok(Some(entry)) = rd.next_entry().await {
                    stack.push(entry.path());
                }
            }
        }
    }
    Ok(())
}

#[cfg(unix)]
fn parse_owner(owner: &str) -> Result<(Option<nix::unistd::Uid>, Option<nix::unistd::Gid>), AppError> {
    use nix::unistd::{Gid, Uid};
    let s = owner.trim();
    if s.is_empty() {
        return Err(AppError::BadRequest("Owner cannot be empty".to_string()));
    }

    let mut parts = s.split(':');
    let user_part = parts.next().unwrap_or("");
    let group_part = parts.next();

    // Resolve UID: try numeric first, else by name
    let uid = if user_part.is_empty() {
        None
    } else if let Ok(val) = user_part.parse::<u32>() {
        Some(Uid::from_raw(val))
    } else {
        // resolve by username
        match nix::unistd::User::from_name(user_part)
            .map_err(|e| AppError::InternalServerError(e.to_string()))? {
            Some(u) => Some(u.uid),
            None => return Err(AppError::BadRequest(format!("User not found: {}", user_part))),
        }
    };

    // Resolve GID: try numeric first, else by name
    let gid = match group_part {
        None => None,
        Some(g) if g.is_empty() => None,
        Some(g) => {
            if let Ok(val) = g.parse::<u32>() {
                Some(Gid::from_raw(val))
            } else {
                match nix::unistd::Group::from_name(g)
                    .map_err(|e| AppError::InternalServerError(e.to_string()))? {
                    Some(gr) => Some(gr.gid),
                    None => return Err(AppError::BadRequest(format!("Group not found: {}", g))),
                }
            }
        }
    };

    Ok((uid, gid))
}

#[cfg(unix)]
async fn chown_path(path: &Path, owner: Option<&str>) -> Result<(), AppError> {
    if let Some(o) = owner {
        use nix::unistd::chown;
        let (uid, gid) = parse_owner(o)?;
        chown(path, uid, gid).map_err(|e| AppError::InternalServerError(e.to_string()))?;
    }
    Ok(())
}

#[cfg(unix)]
async fn chown_recursive(root: &Path, owner: Option<&str>) -> Result<(), AppError> {
    if owner.is_none() { return Ok(()); }
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(p) = stack.pop() {
        let _ = chown_path(&p, owner).await;
        if let Ok(meta) = fs::metadata(&p).await {
            if meta.is_dir() {
                let mut rd = match fs::read_dir(&p).await { Ok(rd) => rd, Err(_) => continue };
                while let Ok(Some(entry)) = rd.next_entry().await {
                    stack.push(entry.path());
                }
            }
        }
    }
    Ok(())
}

pub async fn change_permissions(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ChmodRequest>,
) -> Result<Json<ApiResponse<FileOperationResponse>>, AppError> {
    let target = validate_path(&state.config.workspace_path, &req.path)?;

    if !target.exists() {
        return Err(AppError::NotFound("Path not found".to_string()));
    }

    let mode = parse_mode(&req.mode)?;

    if req.recursive {
        chmod_recursive(&target, mode).await?;
        chown_recursive(&target, req.owner.as_deref()).await?;
    } else {
        chmod_path(&target, mode).await?;
        chown_path(&target, req.owner.as_deref()).await?;
    }

    Ok(Json(ApiResponse::success(FileOperationResponse { success: true })))
}
