use crate::error::AppError;
use crate::response::ApiResponse;
use crate::state::{session::SessionInfo, AppState};
use crate::utils::path::validate_path;
use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncWriteExt, BufReader};
use tokio::process::Command;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    working_dir: Option<String>,
    env: Option<std::collections::HashMap<String, String>>,
    shell: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionResponse {
    session_id: String,
    shell: String,
    cwd: String,
    session_status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsResponse {
    sessions: Vec<crate::state::session::SessionStatus>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionOperationResponse {
    success: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecResponse {
    exit_code: i32,
    stdout: String,
    stderr: String,
    duration: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCdResponse {
    working_dir: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLogsResponse {
    session_id: String,
    logs: Vec<String>,
}

pub async fn create_session(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSessionRequest>,
) -> Result<Json<ApiResponse<CreateSessionResponse>>, AppError> {
    let shell = req.shell.unwrap_or_else(|| "/bin/bash".to_string());
    let cwd = req
        .working_dir
        .unwrap_or_else(|| state.config.workspace_path.to_string_lossy().to_string());

    let valid_cwd = validate_path(&state.config.workspace_path, &cwd)?;

    let mut cmd = Command::new(&shell);
    cmd.current_dir(&valid_cwd);

    if let Some(env) = req.env.clone() {
        cmd.envs(env);
    }

    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::InternalServerError(format!("Failed to spawn shell: {}", e)))?;
    let session_id = crate::utils::common::generate_id();

    let stdin = child.stdin.take().expect("stdin piped");
    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let (tx, _rx) = tokio::sync::broadcast::channel(100);

    let pid = child.id();

    let session_info = SessionInfo::new(crate::state::session::SessionInitParams {
        id: session_id.clone(),
        pid,
        shell: shell.clone(),
        cwd: valid_cwd.to_string_lossy().to_string(),
        env: req.env.unwrap_or_default(),
        child: Some(child),
        stdin,
        log_broadcast: tx.clone(),
    });

    {
        let mut sessions = state.sessions.write().await;
        sessions.insert(session_id.clone(), session_info);
    }

    let state_clone = state.clone();
    let sid_clone = session_id.clone();
    let tx_clone = tx.clone();

    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        use tokio::io::AsyncBufReadExt;
        const MAX_LOG_LINES: usize = 10000;

        while let Ok(n) = reader.read_line(&mut line).await {
            if n == 0 {
                break;
            }
            let log_entry = format!("[stdout] {}", line);
            if let Some(sess) = state_clone.sessions.read().await.get(&sid_clone) {
                let mut logs = sess.logs.write().await;
                if logs.len() >= MAX_LOG_LINES {
                    logs.pop_front();
                }
                logs.push_back(log_entry.clone());
            }
            let _ = tx_clone.send(log_entry);
            line.clear();
        }
    });

    let state_clone_err = state.clone();
    let sid_clone_err = session_id.clone();
    let tx_clone_err = tx.clone();

    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        use tokio::io::AsyncBufReadExt;
        const MAX_LOG_LINES: usize = 10000;

        while let Ok(n) = reader.read_line(&mut line).await {
            if n == 0 {
                break;
            }
            let log_entry = format!("[stderr] {}", line);
            if let Some(sess) = state_clone_err.sessions.read().await.get(&sid_clone_err) {
                let mut logs = sess.logs.write().await;
                if logs.len() >= MAX_LOG_LINES {
                    logs.pop_front();
                }
                logs.push_back(log_entry.clone());
            }
            let _ = tx_clone_err.send(log_entry);
            line.clear();
        }
    });

    let state_clone_cleanup = state.clone();
    let sid_clone_cleanup = session_id.clone();

    tokio::spawn(async move {
        // Take the child process out of the state to wait on it
        let child = {
            let mut sessions = state_clone_cleanup.sessions.write().await;
            if let Some(sess) = sessions.get_mut(&sid_clone_cleanup) {
                sess.child.take()
            } else {
                None
            }
        };

        if let Some(mut child) = child {
            let _ = child.wait().await;

            // Update status to terminated
            {
                let mut sessions = state_clone_cleanup.sessions.write().await;
                if let Some(sess) = sessions.get_mut(&sid_clone_cleanup) {
                    sess.status = "terminated".to_string();
                }
            }

            // Cleanup logs and status after 30 minutes (1800 seconds)
            tokio::time::sleep(tokio::time::Duration::from_secs(1800)).await;

            let mut sessions = state_clone_cleanup.sessions.write().await;
            sessions.remove(&sid_clone_cleanup);
        }
    });

    Ok(Json(ApiResponse::success(CreateSessionResponse {
        session_id,
        shell,
        cwd: valid_cwd.to_string_lossy().to_string(),
        session_status: "active".to_string(),
    })))
}

