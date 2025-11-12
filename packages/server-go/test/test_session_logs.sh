#!/usr/bin/env bash
set -euxo pipefail
# session logs & API detailed test (compact, with debug)

# Config
SERVER_HOST=${SERVER_HOST:-127.0.0.1}
SERVER_PORT=${SERVER_PORT:-32288}
TOKEN=${TEST_TOKEN:-dev-token}
TAIL_LINES=${TAIL_LINES:-60}
STREAM_TIMES=${STREAM_TIMES:-5}
STREAM_SLEEP=${STREAM_SLEEP:-1}
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
ART_DIR="$BASE_DIR"

# Server runtime
BINARY_PATH="./build/devbox-server"
SERVER_PID_FILE="$BASE_DIR/server.pid"
SERVER_LOG_FILE="$BASE_DIR/server.log"
mkdir -p "$BASE_DIR"

# Colors
RED="\033[31m"; GREEN="\033[32m"; YELLOW="\033[33m"; BLUE="\033[34m"; CYAN="\033[36m"; RESET="\033[0m"

log() { echo -e "$CYAN[$(date +%H:%M:%S)]$RESET $1"; }
pass() { echo -e "${GREEN}PASS${RESET} - $1"; }
fail() { echo -e "${RED}FAIL${RESET} - $1"; }
section() { echo -e "\n${BLUE}== $1 ==${RESET}"; }

save() { local f="$ART_DIR/$1"; printf "%s" "$2" > "$f"; log "Saving artifact: $f"; }

# Try multiple base paths
BASE_PATHS=("" "/api/v1")
api() {
  local method="$1"; shift
  local path="$1"; shift
  local data="${1:-}"; local res=""; local code=""; local used=""; local body=""
  for bp in "${BASE_PATHS[@]}"; do
    used="$bp$path"
    if [[ -n "$data" ]]; then
      res=$(curl -sS -k -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -X "$method" "http://$SERVER_HOST:$SERVER_PORT$used" -d "$data" -w "\n__CODE__:%{http_code}") || true
    else
      res=$(curl -sS -k -H "Authorization: Bearer $TOKEN" -X "$method" "http://$SERVER_HOST:$SERVER_PORT$used" -w "\n__CODE__:%{http_code}") || true
    fi
    code=$(echo "$res" | sed -n 's/^__CODE__://p')
    body=$(echo "$res" | sed '/^__CODE__:/d')
    if [[ "$code" == "200" || "$code" == "201" ]]; then
      echo "$code"; echo "$used"; echo "$body"; return 0
    fi
  done
  echo "${code:-}"; echo "$used"; echo "$body"; return 0
}

# Utilities for pretty JSON
has_jq() { command -v jq >/dev/null 2>&1; }
pretty_json() {
  if has_jq; then
    if out=$(jq -C . 2>/dev/null); then
      printf '%s\n' "$out"
    else
      cat
    fi
  else
    cat
  fi
}

# Server management
wait_for_server() {
  log "Waiting for service to start..."
  local max_attempts=30 attempt=1
  while [[ $attempt -le $max_attempts ]]; do
    if curl -s -H "Authorization: Bearer $TOKEN" "http://$SERVER_HOST:$SERVER_PORT/health" >/dev/null; then
      pass "Service is ready"
      return 0
    fi
    log "Attempt $attempt/$max_attempts: not ready"
    sleep 1
    attempt=$((attempt+1))
  done
  fail "Service startup timeout"; return 1
}

ensure_server() {
  if ! curl -s -H "Authorization: Bearer $TOKEN" "http://$SERVER_HOST:$SERVER_PORT/health" >/dev/null 2>&1; then
    log "Service not running, attempting to build and start..."
    if [[ ! -x "$BINARY_PATH" ]]; then
      if [[ -f Makefile ]]; then
        log "Executing make build"
        make build >/dev/null
      else
        log "Executing make -C packages/server-go build"
        make -C packages/server-go build >/dev/null
      fi
    fi
    # Clean up port occupation
    if lsof -i:"$SERVER_PORT" >/dev/null 2>&1; then
      log "Port $SERVER_PORT is occupied, cleaning up..."
      lsof -ti:"$SERVER_PORT" | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
    # Start service
    log "Starting: $BINARY_PATH -addr=:$SERVER_PORT -token=$TOKEN"
    "$BINARY_PATH" -addr=":$SERVER_PORT" -token="$TOKEN" -workspace_path="." > "$SERVER_LOG_FILE" 2>&1 &
    echo $! > "$SERVER_PID_FILE"
    log "Service started (PID $(cat "$SERVER_PID_FILE"))"
    wait_for_server || { fail "Service not ready"; exit 1; }
  else
    pass "Detected service is running"
  fi
}

