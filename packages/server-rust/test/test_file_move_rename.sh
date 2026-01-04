#!/bin/bash

# Integration test for file move and rename operations

set -e

# Server configuration
SERVER_PORT=9757
SERVER_ADDR="127.0.0.1:$SERVER_PORT"
BASE_URL="http://$SERVER_ADDR"
TOKEN="${TOKEN:-test-token-files}"
WORKSPACE="${WORKSPACE:-.}"
BINARY_PATH="./target/x86_64-unknown-linux-musl/release/devbox-sdk-server"
SERVER_PID_FILE="test/server_files.pid"
SERVER_LOG_FILE="test/server_files.log"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

pkill -f "server-rust.*$SERVER_PORT" || true
echo "Testing File Move and Rename Operations"
echo "========================================"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"

    # Clean up server by PID file
    if [ -f "$SERVER_PID_FILE" ]; then
        SERVER_PID=$(cat "$SERVER_PID_FILE")
        if kill -0 "$SERVER_PID" 2>/dev/null; then
            echo -e "${YELLOW}Stopping server (PID: $SERVER_PID)...${NC}"
            kill "$SERVER_PID"
            sleep 2
            # Force kill if still running
            if kill -0 "$SERVER_PID" 2>/dev/null; then
                kill -9 "$SERVER_PID" 2>/dev/null || true
            fi
        fi
        rm -f "$SERVER_PID_FILE"
    fi

    # Enhanced cleanup: kill any process using the port
    if lsof -i:$SERVER_PORT >/dev/null 2>&1; then
        echo -e "${YELLOW}Force cleaning port $SERVER_PORT...${NC}"
        lsof -ti:$SERVER_PORT | xargs kill -9 2>/dev/null || true
    fi

    # Clean up test files
    # rm -f "$SERVER_LOG_FILE"
    rm -f test_move.txt test_moved.txt test_renamed.txt test_overwrite_source.txt test_overwrite_dest.txt test_rename_exist1.txt test_rename_exist2.txt

    echo -e "${GREEN}Cleanup completed.${NC}"
}

# Set trap for cleanup on script exit
trap cleanup EXIT

# Function to wait for server to be ready
wait_for_server() {
    echo -e "${YELLOW}Waiting for server to be ready...${NC}"
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://$SERVER_ADDR/health" > /dev/null 2>&1; then
            echo -e "${GREEN}Server is ready!${NC}"
            return 0
        fi

        echo -e "${YELLOW}Attempt $attempt/$max_attempts: Server not ready yet...${NC}"
        sleep 1
        attempt=$((attempt + 1))
    done

    echo -e "${RED}Server failed to start within $max_attempts seconds${NC}"
    return 1
}

# Function to ensure server is running
ensure_server() {
    if ! curl -s -H "Authorization: Bearer $TOKEN" "http://$SERVER_ADDR/health" >/dev/null 2>&1; then
        echo -e "${YELLOW}Server not running, attempting to build and start...${NC}"

        # Build the server
        if [ ! -x "$BINARY_PATH" ]; then
            echo -e "${YELLOW}Building server...${NC}"
            if make build > /dev/null 2>&1; then
                echo -e "${GREEN}✓ Server built successfully${NC}"
            else
                echo -e "${RED}✗ Failed to build server${NC}"
                exit 1
            fi
        fi

        # Clean up port occupation
        if lsof -i:$SERVER_PORT >/dev/null 2>&1; then
            echo -e "${YELLOW}Port $SERVER_PORT is occupied, cleaning up...${NC}"
            lsof -ti:$SERVER_PORT | xargs kill -9 2>/dev/null || true
            sleep 1
        fi

        # Start server
        mkdir -p test
        echo -e "${YELLOW}Starting server...${NC}"
        "$BINARY_PATH" --addr="$SERVER_ADDR" --token="$TOKEN" --workspace-path="$WORKSPACE" > "$SERVER_LOG_FILE" 2>&1 &
        SERVER_PID=$!
        echo "$SERVER_PID" > "$SERVER_PID_FILE"
        echo -e "${GREEN}Server started with PID: $SERVER_PID${NC}"

        wait_for_server || { echo -e "${RED}Server startup failed. Check log: $SERVER_LOG_FILE${NC}"; exit 1; }
    else
        echo -e "${GREEN}✓ Server is already running${NC}"
    fi
}

# Helper function to make API calls
api_call() {
    local method="$1"
    local endpoint="$2"
    local data="$3"

    curl -s -X "$method" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$data" \
        "${BASE_URL}${endpoint}"
}

# Step 1: Ensure server is running
ensure_server

# Test 1: Create test file
echo -e "\n${GREEN}Test 1: Creating test file${NC}"
RESPONSE=$(api_call POST "/api/v1/files/write" '{"path":"test_move.txt","content":"Test content for move operation"}')
echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"status":0'; then
    echo -e "${GREEN}✓ Test file created successfully${NC}"
