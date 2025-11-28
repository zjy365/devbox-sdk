use crate::handlers::{file, health, port, process, session, websocket};
use crate::middleware::{auth, logging};
use crate::state::AppState;
use axum::{
    extract::{FromRequest, Request},
    middleware,
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use std::sync::Arc;

pub fn create_router(state: AppState) -> Router {
    let state = Arc::new(state);

    let api_routes = Router::new()
        // File routes
        .route("/files/list", get(file::list_files))
        .route("/files/read", get(file::read_file))
        .route("/files/download", get(file::read_file)) // Alias for read
        .route("/files/delete", post(file::delete_file))
        .route(
            "/files/write",
            post(handle_write_file).layer(axum::extract::DefaultBodyLimit::disable()),
        )
        .route(
            "/files/batch-upload",
            post(file::batch_upload).layer(axum::extract::DefaultBodyLimit::disable()),
        )
        .route("/files/batch-download", post(file::batch_download))
        .route("/files/move", post(file::move_file))
        .route("/files/rename", post(file::rename_file))
        // Process routes
        .route("/process/exec", post(process::exec_process))
        .route("/process/exec-sync", post(process::exec_process_sync))
        .route(
            "/process/sync-stream",
            post(process::exec_process_sync_stream),
        )
        .route("/process/list", get(process::list_processes))
        .route("/process/{id}/status", get(process::get_process_status))
        .route("/process/{id}/kill", post(process::kill_process))
        .route("/process/{id}/logs", get(process::get_process_logs))
        // Session routes
        .route("/sessions/create", post(session::create_session))
        .route("/sessions", get(session::list_sessions))
        .route("/sessions/{id}", get(session::get_session))
        .route("/sessions/{id}/env", post(session::update_session_env))
        .route("/sessions/{id}/exec", post(session::session_exec))
        .route("/sessions/{id}/cd", post(session::session_cd))
        .route("/sessions/{id}/terminate", post(session::terminate_session))
        .route("/sessions/{id}/logs", get(session::get_session_logs))
        // Port routes
        .route("/ports", get(port::get_ports));

    Router::new()
        .route("/health", get(health::health_check))
        .route("/health/ready", get(health::readiness_check))
        .route("/ws", get(websocket::ws_handler))
        .nest("/api/v1", api_routes)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::auth_middleware,
        ))
        .layer(middleware::from_fn(logging::logging_middleware))
        .with_state(state)
}

async fn handle_write_file(
    state: axum::extract::State<Arc<AppState>>,
    req: Request,
) -> Result<Response, crate::error::AppError> {
    let content_type = req
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if content_type.starts_with("application/json") {
        let json_body = axum::Json::<file::WriteFileRequest>::from_request(req, &state)
            .await
            .map_err(|e| crate::error::AppError::BadRequest(e.to_string()))?;

        file::write_file_json(state, json_body)
            .await
            .map(|r| r.into_response())
    } else if content_type.starts_with("multipart/form-data") {
        let multipart = axum::extract::Multipart::from_request(req, &state)
            .await
            .map_err(|e| crate::error::AppError::BadRequest(e.to_string()))?;

        file::write_file_multipart(state, multipart)
            .await
            .map(|r| r.into_response())
    } else {
        // Binary
        let (parts, body) = req.into_parts();
        let req_for_query = Request::from_parts(parts.clone(), axum::body::Body::empty());

        let query =
            axum::extract::Query::<std::collections::HashMap<String, String>>::from_request(
                req_for_query,
                &state,
            )
            .await
            .map_err(|e| crate::error::AppError::BadRequest(e.to_string()))?;

        file::write_file_binary(state, query, body)
            .await
            .map(|r| r.into_response())
    }
}
