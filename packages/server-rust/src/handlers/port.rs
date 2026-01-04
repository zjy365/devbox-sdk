use crate::error::AppError;
use crate::response::ApiResponse;
use axum::Json;
use serde::Serialize;
use std::sync::Arc;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortsResponse {
    ports: Vec<u16>,
    last_updated_at: i64,
}

pub async fn get_ports(
    axum::extract::State(state): axum::extract::State<Arc<crate::state::AppState>>,
) -> Result<Json<ApiResponse<PortsResponse>>, AppError> {
    let (ports, last_updated) = state.port_monitor.get_ports().await?;

    Ok(Json(ApiResponse::success(PortsResponse {
        ports,
        last_updated_at: last_updated,
    })))
}