else
    echo -e "${RED}✗ Failed to create test file${NC}"
    exit 1
fi

# Test 2: Move file to new location
echo -e "\n${GREEN}Test 2: Moving file${NC}"
RESPONSE=$(api_call POST "/api/v1/files/move" '{"source":"test_move.txt","destination":"test_moved.txt"}')
echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"status":0'; then
    echo -e "${GREEN}✓ File moved successfully${NC}"
else
    echo -e "${RED}✗ Failed to move file${NC}"
    exit 1
fi

# Test 3: Verify source file no longer exists
echo -e "\n${GREEN}Test 3: Verifying source file deleted${NC}"
RESPONSE=$(api_call GET "/api/v1/files/read?path=test_move.txt")
# Expect 1404 or non-zero status
if echo "$RESPONSE" | grep -q '"status":1404' || ! echo "$RESPONSE" | grep -q '"status":0'; then
    echo -e "${GREEN}✓ Source file correctly deleted${NC}"
else
    echo -e "${RED}✗ Source file still exists${NC}"
    exit 1
fi

# Test 4: Verify destination file exists
echo -e "\n${GREEN}Test 4: Verifying destination file exists${NC}"
RESPONSE=$(api_call GET "/api/v1/files/read?path=test_moved.txt")
echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q "Test content for move operation"; then
    echo -e "${GREEN}✓ Destination file exists with correct content${NC}"
else
    echo -e "${RED}✗ Destination file not found or content incorrect${NC}"
    exit 1
fi

# Test 5: Rename file
echo -e "\n${GREEN}Test 5: Renaming file${NC}"
RESPONSE=$(api_call POST "/api/v1/files/rename" '{"oldPath":"test_moved.txt","newPath":"test_renamed.txt"}')
echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"status":0'; then
    echo -e "${GREEN}✓ File renamed successfully${NC}"
else
    echo -e "${RED}✗ Failed to rename file${NC}"
    exit 1
fi

# Test 6: Verify renamed file exists
echo -e "\n${GREEN}Test 6: Verifying renamed file exists${NC}"
RESPONSE=$(api_call GET "/api/v1/files/read?path=test_renamed.txt")
if echo "$RESPONSE" | grep -q "Test content for move operation"; then
    echo -e "${GREEN}✓ Renamed file exists with correct content${NC}"
else
    echo -e "${RED}✗ Renamed file not found or content incorrect${NC}"
    exit 1
fi

# Test 7: Test move with overwrite
echo -e "\n${GREEN}Test 7: Testing move with overwrite${NC}"
# Create a new file
api_call POST "/api/v1/files/write" '{"path":"test_overwrite_source.txt","content":"Source content"}' > /dev/null
# Create destination file
api_call POST "/api/v1/files/write" '{"path":"test_overwrite_dest.txt","content":"Destination content"}' > /dev/null
# Try move without overwrite (should fail)
RESPONSE=$(api_call POST "/api/v1/files/move" '{"source":"test_overwrite_source.txt","destination":"test_overwrite_dest.txt","overwrite":false}')
if ! echo "$RESPONSE" | grep -q '"status":0'; then
    echo -e "${GREEN}✓ Move without overwrite correctly failed${NC}"
else
    echo -e "${RED}✗ Move without overwrite should have failed${NC}"
    exit 1
fi

# Try move with overwrite (should succeed)
RESPONSE=$(api_call POST "/api/v1/files/move" '{"source":"test_overwrite_source.txt","destination":"test_overwrite_dest.txt","overwrite":true}')
if echo "$RESPONSE" | grep -q '"status":0'; then
    echo -e "${GREEN}✓ Move with overwrite succeeded${NC}"
else
    echo -e "${RED}✗ Move with overwrite failed${NC}"
    exit 1
fi

# Test 8: Test rename with existing destination (should fail)
echo -e "\n${GREEN}Test 8: Testing rename with existing destination${NC}"
api_call POST "/api/v1/files/write" '{"path":"test_rename_exist1.txt","content":"File 1"}' > /dev/null
api_call POST "/api/v1/files/write" '{"path":"test_rename_exist2.txt","content":"File 2"}' > /dev/null
RESPONSE=$(api_call POST "/api/v1/files/rename" '{"oldPath":"test_rename_exist1.txt","newPath":"test_rename_exist2.txt"}')
if ! echo "$RESPONSE" | grep -q '"status":0'; then
    echo -e "${GREEN}✓ Rename to existing path correctly failed${NC}"
else
    echo -e "${RED}✗ Rename to existing path should have failed${NC}"
    exit 1
fi

echo -e "\n${GREEN}========================================"
echo "All tests passed!"
echo -e "========================================${NC}"