cleanup() {
  log "Cleaning up resources..."
  if [[ -f "$SERVER_PID_FILE" ]]; then
    local pid; pid=$(cat "$SERVER_PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      log "Stopping service (PID: $pid)"
      kill "$pid" || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$SERVER_PID_FILE"
  fi
  pass "Cleanup completed"
}
trap cleanup EXIT

expect_contains() { local text="$1"; local needle="$2"; if echo "$text" | grep -q "$needle"; then pass "Contains: $needle"; else fail "Does not contain: $needle"; fi }

# Health
ensure_server

section "Health Check"
read code used body < <(api GET "/health")
save "health.json" "$body"
log "Health interface path: $used status code: ${code:-N/A}"; [[ "${code:-}" == "200" ]] && pass "healthz normal" || fail "healthz abnormal"

# Create sessions
section "Create Sessions"
read c1 u1 b1 < <(api POST "/api/v1/sessions/create" "{\"working_dir\":\"/tmp\"}")
save "session_create_simple.json" "$b1"
sid_simple=$(echo "$b1" | sed -n 's/.*"sessionId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[[ -n "${sid_simple:-}" ]] && pass "Created session: $sid_simple" || fail "Failed to create simple session"

read c2 u2 b2 < <(api POST "/api/v1/sessions/create" "{}")
save "session_create_interactive.json" "$b2"
sid_inter=$(echo "$b2" | sed -n 's/.*"sessionId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[[ -n "${sid_inter:-}" ]] && pass "Created session: $sid_inter" || fail "Failed to create interactive session"

read c3 u3 b3 < <(api POST "/api/v1/sessions/create" "{}")
save "session_create_error.json" "$b3"
sid_err=$(echo "$b3" | sed -n 's/.*"sessionId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[[ -n "${sid_err:-}" ]] && pass "Created session (for error execution): $sid_err" || fail "Failed to create error session"

# Status
section "Query Status"
if [[ -n "${sid_simple:-}" ]]; then
  read cs us bs < <(api GET "/api/v1/sessions/$sid_simple?sessionId=$sid_simple")
  save "session_status_simple.json" "$bs"
  expect_contains "$bs" "status"
fi
if [[ -n "${sid_inter:-}" ]]; then
  read ci ui bi < <(api GET "/api/v1/sessions/$sid_inter?sessionId=$sid_inter")
  save "session_status_interactive.json" "$bi"
  expect_contains "$bi" "status"
fi

# Logs
section "Get Logs"
if [[ -n "${sid_simple:-}" ]]; then
  read cl ul bl < <(api GET "/api/v1/sessions/$sid_simple/logs?id=$sid_simple&tail=$TAIL_LINES")
  save "session_logs_simple.json" "$bl"
  expect_contains "$bl" "logs"
fi
if [[ -n "${sid_err:-}" ]]; then
  read ce ue be < <(api GET "/api/v1/sessions/$sid_err/logs?id=$sid_err&tail=$TAIL_LINES")
  save "session_logs_error.json" "$be"
  expect_contains "$be" "logs"
fi

# Exec on interactive
section "Interactive Session Execute Command"
if [[ -n "${sid_inter:-}" ]]; then
  read cx ux bx < <(api POST "/api/v1/sessions/$sid_inter/exec?sessionId=$sid_inter" "{\"command\":\"echo run-interactive\"}")
  save "session_exec_interactive.json" "$bx"
  expect_contains "$bx" "run-interactive"
fi

# Env update
section "Update Environment Variables"
if [[ -n "${sid_inter:-}" ]]; then
  read cv uv bv < <(api POST "/api/v1/sessions/$sid_inter/env?sessionId=$sid_inter" "{\"env\":{\"FOO\":\"BAR\"}}")
  save "session_env_update.json" "$bv"
  expect_contains "$bv" "success"
fi

# Change directory
section "Change Working Directory"
if [[ -n "${sid_inter:-}" ]]; then
  read cdcode cdurl cdbody < <(api POST "/api/v1/sessions/$sid_inter/cd?sessionId=$sid_inter" "{\"path\":\"/tmp\"}")
  save "session_cd.json" "$cdbody"
  expect_contains "$cdbody" "workingDir"
fi

# Pseudo streaming logs
section "Pseudo Streaming Logs"
if [[ -n "${sid_inter:-}" ]]; then
  stream_file="$ART_DIR/session_stream_interactive.txt"
  : > "$stream_file"
  for i in $(seq 1 "$STREAM_TIMES"); do
    read sl su sb < <(api GET "/api/v1/sessions/$sid_inter/logs?id=$sid_inter&tail=$TAIL_LINES")
    echo "--- tick $i ---" >> "$stream_file"
    echo "$sb" >> "$stream_file"
    sleep "$STREAM_SLEEP"
  done
log "Generated streaming logs: $stream_file"
fi

# List sessions
section "List Sessions"
read clist ulist blist < <(api GET "/api/v1/sessions")
save "session_list.json" "$blist"
expect_contains "$blist" "count"

# Terminate sessions
section "Terminate Sessions"
for sid in "$sid_simple" "$sid_inter" "$sid_err"; do
  if [[ -n "${sid:-}" ]]; then
    read ct ut bt < <(api POST "/api/v1/sessions/$sid/terminate" "{\"session_id\":\"$sid\"}")
    save "session_terminate_$sid.json" "$bt"
    expect_contains "$bt" "terminated"
  fi
done

section "Summary"
echo -e "${YELLOW}Artifact directory: $ART_DIR${RESET}"
ls -1 "$ART_DIR" | sed 's/^/ - /'

echo -e "${GREEN}Test completed${RESET}"