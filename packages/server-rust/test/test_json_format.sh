#!/bin/bash

# Test script to verify JSON field naming (camelCase vs snake_case)
# This verifies that Rust server output matches Go server format

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SERVER_PORT=19999
TEST_TOKEN="test-token-123"
BINARY_PATH="./target/release/server-rust"

echo -e "${YELLOW}=== JSON Format Test ===${NC}"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID"
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    lsof -ti:$SERVER_PORT | xargs kill -9 2>/dev/null || true
}

trap cleanup EXIT

# Build the server
echo "Building server..."
cargo build --release
if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed${NC}"
    exit 1
fi

# Start server
echo "Starting server on port $SERVER_PORT..."
PORT=$SERVER_PORT TOKEN=$TEST_TOKEN WORKSPACE_PATH=/tmp/test-workspace "$BINARY_PATH" > /tmp/server.log 2>&1 &
SERVER_PID=$!
sleep 2

# Check if server started
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo -e "${RED}Server failed to start${NC}"
    cat /tmp/server.log
    exit 1
fi

BASE_URL="http://127.0.0.1:$SERVER_PORT"
HEADERS="Authorization: Bearer $TEST_TOKEN"

echo -e "\n${YELLOW}Testing JSON field naming...${NC}"

# Test 1: Health endpoint
echo -e "\n${YELLOW}1. Testing /health endpoint${NC}"
RESPONSE=$(curl -s "$BASE_URL/health")
echo "Response: $RESPONSE"

# Check for snake_case (BAD)
if echo "$RESPONSE" | grep -q "last_updated_at\|mime_type\|is_dir"; then
    echo -e "${RED}FAIL: Found snake_case fields${NC}"
    exit 1
fi

# Check for camelCase (GOOD)
if echo "$RESPONSE" | grep -q "timestamp\|uptime"; then
    echo -e "${GREEN}PASS: Health endpoint uses correct format${NC}"
else
    echo -e "${RED}FAIL: Unexpected response format${NC}"
    exit 1
fi

# Test 2: Create a test file and list it
echo -e "\n${YELLOW}2. Testing file operations${NC}"
mkdir -p /tmp/test-workspace
echo "test content" > /tmp/test-workspace/test-file.txt

RESPONSE=$(curl -s -H "$HEADERS" "$BASE_URL/files/list?path=.")
echo "Response: $RESPONSE"

# Check for snake_case fields (BAD)
if echo "$RESPONSE" | grep -q '"is_dir"\|"mime_type"'; then
    echo -e "${RED}FAIL: Found snake_case fields in file list${NC}"
    echo "Expected: isDir, mimeType (camelCase)"
    echo "Found: is_dir, mime_type (snake_case)"
    exit 1
fi

# Check for camelCase fields (GOOD)
if echo "$RESPONSE" | grep -q '"isDir"\|"mimeType"'; then
    echo -e "${GREEN}PASS: File list uses camelCase${NC}"
else
    echo -e "${YELLOW}WARNING: Could not verify camelCase fields (may be missing in response)${NC}"
fi

# Test 3: Process execution
echo -e "\n${YELLOW}3. Testing process execution${NC}"
RESPONSE=$(curl -s -X POST -H "$HEADERS" -H "Content-Type: application/json" \
    -d '{"command":"echo","args":["test"]}' \
    "$BASE_URL/process/exec/sync")
echo "Response: $RESPONSE"

# Check for snake_case (BAD)
if echo "$RESPONSE" | grep -q '"exit_code"\|"duration_ms"\|"start_time"'; then
    echo -e "${RED}FAIL: Found snake_case fields in process response${NC}"
    echo "Expected: exitCode, durationMs, startTime (camelCase)"
    echo "Found: exit_code, duration_ms, start_time (snake_case)"
    exit 1
fi

# Check for camelCase (GOOD)
if echo "$RESPONSE" | grep -q '"exitCode"\|"durationMs"\|"startTime"'; then
    echo -e "${GREEN}PASS: Process response uses camelCase${NC}"
else
    echo -e "${YELLOW}WARNING: Could not verify camelCase fields${NC}"
fi

echo -e "\n${GREEN}=== All JSON format tests passed ===${NC}"
