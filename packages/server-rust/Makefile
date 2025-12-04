# DevBox Server Rust Makefile

BINARY_NAME=devbox-sdk-server
TARGET ?= x86_64-unknown-linux-musl
SUPPORTED_TARGETS = x86_64-unknown-linux-musl aarch64-unknown-linux-musl
BUILD_DIR=./target/$(TARGET)/release
MAIN_PATH=./src/main.rs

# Default to release build
BUILD_FLAGS=--release

.PHONY: help build build-all run test fmt check clean clippy

all: build

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build release binary (override TARGET=<triple> for other arches)
	@echo "Building target $(TARGET)"
	@cargo cross build --toolchain nightly --build-std -Z build-std-features="optimize_for_size" --release --target $(TARGET)
	@echo "Binary: $(BUILD_DIR)/$(BINARY_NAME)"

build-all: ## Build release binaries for all supported targets
	@for target in $(SUPPORTED_TARGETS); do \
		$(MAKE) build TARGET=$$target; \
	done

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
