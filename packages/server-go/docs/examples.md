# API Usage Examples

This document provides detailed examples for common API operations and use cases.

## Authentication

All examples (except health checks) require authentication. Replace `YOUR_TOKEN` with your actual bearer token:

```bash
export TOKEN="YOUR_TOKEN"
export BASE_URL="http://localhost:9757"  # Default port, configurable via ADDR env or -addr flag
```

**Note**: The default port is `:9757`. You can change it using the `ADDR` environment variable or `-addr` command-line flag.

## File Operations

### 1. Write a File

The file write endpoint supports multiple modes via Content-Type routing:

#### Mode 1: JSON - Plain Text

```bash
curl -X POST "$BASE_URL/api/v1/files/write" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tmp/example.txt",
    "content": "Hello, World!\nThis is a test file."
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

#### Mode 2: JSON - Base64 Encoded

Best for small binary files (< 1MB):

```bash
# Encode file to base64
base64_content=$(base64 -w 0 image.png)

curl -X POST "$BASE_URL/api/v1/files/write" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"path\": \"/tmp/image.png\",
    \"content\": \"$base64_content\",
    \"encoding\": \"base64\"
  }"
```

#### Mode 3: Binary Upload via Query Parameter

Best for large files and media (> 1MB). ~25% less bandwidth than base64:

```bash
curl -X POST "$BASE_URL/api/v1/files/write?path=/tmp/photo.jpg" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg
```

#### Mode 5: Binary Upload with Special Characters in Path

Use url-encoded path for filenames with spaces or special characters:

```bash
# Encode path 
path_url=$(echo -n "/tmp/file with spaces.png" | jq -Rr @uri)

curl -X POST "$BASE_URL/api/v1/files/write?path=$path_url" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: image/png" \
  --data-binary @"file with spaces.png"
```

#### Mode 6: Multipart FormData Upload

Standard browser-compatible upload using FormData (best for web applications):

```bash
# Using curl with multipart form
curl -X POST "$BASE_URL/api/v1/files/write" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@document.pdf" \
  -F "path=/tmp/uploaded_document.pdf"

# Without path parameter (uses original filename)
curl -X POST "$BASE_URL/api/v1/files/write" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@photo.jpg"
```

**JavaScript FormData example:**

```javascript
const formData = new FormData();
formData.append('file', fileBlob, 'example.png');
formData.append('path', '/tmp/example.png');

fetch('http://localhost:9757/api/v1/files/write', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: formData
});
```

**Performance Comparison:**

| Mode | File Size | Bandwidth | CPU | Best For |
|------|-----------|-----------|-----|----------|
| JSON Text | < 100KB | 1.0x | Low | Config files |
| JSON Base64 | < 1MB | 1.33x | Medium | Small binaries |
| Binary Upload | Any | 1.0x | Low | Large files, media |
| Multipart FormData | Any | 1.10-1.15x | Low | Web browsers, standard tools |

### 2. Read a File

```bash
curl -X GET "$BASE_URL/api/v1/files/read?path=/tmp/example.txt" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
Binary file content with appropriate Content-Type and Content-Disposition headers.

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

### 5. Download a Single File

```bash
curl -X GET "$BASE_URL/api/v1/files/download?path=/tmp/example.txt" \
  -H "Authorization: Bearer $TOKEN" \
  -o example.txt
```

**Response:**
Binary file content with Content-Disposition header for download.

### 6. Batch Download Files

```bash
# Download multiple files as tar.gz (default)
curl -X POST "$BASE_URL/api/v1/files/batch-download" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "paths": ["/tmp/file1.txt", "/tmp/file2.txt"]
  }' \
  -o files.tar.gz

# Download as uncompressed tar
curl -X POST "$BASE_URL/api/v1/files/batch-download" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "paths": ["/tmp/file1.txt", "/tmp/file2.txt"],
    "format": "tar"
  }' \
  -o files.tar

# Download as multipart format
curl -X POST "$BASE_URL/api/v1/files/batch-download" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: multipart/mixed" \
  -d '{
    "paths": ["/tmp/file1.txt", "/tmp/file2.txt"]
  }' \
  -o files.multipart
```

### 7. Batch Upload Files

```bash
curl -X POST "$BASE_URL/api/v1/files/batch-upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@tmp/file1.txt" \
  -F "files=@/tmp/data/file2.txt"
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
curl -X GET "$BASE_URL/api/v1/process/550e8400-e29b-41d4-a716-446655440000/status" \
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
curl -X GET "$BASE_URL/api/v1/process/550e8400-e29b-41d4-a716-446655440000/logs" \
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
curl -X POST "$BASE_URL/api/v1/process/550e8400-e29b-41d4-a716-446655440000/kill?signal=SIGTERM" \
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
      "targetId": "550e8400-e29b-41d4-a716-446655440000",
      "targetType": "session"
    },
    {
      "level": "stdout",
      "content": "/home/user",
      "timestamp": 1640995201000,
      "sequence": 2,
      "targetId": "550e8400-e29b-41d4-a716-446655440000",
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

**Note**: Health check endpoints do not require authentication and can be accessed directly.

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

### 3. Liveness Check

```bash
curl -X GET "$BASE_URL/health/live"
```

**Response:**
```json
{
  "status": "alive",
  "timestamp": "2024-01-01T12:00:00Z",
  "uptime": 3600,
  "version": "1.0.0"
}
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
   wscat -c "ws://localhost:9757/ws" -H "Authorization: Bearer $TOKEN"
   ```

3. **Subscribe to process logs:**
   ```json
   {
     "action": "subscribe",
     "type": "process",
     "targetId": "550e8400-e29b-41d4-a716-446655440000",
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
     "targetId": "550e8400-e29b-41d4-a716-446655440000",
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
     "targetId": "550e8400-e29b-41d4-a716-446655440000"
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
