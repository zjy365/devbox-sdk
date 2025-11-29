use crate::error::AppError;
use crate::response::ApiResponse;
use crate::state::{process::ProcessInfo, AppState};
use crate::utils::path::validate_path;
use axum::response::sse::{Event, Sse};
use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Response},
    Json,
};
use futures::stream::{self, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::io::ErrorKind;
use std::os::unix::process::ExitStatusExt;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

#[derive(Deserialize)]
pub struct ExecProcessRequest {
    command: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<std::collections::HashMap<String, String>>,
    shell: Option<String>,
    timeout: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecProcessResponse {
    process_id: String,
    pid: Option<u32>,
    process_status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListProcessesResponse {
    processes: Vec<crate::state::process::ProcessStatus>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOperationResponse {
    success: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessLogsResponse {
    process_id: String,
    pid: Option<u32>,
    process_status: String,
    exit_code: Option<i32>,
    logs: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamStartEvent {
    timestamp: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamOutputEvent {
    output: String,
    timestamp: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamCompleteEvent {
    exit_code: Option<i32>,
    duration: i64,
    timestamp: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamErrorEvent {
    error: String,
    duration_ms: i64,
    timestamp: String,
}

pub async fn exec_process(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ExecProcessRequest>,
) -> Result<Json<ApiResponse<ExecProcessResponse>>, AppError> {
    let mut cmd = if let Some(shell) = &req.shell {
        let mut c = Command::new(shell);
        c.arg("-c");
        let mut cmd_str = req.command.clone();
        if let Some(args) = &req.args {
            for arg in args {
                cmd_str.push(' ');
                cmd_str.push_str(&crate::utils::common::shell_escape(arg));
            }
        }
        c.arg(cmd_str);
        c
    } else {
        if let Some(args) = &req.args {
            let mut c = Command::new(&req.command);
            c.args(args);
            c
        } else {
            let parts: Vec<&str> = req.command.split_whitespace().collect();
            if parts.len() > 1 {
                let mut c = Command::new(parts[0]);
                c.args(&parts[1..]);
                c
            } else {
                Command::new(&req.command)
            }
        }
    };

    if let Some(cwd) = &req.cwd {
        let valid_cwd = validate_path(&state.config.workspace_path, cwd)?;
        cmd.current_dir(valid_cwd);
    }

    if let Some(env) = &req.env {
        cmd.envs(env);
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let child_result = cmd.spawn();

    let mut child = match child_result {
        Ok(c) => c,
        Err(e) => {
            // Return error response instead of propagating error (matching Go behavior)
            return Err(AppError::OperationError(
                format!("Failed to spawn process: {}", e),
                serde_json::Value::Object(serde_json::Map::new()),
            ));
        }
    };
    let pid = child.id();
    let process_id = crate::utils::common::generate_id();

    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let (tx, _rx) = tokio::sync::broadcast::channel(100);

    let process_info = ProcessInfo::new(
        process_id.clone(),
        pid,
        req.command.clone(),
        Some(child),
        tx.clone(),
    );

    {
        let mut processes = state.processes.write().await;
        processes.insert(process_id.clone(), process_info);
    }

    let state_clone = state.clone();
    let pid_clone = process_id.clone();
    let tx_clone = tx.clone();

    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        pump_log(reader, pid_clone, state_clone, tx_clone, "[stdout]").await;
    });

    let state_clone_err = state.clone();
    let pid_clone_err = process_id.clone();
    let tx_clone_err = tx.clone();

    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        pump_log(
            reader,
            pid_clone_err,
            state_clone_err,
            tx_clone_err,
            "[stderr]",
        )
        .await;
    });

    let state_clone_cleanup = state.clone();
    let pid_clone_cleanup = process_id.clone();
    let timeout_val = req.timeout;

    tokio::spawn(async move {
        // Take the child process out of the state to wait on it
        let child = {
            let mut processes = state_clone_cleanup.processes.write().await;
            if let Some(proc) = processes.get_mut(&pid_clone_cleanup) {
                proc.child.take()
            } else {
                None
            }
        };

        if let Some(mut child) = child {
            let wait_result = if let Some(t) = timeout_val {
                match timeout(Duration::from_secs(t), child.wait()).await {
                    Ok(res) => res,
                    Err(_) => {
                        let _ = child.start_kill();
                        child.wait().await
                    }
                }
            } else {
                child.wait().await
            };

            // Update status
            {
                let mut processes = state_clone_cleanup.processes.write().await;
                if let Some(proc) = processes.get_mut(&pid_clone_cleanup) {
                    match wait_result {
                        Ok(status) => {
                            if status.success() {
                                proc.status = "completed".to_string();
                            } else if status.signal().is_some() {
                                proc.status = "killed".to_string();
                            } else {
                                proc.status = "failed".to_string();
                            }
                            proc.exit_code =
                                status.code().or_else(|| status.signal().map(|s| 128 + s));
                        }
                        Err(_) => {
                            proc.status = "failed".to_string();
                        }
                    }
                    proc.end_time = Some(std::time::SystemTime::now());
                }
            }

            // Cleanup logs and status after 4 hours
            tokio::time::sleep(Duration::from_secs(4 * 60 * 60)).await;

            let mut processes = state_clone_cleanup.processes.write().await;
            processes.remove(&pid_clone_cleanup);
        }
    });

    Ok(Json(ApiResponse::success(ExecProcessResponse {
        process_id,
        pid,
        process_status: "running".to_string(),
    })))
}

pub async fn list_processes(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<ListProcessesResponse>>, AppError> {
    let processes = state.processes.read().await;
    let mut result = Vec::new();

    for proc in processes.values() {
        result.push(proc.to_status());
    }

    Ok(Json(ApiResponse::success(ListProcessesResponse {
        processes: result,
    })))
}

pub async fn get_process_status(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<crate::state::process::ProcessStatus>>, AppError> {
    let processes = state.processes.read().await;
    let proc = processes
        .get(&id)
        .ok_or_else(|| AppError::NotFound("Process not found".to_string()))?;

    Ok(Json(ApiResponse::success(proc.to_status())))
}

pub async fn kill_process(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<ApiResponse<ProcessOperationResponse>>, AppError> {
    let mut processes = state.processes.write().await;
    let proc = processes
        .get_mut(&id)
        .ok_or_else(|| AppError::NotFound("Process not found".to_string()))?;

    // Check if process is running
    if proc.status != "running" {
        return Err(AppError::Conflict("Process is not running".to_string()));
    }

    let signal_str = params
        .get("signal")
        .map(|s| s.as_str())
        .unwrap_or("SIGKILL");
    let signal = match signal_str {
        "SIGTERM" => nix::sys::signal::Signal::SIGTERM,
        "SIGINT" => nix::sys::signal::Signal::SIGINT,
        "SIGHUP" => nix::sys::signal::Signal::SIGHUP,
        _ => nix::sys::signal::Signal::SIGKILL,
    };

    if let Some(pid) = proc.pid {
        nix::sys::signal::kill(nix::unistd::Pid::from_raw(pid as i32), signal).map_err(|e| {
            AppError::InternalServerError(format!("Failed to signal process: {}", e))
        })?;

        if signal == nix::sys::signal::Signal::SIGKILL {
            proc.status = "killed".to_string();
        }
    } else {
        return Err(AppError::NotFound(
            "Process PID not found (process might have exited)".to_string(),
        ));
    }

    Ok(Json(ApiResponse::success(ProcessOperationResponse {
        success: true,
    })))
}

pub async fn get_process_logs(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: axum::http::HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Response, AppError> {
    let processes = state.processes.read().await;
    let proc = processes
        .get(&id)
        .ok_or_else(|| AppError::NotFound("Process not found".to_string()))?;

    let tail = params.get("tail").and_then(|t| t.parse::<usize>().ok());

    let is_sse = headers
        .get(axum::http::header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        == Some("text/event-stream")
        || params.get("stream").map(|s| s.as_str()) == Some("true");

    if is_sse {
        let rx = proc.log_broadcast.subscribe();
        let logs = proc.logs.read().await.clone();

        let start_index = if let Some(t) = tail {
            if t < logs.len() {
                logs.len() - t
            } else {
                0
            }
        } else {
            0
        };

        let existing_logs_stream = tokio_stream::iter(
            logs.into_iter()
                .skip(start_index)
                .map(|l| Ok::<Event, Infallible>(Event::default().data(l))),
        );
        let broadcast_stream = tokio_stream::wrappers::BroadcastStream::new(rx).map(|r| match r {
            Ok(l) => Ok(Event::default().data(l)),
            Err(_) => Ok(Event::default().event("error").data("stream error")),
        });

        let stream = existing_logs_stream.chain(broadcast_stream);

        return Ok(Sse::new(stream)
            .keep_alive(axum::response::sse::KeepAlive::default())
            .into_response());
    }

    let logs = proc.logs.read().await;
    let result_logs: Vec<String> = if let Some(t) = tail {
        if t < logs.len() {
            logs.iter().skip(logs.len() - t).cloned().collect()
        } else {
            logs.clone().into()
        }
    } else {
        logs.clone().into()
    };

    let status = proc.to_status();

    Ok(Json(ApiResponse::success(ProcessLogsResponse {
        process_id: status.process_id,
        pid: status.pid,
        process_status: status.process_status,
        exit_code: status.exit_code,
        logs: result_logs,
    }))
    .into_response())
}

#[derive(Deserialize)]
pub struct SyncExecutionRequest {
    command: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<std::collections::HashMap<String, String>>,
    shell: Option<String>,
    timeout: Option<u64>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncExecutionResponse {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    duration_ms: u128,
    start_time: String,
    end_time: String,
}

pub async fn exec_process_sync(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SyncExecutionRequest>,
) -> Result<Json<ApiResponse<SyncExecutionResponse>>, AppError> {
    let start_time = crate::utils::common::format_time(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("Time went backwards")
            .as_secs(),
    );
    let start_instant = std::time::Instant::now();

    let mut cmd = if let Some(shell) = &req.shell {
        let mut c = Command::new(shell);
        c.arg("-c");
        let mut cmd_str = req.command.clone();
        if let Some(args) = &req.args {
            for arg in args {
                cmd_str.push(' ');
                cmd_str.push_str(&crate::utils::common::shell_escape(arg));
            }
        }
        c.arg(cmd_str);
        c
    } else {
        let mut c = Command::new(&req.command);
        if let Some(args) = &req.args {
            c.args(args);
        }
        c
    };

    if let Some(cwd) = req.cwd {
        let valid_cwd = validate_path(&state.config.workspace_path, &cwd)?;
        cmd.current_dir(valid_cwd);
    }

    if let Some(env) = req.env {
        cmd.envs(env);
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let time_limit = Duration::from_secs(req.timeout.unwrap_or(30));

    let child_result = cmd.spawn();

    match child_result {
        Ok(child) => {
            let output_result = timeout(time_limit, child.wait_with_output()).await;

            let end_time = crate::utils::common::format_time(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .expect("Time went backwards")
                    .as_secs(),
            );
            let duration_ms = start_instant.elapsed().as_millis();

            match output_result {
                Ok(Ok(output)) => Ok(Json(ApiResponse::success(SyncExecutionResponse {
                    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                    exit_code: output.status.code(),
                    duration_ms,
                    start_time,
                    end_time,
                }))),
                Ok(Err(e)) => Err(AppError::InternalServerError(format!(
                    "Failed to wait for process: {}",
                    e
                ))),
                Err(_) => Err(AppError::InternalServerError(
                    "Process execution timed out".to_string(),
                )),
            }
        }
        Err(e) => {
            let stderr_message = if e.kind() == ErrorKind::NotFound {
                format!(
                    "exec: \"{}\": executable file not found in $PATH",
                    req.command
                )
            } else {
                e.to_string()
            };

            let end_time = crate::utils::common::format_time(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .expect("Time went backwards")
                    .as_secs(),
            );
            let duration_ms = start_instant.elapsed().as_millis();
            let response = SyncExecutionResponse {
                stdout: "".to_string(),
                stderr: stderr_message,
                exit_code: Some(127),
                duration_ms,
                start_time,
                end_time,
            };
            Err(AppError::OperationError(
                "".to_string(),
                serde_json::to_value(response).unwrap(),
            ))
        }
    }
}

#[derive(Deserialize, Clone)]
pub struct SyncStreamExecutionRequest {
    command: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<std::collections::HashMap<String, String>>,
    shell: Option<String>,
    timeout: Option<u64>,
}

pub async fn exec_process_sync_stream(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SyncStreamExecutionRequest>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = stream::unfold(
        (state, req, false), // state, req, has_started
        move |(state, req, has_started)| async move {
            if has_started {
                return None;
            }

            let (tx, rx) = tokio::sync::mpsc::channel(100);
            let tx_stdout = tx.clone();
            let tx_stderr = tx.clone();

            let state_for_task = state.clone();
            let req_for_task = req.clone();

            tokio::spawn(async move {
                let start_time = crate::utils::common::format_time(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .expect("Time went backwards")
                        .as_secs(),
                );
                let _ = tx
                    .send(Ok(Event::default().event("start").data(
                        serde_json::to_string(&StreamStartEvent {
                            timestamp: start_time,
                        })
                        .unwrap(),
                    )))
                    .await;

                let mut cmd = if let Some(shell) = &req_for_task.shell {
                    let mut c = Command::new(shell);
                    c.arg("-c");
                    let mut cmd_str = req_for_task.command.clone();
                    if let Some(args) = &req_for_task.args {
                        for arg in args {
                            cmd_str.push(' ');
                            cmd_str.push_str(&crate::utils::common::shell_escape(arg));
                        }
                    }
                    c.arg(cmd_str);
                    c
                } else {
                    let mut c = Command::new(&req_for_task.command);
                    if let Some(args) = &req_for_task.args {
                        c.args(args);
                    }
                    c
                };

                if let Some(cwd) = &req_for_task.cwd {
                    if let Ok(valid_cwd) = validate_path(&state_for_task.config.workspace_path, cwd)
                    {
                        cmd.current_dir(valid_cwd);
                    }
                }

                if let Some(env) = &req_for_task.env {
                    cmd.envs(env);
                }

                cmd.stdout(Stdio::piped());
                cmd.stderr(Stdio::piped());

                let time_limit = Duration::from_secs(req_for_task.timeout.unwrap_or(300));
                let start_instant = std::time::Instant::now();

                match cmd.spawn() {
                    Ok(mut child) => {
                        let stdout = child.stdout.take();
                        let stderr = child.stderr.take();

                        if let Some(stdout) = stdout {
                            let tx = tx_stdout.clone();
                            tokio::spawn(async move {
                                let mut reader = BufReader::new(stdout);
                                let mut line = String::new();
                                while let Ok(n) = reader.read_line(&mut line).await {
                                    if n == 0 {
                                        break;
                                    }
                                    let _ = tx
                                        .send(Ok(Event::default().event("stdout").data(
                                            serde_json::to_string(&StreamOutputEvent {
                                                output: line.clone(),
                                                timestamp: crate::utils::common::format_time(
                                                    std::time::SystemTime::now()
                                                        .duration_since(std::time::UNIX_EPOCH)
                                                        .expect("Time went backwards")
                                                        .as_secs(),
                                                ),
                                            })
                                            .unwrap(),
                                        )))
                                        .await;
                                    line.clear();
                                }
                            });
                        }

                        if let Some(stderr) = stderr {
                            let tx = tx_stderr.clone();
                            tokio::spawn(async move {
                                let mut reader = BufReader::new(stderr);
                                let mut line = String::new();
                                while let Ok(n) = reader.read_line(&mut line).await {
                                    if n == 0 {
                                        break;
                                    }
                                    let _ = tx
                                        .send(Ok(Event::default().event("stderr").data(
                                            serde_json::to_string(&StreamOutputEvent {
                                                output: line.clone(),
                                                timestamp: crate::utils::common::format_time(
                                                    std::time::SystemTime::now()
                                                        .duration_since(std::time::UNIX_EPOCH)
                                                        .expect("Time went backwards")
                                                        .as_secs(),
                                                ),
                                            })
                                            .unwrap(),
                                        )))
                                        .await;
                                    line.clear();
                                }
                            });
                        }

                        let wait_result = timeout(time_limit, child.wait()).await;
                        let duration = start_instant.elapsed().as_millis() as i64;

                        match wait_result {
                            Ok(Ok(status)) => {
                                let _ = tx
                                    .send(Ok(Event::default().event("complete").data(
                                        serde_json::to_string(&StreamCompleteEvent {
                                            exit_code: status.code(),
                                            duration,
                                            timestamp: crate::utils::common::format_time(
                                                std::time::SystemTime::now()
                                                    .duration_since(std::time::UNIX_EPOCH)
                                                    .expect("Time went backwards")
                                                    .as_secs(),
                                            ),
                                        })
                                        .unwrap(),
                                    )))
                                    .await;
                            }
                            Ok(Err(e)) => {
                                let _ = tx
                                    .send(Ok(Event::default().event("error").data(
                                        serde_json::to_string(&StreamErrorEvent {
                                            error: e.to_string(),
                                            duration_ms: duration,
                                            timestamp: crate::utils::common::format_time(
                                                std::time::SystemTime::now()
                                                    .duration_since(std::time::UNIX_EPOCH)
                                                    .expect("Time went backwards")
                                                    .as_secs(),
                                            ),
                                        })
                                        .unwrap(),
                                    )))
                                    .await;
                            }
                            Err(_) => {
                                let _ = child.start_kill();
                                let _ = tx
                                    .send(Ok(Event::default().event("error").data(
                                        serde_json::to_string(&StreamErrorEvent {
                                            error: "Execution timeout".to_string(),
                                            duration_ms: duration,
                                            timestamp: crate::utils::common::format_time(
                                                std::time::SystemTime::now()
                                                    .duration_since(std::time::UNIX_EPOCH)
                                                    .expect("Time went backwards")
                                                    .as_secs(),
                                            ),
                                        })
                                        .unwrap(),
                                    )))
                                    .await;
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx
                            .send(Ok(Event::default().event("error").data(
                                serde_json::to_string(&StreamErrorEvent {
                                    error: e.to_string(),
                                    duration_ms: 0,
                                    timestamp: crate::utils::common::format_time(
                                        std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .expect("Time went backwards")
                                            .as_secs(),
                                    ),
                                })
                                .unwrap(),
                            )))
                            .await;
                    }
                }
            });

            let stream = tokio_stream::wrappers::ReceiverStream::new(rx);
            Some((stream, (state, req, true)))
        },
    );

    // Flatten the stream of streams
    let flattened = stream.flatten();
    Sse::new(flattened).keep_alive(axum::response::sse::KeepAlive::default())
}

async fn pump_log<R: tokio::io::AsyncRead + Unpin>(
    reader: BufReader<R>,
    pid: String,
    state: Arc<AppState>,
    tx: tokio::sync::broadcast::Sender<String>,
    prefix: &str,
) {
    let mut reader = reader;
    let mut line = String::new();
    const MAX_LOG_LINES: usize = 10000;

    while let Ok(n) = reader.read_line(&mut line).await {
        if n == 0 {
            break;
        }
        let log_entry = format!("{} {}", prefix, line);
        if let Some(proc) = state.processes.read().await.get(&pid) {
            let mut logs = proc.logs.write().await;
            if logs.len() >= MAX_LOG_LINES {
                logs.pop_front();
            }
            logs.push_back(log_entry.clone());
        }
        let _ = tx.send(log_entry);
        line.clear();
    }
}
