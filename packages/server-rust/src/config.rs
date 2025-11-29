use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    /// Server listening address
    pub addr: String,

    /// Base workspace directory
    pub workspace_path: PathBuf,

    /// Max file size in bytes
    pub max_file_size: u64,

    /// Authentication token
    pub token: Option<String>,
}

impl Config {
    pub fn load() -> Self {
        let mut addr = std::env::var("ADDR").unwrap_or_else(|_| "0.0.0.0:9757".to_string());
        let mut workspace_path = PathBuf::from(
            std::env::var("WORKSPACE_PATH").unwrap_or_else(|_| "/workspace".to_string()),
        );
        let mut max_file_size = std::env::var("MAX_FILE_SIZE")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(104857600);
        let mut token = std::env::var("TOKEN").ok();

        // Check command line args for overrides (simple implementation)
        for arg in std::env::args() {
            if arg.starts_with("--addr=") {
                addr = arg.trim_start_matches("--addr=").to_string();
            } else if arg.starts_with("--token=") {
                token = Some(arg.trim_start_matches("--token=").to_string());
            } else if arg.starts_with("--workspace-path=") {
                workspace_path = PathBuf::from(arg.trim_start_matches("--workspace-path="));
            } else if arg.starts_with("--max-file-size=") {
                if let Ok(size) = arg.trim_start_matches("--max-file-size=").parse::<u64>() {
                    max_file_size = size;
                }
            }
        }

        if token.is_none() {
            let random_token = crate::utils::common::generate_id();
            println!(
                "No token provided. Generated temporary token: {}",
                random_token
            );
            token = Some(random_token);
        }

        Config {
            addr,
            workspace_path,
            max_file_size,
            token,
        }
    }
}
