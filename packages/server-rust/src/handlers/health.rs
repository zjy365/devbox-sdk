use crate::response::ApiResponse;
use crate::state::AppState;
use axum::{extract::State, Json};
use serde::Serialize;
use std::sync::Arc;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckResponse {
    health_status: String,
    uptime: String,
    version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadinessCheckResponse {
    readiness_status: String,
    workspace: bool,
}

pub async fn health_check(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<HealthCheckResponse>> {
    let uptime = state.start_time.elapsed().as_secs();
    Json(ApiResponse::success(HealthCheckResponse {
        health_status: "ok".to_string(),
        uptime: format!("{}s", uptime),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }))
}

pub async fn readiness_check(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<ReadinessCheckResponse>> {
    // Check if workspace path is accessible
    let workspace_accessible = state.config.workspace_path.exists();

    Json(ApiResponse::success(ReadinessCheckResponse {
        readiness_status: if workspace_accessible {
            "ready".to_string()
        } else {
            "not_ready".to_string()
        },
        workspace: workspace_accessible,
    }))
}
