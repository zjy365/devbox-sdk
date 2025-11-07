#!/bin/bash

# Test script for sync execution endpoints

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Server configuration
SERVER_PORT=9757
SERVER_ADDR="127.0.0.1:$SERVER_PORT"
SERVER_PID_FILE="test/server_exec_sync.pid"
SERVER_LOG_FILE="test/server_exec_sync.log"
BINARY_PATH="./build/devbox-server"

# Test token
TEST_TOKEN="test-token-123"

echo -e "${BLUE}=== Sync Execution Test Suite ===${NC}"

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

    # Clean up log files
    rm -f "$SERVER_LOG_FILE"

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
    if ! curl -s -H "Authorization: Bearer $TEST_TOKEN" "http://$SERVER_ADDR/health" >/dev/null 2>&1; then
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
        "$BINARY_PATH" -addr=":$SERVER_PORT" -token="$TEST_TOKEN" -workspace_path="." > "$SERVER_LOG_FILE" 2>&1 &
        SERVER_PID=$!
        echo "$SERVER_PID" > "$SERVER_PID_FILE"
        echo -e "${GREEN}Server started with PID: $SERVER_PID${NC}"

        wait_for_server || { echo -e "${RED}Server startup failed. Check log: $SERVER_LOG_FILE${NC}"; exit 1; }
    else
        echo -e "${GREEN}✓ Server is already running${NC}"
    fi
}

# Function to run a test
run_test() {
    local method="$1"
    local url="$2"
    local data="$3"
    local expected_status="$4"
    local description="$5"

    echo -e "\n${BLUE}Testing: $description${NC}"
    echo -e "${BLUE}Request: $method $url${NC}"

    local cmd="curl -s -w '\nHTTP_CODE:%{http_code}'"

    if [ -n "$data" ]; then
        cmd="$cmd -X $method -H 'Content-Type: application/json' -H 'Authorization: Bearer $TEST_TOKEN' -d '$data'"
    else
        cmd="$cmd -X $method -H 'Authorization: Bearer $TEST_TOKEN'"
    fi

    cmd="$cmd 'http://$SERVER_ADDR$url'"

    local response
    response=$(eval "$cmd" 2>/dev/null || echo "HTTP_CODE:000")

    local http_code=$(echo "$response" | grep -o 'HTTP_CODE:[0-9]*' | cut -d: -f2)
    local response_body=$(echo "$response" | sed '/HTTP_CODE:/d')

    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASSED (HTTP: $http_code)${NC}"
        if [ -n "$response_body" ]; then
            # Format JSON for better readability
            if echo "$response_body" | jq . >/dev/null 2>&1; then
                echo -e "${BLUE}Response:${NC}"
                echo "$response_body" | jq . -C | sed 's/^/  /'
            else
                echo -e "${BLUE}Response: $response_body${NC}"
            fi
        fi
        return 0
    else
        echo -e "${RED}✗ FAILED (Expected HTTP: $expected_status, Got: $http_code)${NC}"
        if [ -n "$response_body" ]; then
            # Format JSON for better readability
            if echo "$response_body" | jq . >/dev/null 2>&1; then
                echo -e "${RED}Response:${NC}"
                echo "$response_body" | jq . -C | sed 's/^/  /'
            else
                echo -e "${RED}Response: $response_body${NC}"
            fi
        fi
        return 1
    fi
}

# Step 1: Ensure server is running
ensure_server

# Step 2: Test sync execution endpoints
echo -e "\n${YELLOW}=== Testing Sync Execution Endpoints ===${NC}"

TOTAL_TESTS=0
PASSED_TESTS=0

# Test exec-sync endpoint
echo -e "\n${YELLOW}Testing exec-sync endpoint...${NC}"
if run_test "POST" "/api/v1/process/exec-sync" '{
    "command": "echo",
    "args": ["hello", "world"],
    "timeout": 10
}' "200" "Exec Sync - Simple Echo"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Test sync-stream endpoint
echo -e "\n${YELLOW}Testing sync-stream endpoint...${NC}"
if run_test "POST" "/api/v1/process/sync-stream" '{
    "command": "echo",
    "args": ["-e", "line1\\nline2\\nline3"],
    "timeout": 10
}' "200" "Sync Stream - Multi-line Output"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Test exec-sync with a command that produces error
echo -e "\n${YELLOW}Testing exec-sync with invalid command...${NC}"
if run_test "POST" "/api/v1/process/exec-sync" '{
    "command": "nonexistentcommand12345",
    "timeout": 5
}' "200" "Exec Sync - Invalid Command (Should Return 200 With Error Details)"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Test exec-sync with simple command that doesn't sleep
echo -e "\n${YELLOW}Testing exec-sync with date command...${NC}"
if run_test "POST" "/api/v1/process/exec-sync" '{
    "command": "date",
    "timeout": 5
}' "200" "Exec Sync - Date Command"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Step 3: Display results
echo -e "\n${BLUE}=== Test Results ===${NC}"
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $((TOTAL_TESTS - PASSED_TESTS))${NC}"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "\n${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Check the output above for details.${NC}"
    echo -e "${BLUE}Server log: $SERVER_LOG_FILE${NC}"
    exit 1
fi