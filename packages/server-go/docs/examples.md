# API Usage Examples

This document provides detailed examples for common API operations and use cases.

## Authentication

All examples (except health checks) require authentication. Replace `YOUR_TOKEN` with your actual bearer token:

```bash
export TOKEN="YOUR_TOKEN"
export BASE_URL="http://localhost:8080"
```

## File Operations

### 1. Write a File

```bash
curl -X POST "$BASE_URL/api/v1/files/write" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tmp/example.txt",
    "content": "Hello, World!\nThis is a test file.",
    "encoding": "utf-8",
    "permissions": "0644"
  }'
```

**Response:**
```json
{
  "success": true,
  "path": "/tmp/example.txt",
  "size": 32,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 2. Read a File

#### Method 1: Using JSON body
```bash
curl -X POST "$BASE_URL/api/v1/files/read" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path": "/tmp/example.txt"}'
```

#### Method 2: Using query parameter
```bash
curl -X POST "$BASE_URL/api/v1/files/read?path=/tmp/example.txt" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "path": "/tmp/example.txt",
  "content": "Hello, World!\nThis is a test file.",
  "size": 32
}
```

### 3. List Directory Contents

```bash
curl -X GET "$BASE_URL/api/v1/files/list?path=/tmp&showHidden=false&limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "files": [
    {
      "name": "example.txt",
      "path": "/tmp/example.txt",
      "size": 32,
      "isDir": false,
      "modTime": "2024-01-01T12:00:00Z"
    },
    {
      "name": "logs",
      "path": "/tmp/logs",
      "size": 4096,
      "isDir": true,
      "modTime": "2024-01-01T11:30:00Z"
    }
  ],
  "count": 2
}
```

### 4. Delete a File

```bash
curl -X POST "$BASE_URL/api/v1/files/delete" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tmp/example.txt",
    "recursive": false
  }'
```

**Response:**
```json
{
  "success": true,
  "path": "/tmp/example.txt",
  "timestamp": "2024-01-01T12:05:00Z"
}
```

### 5. Batch Upload Files

```bash
curl -X POST "$BASE_URL/api/v1/files/batch-upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "targetDir=/tmp/uploads" \
  -F "files=@file1.txt" \
  -F "files=@file2.txt"
```

## Process Operations

### 1. Execute Process Asynchronously

```bash
curl -X POST "$BASE_URL/api/v1/process/exec" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "python",
    "args": ["-c", "import time; time.sleep(5); print(\"Done\")"],
    "cwd": "/tmp",
    "env": {
      "PYTHONPATH": "/usr/lib/python3",
      "DEBUG": "true"
    },
    "timeout": 300
  }'
```

**Response:**
```json
{
  "success": true,
  "processId": "550e8400-e29b-41d4-a716-446655440000",
  "pid": 12345,
  "status": "running"
}
```

### 2. Execute Process Synchronously

```bash
curl -X POST "$BASE_URL/api/v1/process/exec-sync" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "echo",
    "args": ["Hello World"],
    "timeout": 30
  }'
```

**Response:**
```json
{
  "success": true,
  "stdout": "Hello World\n",
  "stderr": "",
  "exitCode": 0,
  "duration": 15,
  "startTime": 1640995200,
  "endTime": 1640995201
}
```

### 3. List All Processes

```bash
curl -X GET "$BASE_URL/api/v1/process/list" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "processes": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "pid": 12345,
      "command": "python",
      "status": "running",
      "startTime": 1640995200,
      "endTime": null,
      "exitCode": null
    }
  ]
}
```

### 4. Get Process Status

```bash
curl -X GET "$BASE_URL/api/v1/process/550e8400-e29b-41d4-a716-446655440000/status?id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "processId": "550e8400-e29b-41d4-a716-446655440000",
  "pid": 12345,
  "status": "running",
  "startAt": "2024-01-01T12:00:00Z"
}
```

### 5. Get Process Logs

```bash
curl -X GET "$BASE_URL/api/v1/process/550e8400-e29b-41d4-a716-446655440000/logs?id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "processId": "550e8400-e29b-41d4-a716-446655440000",
  "logs": [
    "Starting Python process...",
    "Executing script...",
    "Done"
  ]
}
```

### 6. Kill a Process

```bash
curl -X POST "$BASE_URL/api/v1/process/550e8400-e29b-41d4-a716-446655440000/kill?id=550e8400-e29b-41d4-a716-446655440000&signal=SIGTERM" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true
}
```

## Session Operations

### 1. Create a Session

```bash
curl -X POST "$BASE_URL/api/v1/sessions/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workingDir": "/home/user",
    "env": {
      "PATH": "/usr/bin:/bin:/usr/local/bin",
      "DEBUG": "true"
    },
    "shell": "/bin/bash"
  }'
```

**Response:**
```json
{
  "success": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "shell": "/bin/bash",
  "cwd": "/home/user",
  "status": "active"
}
```

### 2. List All Sessions

```bash
curl -X GET "$BASE_URL/api/v1/sessions" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "shell": "/bin/bash",
      "cwd": "/home/user",
      "env": {
        "PATH": "/usr/bin:/bin:/usr/local/bin",
        "DEBUG": "true"
      },
      "createdAt": "2024-01-01T12:00:00Z",
      "lastUsedAt": "2024-01-01T12:05:00Z",
      "status": "active"
    }
  ]
}
```

### 3. Execute Command in Session

```bash
curl -X POST "$BASE_URL/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000/exec" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "pwd"
  }'
