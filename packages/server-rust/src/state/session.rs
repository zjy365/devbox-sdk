use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::SystemTime;
use tokio::process::{Child, ChildStdin};
use tokio::sync::{broadcast, RwLock};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub session_id: String,
    pub shell: String,
    pub cwd: String,
    pub env: HashMap<String, String>,
    pub session_status: String,       // "active", "terminated"
    pub created_at: String,   // RFC3339
    pub last_used_at: String, // RFC3339
}

pub struct SessionInfo {
    pub id: String,
    pub pid: Option<u32>,
    pub child: Option<Child>,
    pub stdin: Option<ChildStdin>, // Keep stdin open to write commands
    pub shell: String,
    pub cwd: String,
    pub env: HashMap<String, String>,
    pub status: String,
    pub created_at: SystemTime,
    pub last_used_at: SystemTime,
    pub logs: Arc<RwLock<VecDeque<String>>>,
    pub log_broadcast: broadcast::Sender<String>,
}

pub struct SessionInitParams {
    pub id: String,
    pub pid: Option<u32>,
    pub shell: String,
    pub cwd: String,
    pub env: HashMap<String, String>,
    pub child: Option<Child>,
    pub stdin: ChildStdin,
    pub log_broadcast: broadcast::Sender<String>,
}

impl SessionInfo {
    pub fn new(params: SessionInitParams) -> Self {
        let now = SystemTime::now();
        Self {
            id: params.id,
            pid: params.pid,
            child: params.child,
            stdin: Some(params.stdin),
            shell: params.shell,
            cwd: params.cwd,
            env: params.env,
            status: "active".to_string(),
            created_at: now,
            last_used_at: now,
            logs: Arc::new(RwLock::new(VecDeque::new())),
            log_broadcast: params.log_broadcast,
        }
    }

    pub fn to_status(&self) -> SessionStatus {
        let created_secs = self
            .created_at
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let last_used_secs = self
            .last_used_at
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        SessionStatus {
            session_id: self.id.clone(),
            shell: self.shell.clone(),
            cwd: self.cwd.clone(),
            env: self.env.clone(),
            session_status: self.status.clone(),
            created_at: crate::utils::common::format_time(created_secs),
            last_used_at: crate::utils::common::format_time(last_used_secs),
        }
    }
}

pub type SessionStore = Arc<RwLock<HashMap<String, SessionInfo>>>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_status_serialization() {
        let status = SessionStatus {
            session_id: "test-id".to_string(),
            shell: "/bin/bash".to_string(),
            cwd: "/workspace".to_string(),
            env: HashMap::new(),
            session_status: "active".to_string(),
            created_at: "2023-01-01T00:00:00Z".to_string(),
            last_used_at: "2023-01-01T00:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&status).unwrap();
        println!("Serialized JSON: {}", json);

        assert!(json.contains("\"sessionId\":\"test-id\""));
        assert!(json.contains("\"sessionStatus\":\"active\""));
        assert!(json.contains("\"shell\":\"/bin/bash\""));
        assert!(json.contains("\"env\":{}"));
    }
}
