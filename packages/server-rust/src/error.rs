use crate::response::{ApiResponse, Status};
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::fmt;

#[allow(dead_code)]
#[derive(Debug)]
pub enum AppError {
    InternalServerError(String),
    BadRequest(String),
    NotFound(String),
    Unauthorized(String),
    Forbidden(String),
    Conflict(String),
    Validation(String),
    OperationError(String, serde_json::Value),
}

impl std::error::Error for AppError {}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::InternalServerError(msg) => write!(f, "Internal Server Error: {}", msg),
            AppError::BadRequest(msg) => write!(f, "Bad Request: {}", msg),
            AppError::NotFound(msg) => write!(f, "Not Found: {}", msg),
            AppError::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            AppError::Forbidden(msg) => write!(f, "Forbidden: {}", msg),
            AppError::Conflict(msg) => write!(f, "Conflict: {}", msg),
            AppError::Validation(msg) => write!(f, "Validation Error: {}", msg),
            AppError::OperationError(msg, _) => write!(f, "Operation Error: {}", msg),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message, data) = match self {
            AppError::InternalServerError(msg) => (Status::InternalError, msg, json!({})),
            AppError::BadRequest(msg) => (Status::InvalidRequest, msg, json!({})),
            AppError::NotFound(msg) => (Status::NotFound, msg, json!({})),
            AppError::Unauthorized(msg) => (Status::Unauthorized, msg, json!({})),
            AppError::Forbidden(msg) => (Status::Forbidden, msg, json!({})),
            AppError::Conflict(msg) => (Status::Conflict, msg, json!({})),
            AppError::Validation(msg) => (Status::ValidationError, msg, json!({})),
            AppError::OperationError(msg, data) => (Status::OperationError, msg, data),
        };

        let body = Json(ApiResponse::error(status, message, data));

        let http_status = match status {
            Status::Panic => StatusCode::INTERNAL_SERVER_ERROR,
            _ => StatusCode::OK,
        };

        (http_status, body).into_response()
    }
}

// Helper to convert standard errors to AppError
impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => AppError::NotFound(err.to_string()),
            std::io::ErrorKind::PermissionDenied => AppError::Forbidden(err.to_string()),
            _ => AppError::InternalServerError(err.to_string()),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::BadRequest(format!("JSON error: {}", err))
    }
}
