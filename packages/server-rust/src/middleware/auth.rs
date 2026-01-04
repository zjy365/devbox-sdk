use axum::{
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

pub async fn auth_middleware(
    // We can't easily extract State in middleware without some boilerplate or using `axum::middleware::from_fn_with_state`.
    // We'll assume this is used with `from_fn_with_state`.
    axum::extract::State(state): axum::extract::State<Arc<crate::state::AppState>>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Skip auth for health checks
    let path = req.uri().path();
    if path == "/health" || path == "/health/live" || path == "/health/ready" {
        return Ok(next.run(req).await);
    }

    // Check Authorization header
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());

    match auth_header {
        Some(header_value) if header_value.starts_with("Bearer ") => {
            let token = &header_value[7..];
            if let Some(expected_token) = &state.config.token {
                if token == expected_token {
                    return Ok(next.run(req).await);
                }
            } else {
                // If no token is configured (shouldn't happen with our config logic), allow?
                // Or if we decided to allow no-auth mode.
                // Our config logic generates a token if missing, so we should always have one.
                // But if the user explicitly set it to empty string?
                // Let's assume strict auth if token is present.
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
        _ => {}
    }

    Err(StatusCode::UNAUTHORIZED)
}