pub async fn list_sessions(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<ListSessionsResponse>>, AppError> {
    let sessions = state.sessions.read().await;
    let mut result = Vec::new();

    for sess in sessions.values() {
        result.push(sess.to_status());
    }

    Ok(Json(ApiResponse::success(ListSessionsResponse {
        sessions: result,
    })))
}

pub async fn get_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<crate::state::session::SessionStatus>>, AppError> {
    let sessions = state.sessions.read().await;
    let sess = sessions
        .get(&id)
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    Ok(Json(ApiResponse::success(sess.to_status())))
}

#[derive(Deserialize)]
pub struct UpdateSessionEnvRequest {
    env: std::collections::HashMap<String, String>,
}

pub async fn update_session_env(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateSessionEnvRequest>,
) -> Result<Json<ApiResponse<SessionOperationResponse>>, AppError> {
    let mut sessions = state.sessions.write().await;
    let sess = sessions
        .get_mut(&id)
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    // Update environment variables in session info
    for (k, v) in &req.env {
        sess.env.insert(k.clone(), v.clone());
    }
    sess.last_used_at = std::time::SystemTime::now();

    // Send export commands to shell
    if let Some(stdin) = &mut sess.stdin {
        for (k, v) in &req.env {
            let cmd = format!("export {}={}\n", k, v);
            stdin.write_all(cmd.as_bytes()).await.map_err(|e| {
                AppError::InternalServerError(format!("Failed to write to stdin: {}", e))
            })?;
        }
    }

    Ok(Json(ApiResponse::success(SessionOperationResponse {
        success: true,
    })))
}

#[derive(Deserialize)]
pub struct SessionExecRequest {
    command: String,
}

pub async fn session_exec(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<SessionExecRequest>,
) -> Result<Json<ApiResponse<SessionExecResponse>>, AppError> {
    let mut sessions = state.sessions.write().await;
    let sess = sessions
        .get_mut(&id)
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    if let Some(stdin) = &mut sess.stdin {
        let cmd = format!("{}\n", req.command);
        stdin.write_all(cmd.as_bytes()).await.map_err(|e| {
            AppError::InternalServerError(format!("Failed to write to stdin: {}", e))
        })?;

        let log_entry = format!("[exec] {}", req.command);
        {
            const MAX_LOG_LINES: usize = 10000;
            let mut logs = sess.logs.write().await;
            if logs.len() >= MAX_LOG_LINES {
                logs.pop_front();
            }
            logs.push_back(log_entry.clone());
        }
        let _ = sess.log_broadcast.send(log_entry);
    }

    Ok(Json(ApiResponse::success(SessionExecResponse {
        exit_code: 0,
        stdout: "".to_string(),
        stderr: "".to_string(),
        duration: 0,
    })))
}

#[derive(Deserialize)]
pub struct SessionCdRequest {
    path: String,
}

pub async fn session_cd(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<SessionCdRequest>,
) -> Result<Json<ApiResponse<SessionCdResponse>>, AppError> {
    let mut sessions = state.sessions.write().await;
    let sess = sessions
        .get_mut(&id)
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let current_cwd = std::path::Path::new(&sess.cwd);
    let new_path = if std::path::Path::new(&req.path).is_absolute() {
        validate_path(&state.config.workspace_path, &req.path)?
    } else {
        validate_path(current_cwd, &req.path)?
    };

    if let Some(stdin) = &mut sess.stdin {
        let cmd = format!("cd {}\n", new_path.to_string_lossy());
        stdin.write_all(cmd.as_bytes()).await.map_err(|e| {
            AppError::InternalServerError(format!("Failed to write to stdin: {}", e))
        })?;

        sess.cwd = new_path.to_string_lossy().to_string();

        let log_entry = format!("[cd] {}", new_path.to_string_lossy());
        {
            const MAX_LOG_LINES: usize = 10000;
            let mut logs = sess.logs.write().await;
            if logs.len() >= MAX_LOG_LINES {
                logs.pop_front();
            }
            logs.push_back(log_entry.clone());
        }
        let _ = sess.log_broadcast.send(log_entry);
    }

    Ok(Json(ApiResponse::success(SessionCdResponse {
        working_dir: sess.cwd.clone(),
    })))
}

pub async fn terminate_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<SessionOperationResponse>>, AppError> {
    let mut sessions = state.sessions.write().await;
    let sess = sessions
        .get_mut(&id)
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    if let Some(pid) = sess.pid {
        nix::sys::signal::kill(
            nix::unistd::Pid::from_raw(pid as i32),
            nix::sys::signal::Signal::SIGKILL,
        )
        .map_err(|e| AppError::InternalServerError(format!("Failed to kill session: {}", e)))?;
        sess.status = "terminated".to_string();
    } else {
        return Err(AppError::NotFound(
            "Session PID not found (session might have exited)".to_string(),
        ));
    }

    Ok(Json(ApiResponse::success(SessionOperationResponse {
        success: true,
    })))
}

pub async fn get_session_logs(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<ApiResponse<SessionLogsResponse>>, AppError> {
    let sessions = state.sessions.read().await;
    let sess = sessions
        .get(&id)
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let tail = params.get("tail").and_then(|t| t.parse::<usize>().ok());
    let logs = sess.logs.read().await;

    let result_logs: Vec<String> = if let Some(t) = tail {
        if t < logs.len() {
            logs.iter().skip(logs.len() - t).cloned().collect()
        } else {
            logs.clone().into()
        }
    } else {
        logs.clone().into()
    };

    Ok(Json(ApiResponse::success(SessionLogsResponse {
        session_id: id,
        logs: result_logs,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_session_response_serialization() {
        let response = CreateSessionResponse {
            session_id: "test-id".to_string(),
            shell: "/bin/bash".to_string(),
            cwd: "/home/devbox/project".to_string(),
            session_status: "active".to_string(),
        };

        let json = serde_json::to_string(&response).unwrap();
        println!("Serialized JSON: {}", json);

        assert!(json.contains("\"sessionId\":\"test-id\""));
        assert!(json.contains("\"sessionStatus\":\"active\""));
        assert!(json.contains("\"shell\":\"/bin/bash\""));
        assert!(json.contains("\"cwd\":\"/home/devbox/project\""));
    }
}
