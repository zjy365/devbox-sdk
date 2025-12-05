mod config;
mod error;
mod handlers;
mod middleware;
mod monitor;
mod response;
mod router;
mod state;
mod utils;

use std::net::SocketAddr;
use std::process;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--help") {
        println!("devbox-server-rust");
        println!("A lightweight server for code execution and file management.");
        println!();
        println!("USAGE:");
        println!("    server-rust [OPTIONS]");
        println!();
        println!("OPTIONS:");
        println!("    --addr=<ADDRESS>            Sets the server listening address. [env: ADDR] [default: 0.0.0.0:9757]");
        println!("    --workspace-path=<PATH>     Sets the base workspace directory. [env: WORKSPACE_PATH] [default: /home/devbox/project]");
        println!("    --max-file-size=<BYTES>     Sets the maximum file size for uploads in bytes. [env: MAX_FILE_SIZE] [default: 104857600]");
        println!("    --token=<TOKEN>             Sets the authentication token. [env: TOKEN / DEVBOX_JWT_SECRET] [default: a random token if not provided]");
        println!();
        println!("    --help                      Prints this help information.");
        println!();

        process::exit(0);
    }

    // Load config
    let config = config::Config::load();

    // Initialize logging
    println!("Workspace path: {:?}", config.workspace_path);

    // Initialize state
    let state = state::AppState::new(config.clone());

    // Create router
    let app = router::create_router(state);

    // Bind server
    let addr: SocketAddr = config.addr.parse().expect("Invalid address");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind to address");
    println!("Server running on {}", addr);
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Failed to start server");
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};

        let mut terminate = signal(SignalKind::terminate()).expect("Failed to install SIGTERM handler");
        tokio::select! {
            _ = wait_for_ctrl_c() => {},
            _ = terminate.recv() => {},
        }
    }

    #[cfg(not(unix))]
    {
        wait_for_ctrl_c().await;
    }

    println!("Shutdown signal received, stopping server...");
}

async fn wait_for_ctrl_c() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to install Ctrl+C handler");
}
