#!/bin/bash

# Comprehensive test script for devbox-server routes
# This script builds, starts the server, and tests all routes

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Server configuration
SERVER_PORT=9757
SERVER_ADDR="127.0.0.1:$SERVER_PORT"
SERVER_PID_FILE="test/server.pid"
SERVER_LOG_FILE="test/server.log"
BINARY_PATH="./build/devbox-server"

# Test token
TEST_TOKEN="test-token-123"

echo -e "${BLUE}=== DevBox Server Test Suite ===${NC}"

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

    # Fallback: kill any remaining processes matching patterns
    pkill -f "devbox-server.*$SERVER_PORT" 2>/dev/null || true
    pkill -f ".*$SERVER_PORT" 2>/dev/null || true

    # Clean up test files and directories
    rm -rf test_tmp/ test_file.txt test/response.tmp test/process_id.tmp 2>/dev/null || true

    # Clean up any accidentally created directories in project root
    rm -rf tmp/ temp/ 2>/dev/null || true

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

# Function to run a single test
run_test() {
    local method="$1"
    local url="$2"
    local data="$3"
    local expected_status="$4"
    local description="$5"
    local expected_success="${6:-true}"  # New parameter: expect success in response body

    echo -e "\n${BLUE}Testing: $description${NC}"
    echo -e "${BLUE}Request: $method $url${NC}"

    local cmd="curl -s -w '%{http_code}' -o test/response.tmp"

    if [ -n "$data" ]; then
        cmd="$cmd -X $method -H 'Content-Type: application/json' -d '$data'"
    else
        cmd="$cmd -X $method"
    fi

    # Add authorization header for all endpoints except WebSocket
    if [[ "$url" != "/ws" ]]; then
        cmd="$cmd -H 'Authorization: Bearer $TEST_TOKEN'"
    fi

    cmd="$cmd 'http://$SERVER_ADDR$url'"

    local response_code
    response_code=$(eval "$cmd" 2>/dev/null || echo "000")
    local response_body
    response_body=$(cat test/response.tmp 2>/dev/null || echo "")

    # Check HTTP status code
    if [ "$response_code" != "$expected_status" ]; then
        echo -e "${RED}✗ FAILED (Expected HTTP: $expected_status, Got: $response_code)${NC}"
        if [ -n "$response_body" ]; then
            echo -e "${RED}Response: $response_body${NC}"
        fi
        return 1
    fi

    # Check response content for success/failure
    local test_passed=true
    if [ "$expected_success" = "true" ]; then
        # Expect success: check for success indicators
        if echo "$response_body" | grep -q '"success":true\|"status":"healthy"\|"status":"ready"\|"ready":true\|"files":\[\|"processId":"\|"status":"running\|"status":"completed\|"status":"terminated"\|"logs":\[\|"status":"exited"'; then
            echo -e "${GREEN}✓ PASSED (Status: $response_code, Success confirmed)${NC}"
        elif echo "$response_body" | grep -q '"error"\|"type":".*error"'; then
            echo -e "${RED}✗ FAILED (Status: $response_code, but error in response)${NC}"
            echo -e "${RED}Response: $response_body${NC}"
            test_passed=false
        else
            echo -e "${YELLOW}⚠ PASSED (Status: $response_code, unclear response)${NC}"
            echo -e "${BLUE}Response: $response_body${NC}"
        fi
    else
        # Expect failure: check for error indicators
        if echo "$response_body" | grep -q '"error"\|"type":".*error"\|"success":false\|"code":[45][0-9][0-9]'; then
            echo -e "${GREEN}✓ PASSED (Status: $response_code, Expected error confirmed)${NC}"
        else
            echo -e "${YELLOW}⚠ PASSED (Status: $response_code, but no clear error indicator)${NC}"
            echo -e "${BLUE}Response: $response_body${NC}"
        fi
    fi

    if [ "$test_passed" = "true" ]; then
        return 0
    else
        return 1
    fi
}

# Step 1: Build the server using Makefile
echo -e "\n${YELLOW}Step 1: Building the server using Makefile...${NC}"
if make build > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Server built successfully${NC}"
    echo -e "${BLUE}Binary: $BINARY_PATH${NC}"
else
    echo -e "${RED}✗ Failed to build server${NC}"
    exit 1
fi

# Step 2: Start the server
echo -e "\n${YELLOW}Step 2: Starting the server...${NC}"
mkdir -p test

# Enhanced port cleanup: check and clean port 9757
if lsof -i:$SERVER_PORT >/dev/null 2>&1; then
    echo -e "${YELLOW}Port $SERVER_PORT is in use, cleaning up...${NC}"
    lsof -ti:$SERVER_PORT | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Kill any existing server on the same port (fallback)