```

**Response:**
```json
{
  "success": true,
  "stdout": "/home/user\n",
  "stderr": "",
  "exitCode": 0
}
```

### 4. Change Directory in Session

```bash
curl -X POST "$BASE_URL/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000/cd" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tmp"
  }'
```

**Response:**
```json
{
  "success": true
}
```

### 5. Update Session Environment

```bash
curl -X POST "$BASE_URL/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000/env" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "env": {
      "NEW_VAR": "value",
      "PATH": "/usr/bin:/bin:/usr/local/bin:/new/path"
    }
  }'
```

**Response:**
```json
{
  "success": true
}
```

### 6. Get Session Logs

```bash
curl -X GET "$BASE_URL/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000/logs?levels=stdout,stderr&limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "logs": [
    {
      "level": "stdout",
      "content": "Session started",
      "timestamp": 1640995200000,
      "sequence": 1,
      "target_id": "550e8400-e29b-41d4-a716-446655440000",
      "targetType": "session"
    },
    {
      "level": "stdout",
      "content": "/home/user",
      "timestamp": 1640995201000,
      "sequence": 2,
      "target_id": "550e8400-e29b-41d4-a716-446655440000",
      "targetType": "session"
    }
  ]
}
```

### 7. Terminate Session

```bash
curl -X POST "$BASE_URL/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000/terminate" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true
}
```

## Health Checks

### 1. Basic Health Check

```bash
curl -X GET "$BASE_URL/health"
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### 2. Readiness Check

```bash
curl -X GET "$BASE_URL/health/ready"
```

**Response (Ready):**
```json
{
  "status": "ready",
  "ready": true,
  "timestamp": "2024-01-01T12:00:00Z",
  "checks": {
    "filesystem": true
  }
}
```

**Response (Not Ready):**
```json
{
  "status": "not_ready",
  "ready": false,
  "timestamp": "2024-01-01T12:00:00Z",
  "checks": {
    "filesystem": false
  }
}
```

## WebSocket Examples

### Using wscat (WebSocket CLI tool)

1. **Install wscat:**
   ```bash
   npm install -g wscat
   ```

2. **Connect to WebSocket:**
   ```bash
   wscat -c "ws://localhost:8080/ws" -H "Authorization: Bearer $TOKEN"
   ```

3. **Subscribe to process logs:**
   ```json
   {
     "action": "subscribe",
     "type": "process",
     "target_id": "550e8400-e29b-41d4-a716-446655440000",
     "options": {
       "levels": ["stdout", "stderr"],
       "tail": 50,
       "follow": true
     }
   }
   ```

4. **Receive log messages:**
   ```json
   {
     "type": "log",
     "dataType": "process",
     "target_id": "550e8400-e29b-41d4-a716-446655440000",
     "log": {
       "level": "stdout",
       "content": "Process output line",
       "timestamp": 1640995200000,
       "sequence": 1
     },
     "sequence": 1,
     "isHistory": false
   }
   ```

5. **Unsubscribe:**
   ```json
   {
     "action": "unsubscribe",
     "type": "process",
     "target_id": "550e8400-e29b-41d4-a716-446655440000"
   }
   ```

## Error Handling Examples

### Common Error Responses

**Bad Request (400):**
```json
{
  "error": "Command is required",
  "code": "INVALID_REQUEST",
  "timestamp": 1640995200000
}
```

**Unauthorized (401):**
```json
{
  "error": "Authentication required",
  "code": "UNAUTHORIZED",
  "timestamp": 1640995200000
}
```

**Not Found (404):**
```json
{
  "error": "Process not found",
  "code": "NOT_FOUND",
  "timestamp": 1640995200000
}
```

**Conflict (409):**
```json
{
  "error": "Process is not running",
  "code": "CONFLICT",
  "timestamp": 1640995200000
}
```

## Advanced Examples

### 1. File Processing Pipeline

```bash
# Step 1: Write a Python script
curl -X POST "$BASE_URL/api/v1/files/write" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tmp/process_data.py",
    "content": "import json\nimport sys\n\ndata = json.loads(sys.stdin.read())\nprocessed = {\"count\": len(data), \"items\": data}\nprint(json.dumps(processed))\n"
  }'

# Step 2: Write input data
curl -X POST "$BASE_URL/api/v1/files/write" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tmp/input.json",
    "content": "[{\"name\": \"item1\"}, {\"name\": \"item2\"}, {\"name\": \"item3\"}]"
  }'

# Step 3: Execute the processing script
curl -X POST "$BASE_URL/api/v1/process/exec-sync" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "python",
    "args": ["/tmp/process_data.py"],
    "cwd": "/tmp",
    "env": {"PYTHONPATH": "/tmp"}
  }'
```

### 2. Session-based Workflow

```bash
# Create a session
SESSION_ID=$(curl -s -X POST "$BASE_URL/api/v1/sessions/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workingDir": "/tmp", "shell": "/bin/bash"}' | \
  jq -r '.sessionId')

# Execute multiple commands in the session
curl -X POST "$BASE_URL/api/v1/sessions/$SESSION_ID/exec" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": "echo \"Starting work\""}'

curl -X POST "$BASE_URL/api/v1/sessions/$SESSION_ID/exec" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": "ls -la"}'

curl -X POST "$BASE_URL/api/v1/sessions/$SESSION_ID/exec" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": "echo \"Work completed\""}'

# Get session logs
curl -X GET "$BASE_URL/api/v1/sessions/$SESSION_ID/logs" \
  -H "Authorization: Bearer $TOKEN"
```

These examples demonstrate the full capabilities of the DevBox SDK Server API. You can adapt and combine these patterns to fit your specific use cases.