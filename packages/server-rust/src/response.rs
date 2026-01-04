use serde::{Serialize, Serializer};

#[derive(Debug, Clone, Copy, PartialEq)]
#[allow(dead_code)]
pub enum Status {
    Success = 0,
    Panic = 500,
    ValidationError = 1400,
    NotFound = 1404,
    Unauthorized = 1401,
    Forbidden = 1403,
    InvalidRequest = 1422,
    InternalError = 1500,
    Conflict = 1409,
    OperationError = 1600,
}

impl Serialize for Status {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u16(*self as u16)
    }
}

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub status: Status,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub message: String,
    #[serde(flatten)]
    pub data: T,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            status: Status::Success,
            message: "success".to_string(),
            data,
        }
    }

    pub fn error(status: Status, message: String, data: T) -> Self {
        Self {
            status,
            message,
            data,
        }
    }
}