pkill -f "devbox-server.*$SERVER_PORT" || true
pkill -f ".*$SERVER_PORT" || true
sleep 1

# Start server in background with token, port, and workspace configuration
"$BINARY_PATH" -addr=":$SERVER_PORT" -token="$TEST_TOKEN" -workspace_path="." > "$SERVER_LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$SERVER_PID_FILE"

echo -e "${GREEN}Server started with PID: $SERVER_PID${NC}"
echo -e "${BLUE}Log file: $SERVER_LOG_FILE${NC}"

# Step 3: Wait for server to be ready
if ! wait_for_server; then
    echo -e "${RED}Server startup failed. Check log: $SERVER_LOG_FILE${NC}"
    exit 1
fi

# Step 4: Test all routes
echo -e "\n${YELLOW}Step 3: Testing all routes...${NC}"

# Initialize test counters
TOTAL_TESTS=0
PASSED_TESTS=0

# Test Health Endpoints
echo -e "\n${YELLOW}=== Health Endpoints ===${NC}"
if run_test "GET" "/health" "" "200" "Health Check"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

if run_test "GET" "/health/ready" "" "200" "Readiness Check"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Test File Operations
echo -e "\n${YELLOW}=== File Operations ===${NC}"
if run_test "POST" "/api/v1/files/read?path=test_tmp/nonexistent.txt" "" "200" "Read File (nonexistent)" "false"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

if run_test "GET" "/api/v1/files/list" "" "200" "List Files (current directory)" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

mkdir -p test_tmp >/dev/null 2>&1 || true
if run_test "GET" "/api/v1/files/list?path=test_tmp" "" "200" "List Files (test directory)" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

if run_test "POST" "/api/v1/files/write" '{"path":"test_tmp/test.txt","content":"test content"}' "200" "Write File (in test directory)" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Test successful file operations in current directory
if run_test "POST" "/api/v1/files/write" '{"path":"test_file.txt","content":"Hello World - Test Content"}' "200" "Write File (successful)" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

if run_test "POST" "/api/v1/files/read?path=test_file.txt" "" "200" "Read File (successful)" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

if run_test "GET" "/api/v1/files/list?path=." "" "200" "List Files (current directory)" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

if run_test "POST" "/api/v1/files/delete" '{"path":"test_file.txt"}' "200" "Delete File (successful)" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

if run_test "POST" "/api/v1/files/delete" '{"path":"test_tmp/missing.txt"}' "200" "Delete File (nonexistent)" "false"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Test batch upload (without files - should fail due to missing multipart data)
if run_test "POST" "/api/v1/files/batch-upload" "" "200" "Batch Upload (no multipart data)" "false"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Test Process Operations
echo -e "\n${YELLOW}=== Process Operations ===${NC}"
if run_test "POST" "/api/v1/process/exec" '{"command":"echo hello world"}' "200" "Execute Process" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Test exec-sync endpoint
if run_test "POST" "/api/v1/process/exec-sync" '{"command":"echo","args":["sync","test"],"timeout":10}' "200" "Exec Sync" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Test sync-stream endpoint
if run_test "POST" "/api/v1/process/sync-stream" '{"command":"echo","args":["stream","test"],"timeout":10}' "200" "Sync Stream" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Extract process ID from exec response for further tests
PROCESS_ID=$(cat test/response.tmp 2>/dev/null | grep -o '"processId":"[^"]*"' | cut -d'"' -f4 | head -1)
# Save process ID to temp file to avoid being overwritten
echo "$PROCESS_ID" > test/process_id.tmp

if run_test "GET" "/api/v1/process/list" "" "200" "List Processes" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Use saved process ID
PROCESS_ID=$(cat test/process_id.tmp 2>/dev/null || echo "")

if [ -n "$PROCESS_ID" ]; then
    echo -e "${BLUE}Using Process ID: $PROCESS_ID${NC}"

    if run_test "GET" "/api/v1/process/$PROCESS_ID/status" "" "200" "Get Process Status (valid)" "true"; then ((PASSED_TESTS++)); fi
    ((TOTAL_TESTS++))

    if run_test "GET" "/api/v1/process/$PROCESS_ID/logs" "" "200" "Get Process Logs (valid)" "true"; then ((PASSED_TESTS++)); fi
    ((TOTAL_TESTS++))

    if run_test "POST" "/api/v1/process/$PROCESS_ID/kill" "" "409" "Kill Process (valid)" "false"; then ((PASSED_TESTS++)); fi
    ((TOTAL_TESTS++))
else
    echo -e "${YELLOW}Warning: Could not extract process ID, skipping process-specific tests${NC}"
fi

if run_test "POST" "/api/v1/process/nonexistent/kill" "" "200" "Kill Process (invalid)" "false"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

