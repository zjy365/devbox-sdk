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
            std::env::var("WORKSPACE_PATH").unwrap_or_else(|_| "/home/devbox/project".to_string()),
        );
        let mut max_file_size = std::env::var("MAX_FILE_SIZE")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(104857600);
        let mut token = std::env::var("TOKEN")
            .or_else(|_| std::env::var("SEALOS_DEVBOX_JWT_SECRET"))
            .ok();

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

        if let Some(ref t) = token {
            let masked = if t.len() > 6 {
                format!("{}******{}", &t[..3], &t[t.len() - 3..])
            } else {
                "******".to_string()
            };
            println!("Token loaded from environment/args: {}", masked);
        } else {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    // Helper to run test with specific env vars safely (sequentially)
    // But since we are just adding one test, we can just do it.
    // Note: Tests run in parallel by default, so manipulating env vars can be flaky if other tests depend on them.
    // Since there are no other tests visible, it might be fine.
    // To be safe, we can use a mutex or just hope for the best in this context.

    #[test]
    fn test_load_token_priority() {
        // We need to be careful about env vars since they are global.
        // We'll use a lock if we had multiple tests, but here just one.

        let _lock = std::sync::Mutex::new(()); // Dummy lock if we needed it

        // 1. Test TOKEN preference
        env::set_var("TOKEN", "test_token_1");
        env::set_var("SEALOS_DEVBOX_JWT_SECRET", "test_jwt_1");

        let config = Config::load();
        // We can't easily control args() here, but hopefully no --token arg is passed to test runner

        // If args contain --token, this test might fail.
        // But let's assume standard cargo test run.

        // Wait, if the test runner is invoked with arguments that look like our flags, it might be an issue.
        // But usually cargo test args are like `target/debug/deps/server_rust-...`

        // Actually, Config::load() reads args. If we run `cargo test`, args are present.
        // But they probably don't start with `--token=`.

        assert_eq!(config.token, Some("test_token_1".to_string()));

        // 2. Test Fallback
        env::remove_var("TOKEN");
        env::set_var("SEALOS_DEVBOX_JWT_SECRET", "test_jwt_2");

        let config = Config::load();
        assert_eq!(config.token, Some("test_jwt_2".to_string()));

        // Cleanup
        env::remove_var("TOKEN");
        env::remove_var("SEALOS_DEVBOX_JWT_SECRET");
    }
}
