pub mod process;
pub mod session;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<crate::config::Config>,
    pub processes: process::ProcessStore,
    pub sessions: session::SessionStore,
    pub port_monitor: Arc<crate::monitor::port::PortMonitor>,
    pub start_time: std::time::Instant,
}

impl AppState {
    pub fn new(config: crate::config::Config) -> Self {
        let mut excluded_ports = vec![22];
        if let Ok(addr) = config.addr.parse::<std::net::SocketAddr>() {
            excluded_ports.push(addr.port());
        }

        Self {
            config: Arc::new(config),
            processes: Arc::new(RwLock::new(HashMap::new())),
            sessions: Arc::new(RwLock::new(HashMap::new())),
            port_monitor: Arc::new(crate::monitor::port::PortMonitor::new(
                std::time::Duration::from_millis(100),
                excluded_ports,
            )),
            start_time: std::time::Instant::now(),
        }
    }
}
