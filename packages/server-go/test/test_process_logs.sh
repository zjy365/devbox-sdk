#!/usr/bin/env bash

# Dedicated test script for process logs functionality
# - Builds/starts server if needed
# - Creates multiple processes (long, short, noisy)
# - Validates list, status, logs, and streaming logs
# - Prints detailed results and cleans up

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

SERVER_PORT=${SERVER_PORT:-9757}
SERVER_ADDR="127.0.0.1:${SERVER_PORT}"
BINARY_PATH="./build/devbox-server"
SERVER_PID_FILE="test/server.pid"
SERVER_LOG_FILE="test/server.log"
TEST_TOKEN=${TEST_TOKEN:-test-token-123}

mkdir -p test

# ----- Pretty helpers -----
has_jq() { command -v jq >/dev/null 2>&1; }
json_pretty() {
  if has_jq; then
    # Avoid exiting on jq parse errors under set -euo pipefail
    if out=$(jq -C . 2>/dev/null); then
      printf '%s\n' "$out"
    else
      cat
    fi
  else
    cat
  fi
}

# Write logs to stderr to avoid polluting captured responses
log_req()  { >&2 echo -e "${CYAN}$*${NC}"; }
log_resp() { >&2 echo -e "${MAGENTA}$*${NC}"; }
log_info() { >&2 echo -e "${BLUE}$*${NC}"; }
log_warn() { >&2 echo -e "${YELLOW}$*${NC}"; }
log_err()  { >&2 echo -e "${RED}$*${NC}"; }
log_ok()   { >&2 echo -e "${GREEN}$*${NC}"; }

# ----- Result tracking -----
PASS_COUNT=0
FAIL_COUNT=0
FAILED_CASES=()
pass() { PASS_COUNT=$((PASS_COUNT+1)); log_ok "$1"; }
fail() { FAIL_COUNT=$((FAIL_COUNT+1)); FAILED_CASES+=("$1"); log_err "$1"; }

cleanup() {
  log_warn "Cleaning up..."
  if [ -f "$SERVER_PID_FILE" ]; then
    SERVER_PID=$(cat "$SERVER_PID_FILE")
    if kill -0 "$SERVER_PID" 2>/dev/null; then
      log_warn "Stopping server (PID: $SERVER_PID)"
      kill "$SERVER_PID" || true
      sleep 1
      kill -9 "$SERVER_PID" 2>/dev/null || true
    fi
    rm -f "$SERVER_PID_FILE"
  fi
  # Free the port if occupied
  if lsof -i:"$SERVER_PORT" >/dev/null 2>&1; then
    log_warn "Force cleaning port $SERVER_PORT"
    lsof -ti:"$SERVER_PORT" | xargs kill -9 2>/dev/null || true
  fi
  pkill -f "devbox-server.*$SERVER_PORT" 2>/dev/null || true
  pkill -f ".$SERVER_PORT" 2>/dev/null || true
  log_ok "Cleanup complete."
}
trap cleanup EXIT

wait_for_server() {
  log_info "Waiting for server to be ready..."
  local max_attempts=30 attempt=1
  while [ $attempt -le $max_attempts ]; do
    if curl -s -H "Authorization: Bearer $TEST_TOKEN" "http://$SERVER_ADDR/health" >/dev/null; then
      log_ok "Server is ready"
      return 0
    fi
    log_warn "Attempt $attempt/$max_attempts: not ready"
    sleep 1
    attempt=$((attempt+1))
  done
  log_err "Server failed to start in time"
  return 1
}

ensure_server() {
  if ! curl -s -H "Authorization: Bearer $TEST_TOKEN" "http://$SERVER_ADDR/health" >/dev/null 2>&1; then
    log_warn "Server not running; building and starting..."
    if [ ! -x "$BINARY_PATH" ]; then
      log_info "Building server binary..."
      if [ -f Makefile ]; then
        make build >/dev/null
      else
        make -C packages/server-go build >/dev/null
      fi
    fi
    # Kill existing port users
    if lsof -i:"$SERVER_PORT" >/dev/null 2>&1; then
      log_warn "Port $SERVER_PORT in use; cleaning..."
      lsof -ti:"$SERVER_PORT" | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
    # Start server
    log_req "Starting: $BINARY_PATH -addr=:$SERVER_PORT -token=$TEST_TOKEN"
    "$BINARY_PATH" -addr=":$SERVER_PORT" -token="$TEST_TOKEN" -workspace_path="." > "$SERVER_LOG_FILE" 2>&1 &
    echo $! > "$SERVER_PID_FILE"
    log_ok "Server started (PID $(cat "$SERVER_PID_FILE"))"
    wait_for_server || { log_err "Server not ready"; exit 1; }
  else
    log_ok "Server appears to be running"
  fi
}

