#!/bin/bash

# Server configuration
SERVER_PORT=9759
SERVER_ADDR="127.0.0.1:$SERVER_PORT"
SERVER_PID_FILE="test/server_kill_repro.pid"
SERVER_LOG_FILE="test/server_kill_repro.log"
BINARY_PATH="./target/release/server-rust"
TEST_TOKEN="test-token-kill-repro"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    if [ -f "$SERVER_PID_FILE" ]; then
        SERVER_PID=$(cat "$SERVER_PID_FILE")
        kill "$SERVER_PID" 2>/dev/null || true
        rm -f "$SERVER_PID_FILE"
    fi
    rm -f "$SERVER_LOG_FILE"
}
trap cleanup EXIT

ensure_server() {
    if ! curl -s -H "Authorization: Bearer $TEST_TOKEN" "http://$SERVER_ADDR/health" >/dev/null 2>&1; then
        echo -e "${YELLOW}Starting server...${NC}"
        # Build if needed
        if [ ! -f "$BINARY_PATH" ]; then
             make build > /dev/null 2>&1
        fi
        
        "$BINARY_PATH" --addr="127.0.0.1:$SERVER_PORT" --token="$TEST_TOKEN" --workspace-path="." > "$SERVER_LOG_FILE" 2>&1 &
        echo $! > "$SERVER_PID_FILE"
        sleep 2
    fi
}

ensure_server

echo -e "${YELLOW}Starting a short-lived process...${NC}"
# Start a process that exits quickly
RESPONSE=$(curl -s -X POST "http://$SERVER_ADDR/api/v1/process/exec" \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "command": "echo",
        "args": ["hello"]
    }')

PROCESS_ID=$(echo "$RESPONSE" | jq -r '.Data.processId')
echo -e "Process ID: $PROCESS_ID"

# Wait a bit for it to exit
sleep 1

echo -e "${YELLOW}Attempting to kill the exited process...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://$SERVER_ADDR/api/v1/process/$PROCESS_ID/kill" \
    -H "Authorization: Bearer $TEST_TOKEN")

echo -e "HTTP Code: $HTTP_CODE"

if [ "$HTTP_CODE" == "409" ]; then
    echo -e "${GREEN}Success: Got 409 Conflict${NC}"
    exit 0
else
    echo -e "${RED}Failure: Expected 409, got $HTTP_CODE${NC}"
    exit 1
fi
