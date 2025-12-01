use crate::error::AppError;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use std::time::{Duration, Instant};
use tokio::fs;

#[derive(Clone)]
pub struct PortMonitor {
    ports: Arc<RwLock<Vec<u16>>>,
    last_updated: Arc<RwLock<Instant>>,
    refresh_mutex: Arc<Mutex<()>>,
    cache_ttl: Duration,
    excluded_ports: Vec<u16>,
}

impl PortMonitor {
    pub fn new(cache_ttl: Duration, excluded_ports: Vec<u16>) -> Self {
        Self {
            ports: Arc::new(RwLock::new(Vec::new())),
            last_updated: Arc::new(RwLock::new(Instant::now() - cache_ttl * 2)), // Ensure initial refresh
            refresh_mutex: Arc::new(Mutex::new(())),
            cache_ttl,
            excluded_ports,
        }
    }

    pub async fn get_ports(&self) -> Result<(Vec<u16>, i64), AppError> {
        // First check (optimistic read)
        let should_refresh = {
            let last_updated = self.last_updated.read().await;
            last_updated.elapsed() > self.cache_ttl
        };

        if should_refresh {
            // Acquire lock to serialize refresh attempts
            let _guard = self.refresh_mutex.lock().await;

            // Double check after acquiring lock
            let really_needs_refresh = {
                let last_updated = self.last_updated.read().await;
                last_updated.elapsed() > self.cache_ttl
            };

            if really_needs_refresh {
                self.refresh().await?;
            }
        }

        let ports = self.ports.read().await.clone();
        let last_updated_ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        Ok((ports, last_updated_ts))
    }

    async fn refresh(&self) -> Result<(), AppError> {
        let ports = self.poll_ports().await?;

        {
            let mut p = self.ports.write().await;
            *p = ports;
        }
        {
            let mut l = self.last_updated.write().await;
            *l = Instant::now();
        }

        Ok(())
    }

    async fn poll_ports(&self) -> Result<Vec<u16>, AppError> {
        let (tcp_res, tcp6_res) = tokio::join!(
            fs::read_to_string("/proc/net/tcp"),
            fs::read_to_string("/proc/net/tcp6")
        );

        let mut ports = Vec::new();

        if let Ok(content) = tcp_res {
            Self::parse_proc_net_tcp(&content, &mut ports);
        }

        if let Ok(content) = tcp6_res {
            Self::parse_proc_net_tcp(&content, &mut ports);
        }

        let mut filtered_ports = Vec::new();
        let mut seen = std::collections::HashSet::new();

        for port in ports {
            if !self.excluded_ports.contains(&port) && !seen.contains(&port) {
                filtered_ports.push(port);
                seen.insert(port);
            }
        }

        Ok(filtered_ports)
    }

    fn parse_proc_net_tcp(content: &str, ports: &mut Vec<u16>) {
        for line in content.lines().skip(1) {
            let mut parts = line.split_whitespace();
            // Skip 'sl' column
            if parts.next().is_none() {
                continue;
            }

            let Some(local_address) = parts.next() else {
                continue;
            };

            let mut addr_parts = local_address.split(':');
            let Some(ip_hex) = addr_parts.next() else {
                continue;
            };
            let Some(port_hex) = addr_parts.next() else {
                continue;
            };

            // Check if IP is 0.0.0.0 (00000000) or :: (00000000000000000000000000000000)
            if ip_hex == "00000000" || ip_hex == "00000000000000000000000000000000" {
                if let Ok(port) = u16::from_str_radix(port_hex, 16) {
                    ports.push(port);
                }
            }
        }
    }
}