api_post() { # method POST
  local url="$1"; shift
  local data="$1"; shift || true
  log_req "POST http://$SERVER_ADDR$url"
  log_req "Body: $data"
  curl -s -w '\nHTTP_STATUS:%{http_code}' -X POST \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$data" "http://$SERVER_ADDR$url"
}

api_get() { # method GET
  local url="$1"; shift
  log_req "GET http://$SERVER_ADDR$url"
  curl -s -w '\nHTTP_STATUS:%{http_code}' -X GET \
    -H "Authorization: Bearer $TEST_TOKEN" \
    "http://$SERVER_ADDR$url"
}

parse_http_status() {
  echo "$1" | awk -F'HTTP_STATUS:' '{print $2}' | tr -d '\r' | tail -n1
}

extract_body() {
  echo "$1" | sed '/HTTP_STATUS:/d'
}

show_response() {
  local name="$1"; shift
  local status="$1"; shift
  local body="$1"; shift
  log_resp "Response ($name) HTTP $status:"
  if has_jq; then
    if out=$(printf '%s' "$body" | jq -C . 2>/dev/null); then
      printf '%s\n' "$out"
    else
      printf '%s\n' "$body"
    fi
  else
    printf '%s\n' "$body"
  fi
}

expect_json_field() {
  local body="$1"; shift
  local jq_path="$1"; shift
  local expected="$1"; shift
  local actual
  if has_jq; then
    if actual=$(printf '%s' "$body" | jq -r "$jq_path" 2>/dev/null); then
      :
    else
      actual="<jq-error>"
    fi
  else
    actual="<jq-missing>"
  fi
  if [ "$actual" = "$expected" ]; then
    pass "Validate $jq_path == '$expected'"
  else
    fail "Validate $jq_path expected '$expected', got '$actual'"
  fi
}

start_process() {
  local desc="$1"; shift
  local req_json="$1"; shift
  log_info "Starting process: $desc"
  local resp
  resp=$(api_post "/api/v1/process/exec" "$req_json")
  local status; status=$(parse_http_status "$resp")
  local body; body=$(extract_body "$resp")
  echo "$body" > "test/exec_${desc// /_}.json"
  show_response "exec $desc" "$status" "$body"
  if [ "$status" != "200" ]; then
    fail "Exec $desc failed (HTTP $status)"; exit 1
  fi
  local process_id
  if has_jq; then
    process_id=$(printf '%s' "$body" | jq -r '.processId' 2>/dev/null || echo "")
  else
    process_id=$(echo "$body" | sed -n 's/.*"processId"\s*:\s*"\([^"]*\)".*/\1/p')
  fi
  if [ -z "$process_id" ] || [ "$process_id" = "null" ]; then
    fail "Exec $desc returned empty processId"; printf '%s\n' "$body"; exit 1
  fi
  pass "Exec $desc started process: $process_id"
  echo "$process_id"
}

get_status() {
  local pid="$1"; shift
  local resp; resp=$(api_get "/api/v1/process/${pid}/status?id=${pid}")
  local status; status=$(parse_http_status "$resp")
  local body; body=$(extract_body "$resp")
  echo "$body" > "test/status_${pid}.json"
  show_response "status $pid" "$status" "$body"
  expect_json_field "$body" '.processId' "$pid"
}

get_logs() {
  local pid="$1"; shift
  local resp; resp=$(api_get "/api/v1/process/${pid}/logs?id=${pid}")
  local status; status=$(parse_http_status "$resp")
  local body; body=$(extract_body "$resp")
  echo "$body" > "test/logs_${pid}.json"
  show_response "logs $pid" "$status" "$body"
  local count
  if has_jq; then
    count=$(printf '%s' "$body" | jq -r '.logs | length' 2>/dev/null || echo 0)
  else
    count=$(echo "$body" | grep -c '"logs"')
  fi
  if [ "$count" -eq 0 ]; then
    log_warn "No logs returned for $pid"
  else
    pass "Got $count logs for $pid"
  fi
  # Print first few log lines for clarity
  log_info "First logs for $pid:"
  if has_jq; then
    printf '%s' "$body" | jq -r '.logs[] | "[\(.timestamp // "-")] \(.content // "")"' 2>/dev/null | sed 's/^/  /' | head -n 20
  else
    echo "$body" | sed 's/^/  /' | head -n 20
  fi
}

