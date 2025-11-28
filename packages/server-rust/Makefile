# DevBox Server Rust Makefile

BINARY_NAME=server-rust
BUILD_DIR=./target/x86_64-unknown-linux-musl/release
MAIN_PATH=./src/main.rs

# Default to release build
BUILD_FLAGS=--release

.PHONY: help build run test fmt check clean clippy

all: build

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build release binary
	@cargo cross build -t x86_64-unknown-linux-musl $(BUILD_FLAGS)
	@echo "Binary: $(BUILD_DIR)/$(BINARY_NAME)"

build-release-upx: build ## Build release binary and compress with UPX
	@upx --best --lzma $(BUILD_DIR)/$(BINARY_NAME)
	@echo "Compressed Binary: $(BUILD_DIR)/$(BINARY_NAME)"

run: ## Run application
	@cargo run

test: ## Run tests
	@cargo test

fmt: ## Format code
	@cargo fmt

check: fmt ## Basic checks (cargo check)
	@cargo check
	@echo "Checks passed"

clippy: ## Run clippy lints
	@cargo clippy -- -D warnings

clean: ## Clean build artifacts
	@cargo clean
