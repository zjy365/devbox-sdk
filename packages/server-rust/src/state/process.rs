use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::SystemTime;
use tokio::process::Child;
use tokio::sync::{broadcast, RwLock};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStatus {
    pub process_id: String,
    pub pid: Option<u32>,
    pub command: String,
    pub process_status: String, // "running", "completed", "failed", "killed"
    pub start_time: String,
    pub end_time: Option<String>,
    pub exit_code: Option<i32>,
}

pub struct ProcessInfo {
    pub id: String,
    pub pid: Option<u32>,
    pub child: Option<Child>, // Option because it might be taken out to wait on
    pub command: String,
    pub status: String,
    pub start_time: SystemTime,
    pub end_time: Option<SystemTime>,
    pub exit_code: Option<i32>,
    pub logs: Arc<RwLock<VecDeque<String>>>, // In-memory logs
    pub log_broadcast: broadcast::Sender<String>, // Real-time log broadcasting
}

impl ProcessInfo {
    pub fn new(
        id: String,
        pid: Option<u32>,
        command: String,
        child: Option<Child>,
        log_broadcast: broadcast::Sender<String>,
    ) -> Self {
        Self {
            id,
            pid,
            child,
            command,
            status: "running".to_string(),
            start_time: SystemTime::now(),
            end_time: None,
            exit_code: None,
            logs: Arc::new(RwLock::new(VecDeque::new())),
            log_broadcast,
        }
    }

    pub fn to_status(&self) -> ProcessStatus {
        ProcessStatus {
            process_id: self.id.clone(),
            pid: self.pid,
            command: self.command.clone(),
            process_status: self.status.clone(),
            start_time: crate::utils::common::format_time(
                self.start_time
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs(),
            ),
            end_time: self.end_time.map(|t| {
                crate::utils::common::format_time(
                    t.duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs(),
                )
            }),
            exit_code: self.exit_code,
        }
    }
}

pub type ProcessStore = Arc<RwLock<HashMap<String, ProcessInfo>>>;