stream_logs() {
  local pid="$1"; shift
  log_info "Streaming logs for $pid (3s)..."
  local url="http://$SERVER_ADDR/api/v1/process/${pid}/logs?id=${pid}&stream=true"
  # Capture a few seconds of stream
  timeout 3 curl -s -N -H "Authorization: Bearer $TEST_TOKEN" "$url" | tee "test/stream_${pid}.txt" >/dev/null || true
  local lines; lines=$(wc -l < "test/stream_${pid}.txt" || echo 0)
  if [ "$lines" -gt 0 ]; then
    pass "Stream captured $lines lines for $pid"
    log_info "Stream sample for $pid:"
    head -n 20 "test/stream_${pid}.txt" | sed 's/^/  /'
  else
    fail "No stream output captured for $pid"
  fi
}

list_processes() {
  log_info "Listing processes..."
  local list_resp; list_resp=$(api_get "/api/v1/process/list")
  local status; status=$(parse_http_status "$list_resp")
  local body; body=$(extract_body "$list_resp")
  echo "$body" > test/process_list.json
  show_response "process list" "$status" "$body"
  local total
  if has_jq; then
    total=$(printf '%s' "$body" | jq -r '.processes | length' 2>/dev/null || echo 0)
  else
    total=$(echo "$body" | grep -c '"processes"')
  fi
  if [ "$total" -gt 0 ]; then
    pass "Process list contains $total entries"
  else
    fail "Process list empty"
  fi
}

summary() {
  log_info "\n=== Summary Report ==="
  echo -e "Tests passed: ${GREEN}${PASS_COUNT}${NC}" >&2
  echo -e "Tests failed: ${RED}${FAIL_COUNT}${NC}" >&2
  if [ "$FAIL_COUNT" -gt 0 ]; then
    log_err "Failed cases:"
    for c in "${FAILED_CASES[@]}"; do
      >&2 echo -e "  - ${RED}$c${NC}"
    done
  fi
  log_info "Artifacts written to: test/"
}

main() {
  log_info "=== Process Logs Test ==="
  ensure_server

  # 1) Short process with stdout/stderr
  pid1=$(start_process "short_echo" '{"Command":"sh","Args":["-c","echo short-out; echo short-err 1>&2"]}')
  sleep 0.2
  get_status "$pid1"
  get_logs "$pid1"
  # Validate expected content in logs
  if grep -q "short-out" "test/logs_${pid1}.json"; then
    pass "Logs contain 'short-out' for $pid1"
  else
    fail "Logs missing 'short-out' for $pid1"
  fi
  if grep -q "short-err" "test/logs_${pid1}.json"; then
    pass "Logs contain 'short-err' for $pid1"
  else
    fail "Logs missing 'short-err' for $pid1"
  fi
  stream_logs "$pid1"
  if grep -q "short-out" "test/stream_${pid1}.txt"; then
    pass "Stream contains 'short-out' for $pid1"
  else
    log_warn "Stream may be empty or short-out not present for $pid1"
  fi

  # 2) Long-running process producing incremental output
  pid2=$(start_process "long_increment" '{"Command":"sh","Args":["-c","for i in $(seq 1 5); do echo tick-$i; sleep 0.5; done"]}')
  sleep 0.5
  get_status "$pid2"
  get_logs "$pid2"
  if grep -q "tick-1" "test/logs_${pid2}.json"; then
    pass "Logs contain 'tick-1' for $pid2"
  else
    fail "Logs missing 'tick-1' for $pid2"
  fi
  stream_logs "$pid2"
  if grep -q "tick-" "test/stream_${pid2}.txt"; then
    pass "Stream contains incremental 'tick-' output for $pid2"
  else
    log_warn "Stream may be empty or doesn't show ticks for $pid2"
  fi

  # 3) Quiet process (true)
  pid3=$(start_process "quiet_true" '{"Command":"true"}')
  sleep 0.2
  get_status "$pid3"
  get_logs "$pid3"
  stream_logs "$pid3"

  list_processes
  summary
  if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
  fi

  log_ok "Process logs test completed successfully."
}

main "$@"