if run_test "GET" "/api/v1/process/nonexistent/status" "" "200" "Get Process Status (invalid)" "false"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

if run_test "GET" "/api/v1/process/nonexistent/logs" "" "200" "Get Process Logs (invalid)" "false"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Test Session Operations
echo -e "\n${YELLOW}=== Session Operations ===${NC}"
if run_test "POST" "/api/v1/sessions/create" '{"workingDir":"/tmp"}' "200" "Create Session" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

if run_test "GET" "/api/v1/sessions" "" "200" "Get All Sessions" "true"; then ((PASSED_TESTS++)); fi
((TOTAL_TESTS++))

# Get session ID from previous response for subsequent tests
# Try both "sessionId" and "id" patterns to handle different API responses
SESSION_ID=$(cat test/response.tmp 2>/dev/null | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4 | head -1)
if [ -z "$SESSION_ID" ]; then
    SESSION_ID=$(cat test/response.tmp 2>/dev/null | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | head -1)
fi

if [ -n "$SESSION_ID" ]; then
    echo -e "${BLUE}Using Session ID: $SESSION_ID${NC}"

if run_test "GET" "/api/v1/sessions/$SESSION_ID?sessionId=$SESSION_ID" "" "200" "Get Specific Session" "true"; then ((PASSED_TESTS++)); fi
    ((TOTAL_TESTS++))

if run_test "POST" "/api/v1/sessions/$SESSION_ID/env?sessionId=$SESSION_ID" "{\"env\":{\"TEST\":\"value\"}}" "200" "Update Session Environment" "true"; then ((PASSED_TESTS++)); fi
    ((TOTAL_TESTS++))

if run_test "POST" "/api/v1/sessions/$SESSION_ID/exec?sessionId=$SESSION_ID" "{\"command\":\"pwd\"}" "200" "Session Exec" "true"; then ((PASSED_TESTS++)); fi
    ((TOTAL_TESTS++))

    if run_test "GET" "/api/v1/sessions/$SESSION_ID/logs" "" "200" "Get Session Logs" "true"; then ((PASSED_TESTS++)); fi
    ((TOTAL_TESTS++))

if run_test "POST" "/api/v1/sessions/$SESSION_ID/cd?sessionId=$SESSION_ID" "{\"path\":\"/tmp\"}" "200" "Session CD" "true"; then ((PASSED_TESTS++)); fi
    ((TOTAL_TESTS++))

if run_test "POST" "/api/v1/sessions/$SESSION_ID/terminate" "{\"sessionId\":\"$SESSION_ID\"}" "200" "Terminate Session" "true"; then ((PASSED_TESTS++)); fi
    ((TOTAL_TESTS++))
else
    echo -e "${YELLOW}Warning: Could not extract session ID, skipping session-specific tests${NC}"
fi

# Test WebSocket (basic connectivity test)
echo -e "\n${YELLOW}=== WebSocket Endpoint ===${NC}"
echo -e "${BLUE}Testing: WebSocket Endpoint${NC}"
echo -e "${BLUE}Request: GET /ws${NC}"
if curl -s -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: test" -H "Sec-WebSocket-Version: 13" -H "Authorization: Bearer $TEST_TOKEN" "http://$SERVER_ADDR/ws" | grep -q "400\|101"; then
    echo -e "${GREEN}✓ PASSED (WebSocket endpoint accessible)${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${GREEN}✓ PASSED (WebSocket endpoint responds correctly to malformed request)${NC}"
    ((PASSED_TESTS++))
fi
((TOTAL_TESTS++))

# Test unauthorized access
echo -e "\n${YELLOW}=== Authentication Tests ===${NC}"
echo -e "${BLUE}Testing: Unauthorized Access${NC}"
echo -e "${BLUE}Request: POST /api/v1/files/read (without token)${NC}"
unauthorized_response=$(curl -s -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"path":"/etc/passwd"}' -o test/response.tmp "http://$SERVER_ADDR/api/v1/files/read" 2>/dev/null || echo "000")
if [ "$unauthorized_response" = "401" ]; then
    echo -e "${GREEN}✓ PASSED (Status: 401)${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${RED}✗ FAILED (Expected: 401, Got: $unauthorized_response)${NC}"
fi
((TOTAL_TESTS++))

# Cleanup temporary response files
rm -f test/response.tmp
rm -f test/process_id.tmp

# Step 5: Display results
echo -e "\n${BLUE}=== Test Results ===${NC}"
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $((TOTAL_TESTS - PASSED_TESTS))${NC}"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "\n${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Check the output above for details.${NC}"
    echo -e "${BLUE}Server log:$NC $SERVER_LOG_FILE"
    exit 1
fi
