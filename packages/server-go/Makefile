# DevBox Server Makefile (Minimal)

BINARY_NAME=devbox-server
MAIN_PATH=./cmd/server
BUILD_DIR=./build
VERSION?=latest
LDFLAGS=-ldflags "-s -w -X main.Version=$(VERSION) -X main.BuildTime=$(shell date -u '+%Y-%m-%d_%H:%M:%S')"
BUILD_FLAGS=-trimpath
GOEXPERIMENT?=
BUILD_ENV=CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOEXPERIMENT=$(GOEXPERIMENT)

.PHONY: help build build-green run test fmt vet check clean

all: build

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo "\nEnvironment variables:"
	@echo "  GOEXPERIMENT=greenteagc   Enable experimental green tea GC during build"
	@echo "  GOEXPERIMENT=jsonv2   Enable experimental encoding/json/v2"

build: GOEXPERIMENT = greenteagc,jsonv2
build: clean ## Build optimized binary with GOEXPERIMENT=greenteagc,jsonv2
	@mkdir -p $(BUILD_DIR)
	@$(BUILD_ENV) go build $(BUILD_FLAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_PATH)
	@echo "Binary: $(BUILD_DIR)/$(BINARY_NAME)"

build-release-upx: build ## Build optimized binary and compress with UPX
	@upx --best --lzma $(BUILD_DIR)/$(BINARY_NAME)
	@echo "Compressed Binary: $(BUILD_DIR)/$(BINARY_NAME)"

build-stable: GOEXPERIMENT = jsonv2
build-stable: clean ## Build optimized binary with json/v2(must)
	@mkdir -p $(BUILD_DIR)
	@$(BUILD_ENV) go build $(BUILD_FLAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_PATH)
	@echo "Binary: $(BUILD_DIR)/$(BINARY_NAME) (jsonv2)"

run: ## Run application
	@go run $(MAIN_PATH)

test: ## Run tests
	@go test -v ./...

fmt: ## Format code
	@go fmt ./...

vet: ## Static check
	@go vet ./...

check: fmt vet test ## Basic checks
	@echo "Checks passed"

clean: ## Clean build artifacts
	@rm -rf $(BUILD_DIR)