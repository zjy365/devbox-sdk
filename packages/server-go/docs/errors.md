# Error Handling Documentation

This document describes the error handling system used by the DevBox SDK Server API, including error codes, HTTP status codes, and best practices for handling errors in client applications.

## Error Response Format

All API errors follow a consistent JSON format:

```json
{
  "error": "Human-readable error description",
  "code": "MACHINE_READABLE_ERROR_CODE",
  "timestamp": 1640995200000
}
```

### Fields

- **error** (string, required): Human-readable description of the error
- **code** (string, optional): Machine-readable error code for programmatic handling
- **timestamp** (integer, required): Unix timestamp in milliseconds when the error occurred

## HTTP Status Codes

The API uses standard HTTP status codes to indicate success or failure of requests:

### Success Codes

- **200 OK**: Request completed successfully
- **201 Created**: Resource created successfully
- **204 No Content**: Request completed successfully with no response body

### Client Error Codes (4xx)

- **400 Bad Request**: Invalid request parameters or malformed data
- **401 Unauthorized**: Authentication required or invalid credentials
- **403 Forbidden**: Insufficient permissions to access the resource
- **404 Not Found**: Requested resource does not exist
- **405 Method Not Allowed**: HTTP method not supported for this endpoint
- **408 Request Timeout**: Request took too long to process
- **409 Conflict**: Request conflicts with current state
- **413 Payload Too Large**: Request entity exceeds size limits
- **422 Unprocessable Entity**: Request format is valid but semantic errors exist

### Server Error Codes (5xx)

- **500 Internal Server Error**: Unexpected server error
- **502 Bad Gateway**: Server received invalid response from upstream
- **503 Service Unavailable**: Server temporarily unavailable
- **504 Gateway Timeout**: Server timed out waiting for upstream

## Error Codes

### Authentication Errors

| Code | HTTP Status | Description | Example |
|------|-------------|-------------|---------|
| `UNAUTHORIZED` | 401 | Authentication required or token invalid | `"Authentication required"` |
| `INVALID_TOKEN` | 401 | Bearer token is malformed or expired | `"Invalid or expired token"` |
| `TOKEN_EXPIRED` | 401 | Authentication token has expired | `"Token has expired, please re-authenticate"` |
| `INSUFFICIENT_PERMISSIONS` | 403 | User lacks required permissions | `"Insufficient permissions to access this resource"` |

### Validation Errors

| Code | HTTP Status | Description | Example |
|------|-------------|-------------|---------|
| `INVALID_REQUEST` | 400 | General request validation error | `"Invalid request parameters"` |
| `MISSING_REQUIRED_FIELD` | 400 | Required field is missing | `"Command is required"` |
| `INVALID_FIELD_VALUE` | 400 | Field value is invalid | `"Invalid timeout value, must be positive integer"` |
| `INVALID_JSON_FORMAT` | 400 | JSON body is malformed | `"Invalid JSON format in request body"` |
| `INVALID_PATH` | 400 | File path is invalid or insecure | `"Invalid file path: contains prohibited characters"` |

### Resource Errors

| Code | HTTP Status | Description | Example |
|------|-------------|-------------|---------|
| `NOT_FOUND` | 404 | Resource does not exist | `"Process not found"` |
| `PROCESS_NOT_FOUND` | 404 | Specific process not found | `"Process with ID 'xxx' not found"` |
| `SESSION_NOT_FOUND` | 404 | Specific session not found | `"Session with ID 'xxx' not found"` |
| `FILE_NOT_FOUND` | 404 | File does not exist | `"File '/tmp/nonexistent.txt' not found"` |
| `DIRECTORY_NOT_FOUND` | 404 | Directory does not exist | `"Directory '/tmp/nonexistent' not found"` |

### State Errors

| Code | HTTP Status | Description | Example |
|------|-------------|-------------|---------|
| `CONFLICT` | 409 | Request conflicts with current state | `"Process is not running"` |
| `PROCESS_ALREADY_RUNNING` | 409 | Process is already running | `"Process is already running"` |
| `PROCESS_NOT_RUNNING` | 409 | Operation requires running process | `"Cannot kill process: not running"` |
| `SESSION_INACTIVE` | 409 | Session is not active | `"Cannot execute command in inactive session"` |
| `RESOURCE_LOCKED` | 409 | Resource is temporarily locked | `"File is locked by another operation"` |

### Operation Errors

| Code | HTTP Status | Description | Example |
|------|-------------|-------------|---------|
| `OPERATION_TIMEOUT` | 408 | Operation took too long | `"Process execution timeout after 30 seconds"` |
| `OPERATION_FAILED` | 422 | Operation failed but server is healthy | `"Failed to start process: permission denied"` |
| `EXECUTION_FAILED` | 422 | Command execution failed | `"Command exited with non-zero code: 127"` |
| `SIGNAL_FAILED` | 422 | Failed to send signal to process | `"Failed to send SIGTERM: process not found"` |

### File System Errors

| Code | HTTP Status | Description | Example |
|------|-------------|-------------|---------|
| `FILE_OPERATION_ERROR` | 422 | File operation failed | `"Failed to write file: permission denied"` |
| `DIRECTORY_NOT_EMPTY` | 409 | Cannot delete non-empty directory | `"Directory is not empty, use recursive=true"` |
| `FILE_TOO_LARGE` | 413 | File exceeds size limits | `"File size exceeds maximum allowed size of 10MB"` |
| `DISK_FULL` | 507 | Insufficient disk space | `"Insufficient disk space to write file"` |
| `FILE_LOCKED` | 423 | File is locked by another process | `"File is locked by another process"` |

### Process Errors

| Code | HTTP Status | Description | Example |
|------|-------------|-------------|---------|
| `PROCESS_START_FAILED` | 422 | Failed to start process | `"Failed to start process: command not found"` |
| `PROCESS_ALREADY_TERMINATED` | 409 | Process has already terminated | `"Process has already terminated"` |
| `INVALID_SIGNAL` | 400 | Invalid signal specified | `"Invalid signal: UNKNOWN_SIGNAL"` |
| `PROCESS_LIMIT_EXCEEDED` | 422 | Too many concurrent processes | `"Process limit exceeded, maximum 100 concurrent processes"` |

### Session Errors

| Code | HTTP Status | Description | Example |
|------|-------------|-------------|---------|
| `SESSION_CREATION_FAILED` | 422 | Failed to create session | `"Failed to create session: shell not found"` |
| `SESSION_LIMIT_EXCEEDED` | 422 | Too many concurrent sessions | `"Session limit exceeded, maximum 50 concurrent sessions"` |
| `SESSION_TIMEOUT` | 408 | Session has timed out | `"Session has timed out due to inactivity"` |
| `SHELL_NOT_FOUND` | 422 | Specified shell not found | `"Shell '/bin/custom' not found"` |

### WebSocket Errors

| Code | HTTP Status | Description | Example |
|------|-------------|-------------|---------|
| `WEBSOCKET_CONNECTION_FAILED` | 500 | WebSocket connection failed | `"Failed to establish WebSocket connection"` |
| `INVALID_SUBSCRIPTION` | 400 | Invalid subscription request | `"Invalid subscription: missing targetId"` |
| `TARGET_NOT_SUBSCRIBABLE` | 400 | Target cannot be subscribed to | `"Cannot subscribe to terminated process"` |

### System Errors

| Code | HTTP Status | Description | Example |
|------|-------------|-------------|---------|
| `INTERNAL_ERROR` | 500 | Internal server error | `"Internal server error"` |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable | `"Service temporarily unavailable for maintenance"` |
| `MAINTENANCE_MODE` | 503 | Server is in maintenance mode | `"Server is currently in maintenance mode"` |

## Error Handling Best Practices

### Client-Side Error Handling

#### 1. Always Check HTTP Status

```javascript
async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.error, errorData.code);
  }

  return response.json();
}

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
```

#### 2. Handle Specific Error Codes

```javascript
try {
  const result = await apiRequest('/api/v1/process/exec', {
    method: 'POST',
    body: JSON.stringify({ command: 'ls' })
  });
} catch (error) {
  switch (error.code) {
    case 'UNAUTHORIZED':
      // Handle authentication error
      redirectToLogin();
      break;

    case 'PROCESS_LIMIT_EXCEEDED':
      // Handle process limit
      showNotification('Too many processes running. Please wait.');
      break;

    case 'OPERATION_TIMEOUT':
      // Handle timeout
      showNotification('Operation timed out. Please try again.');
      break;

    default:
      // Generic error handling
      showNotification(`Error: ${error.message}`);
  }
}
```

#### 3. Implement Retry Logic

```javascript
async function retryableRequest(url, options, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiRequest(url, options);
    } catch (error) {
      lastError = error;

      // Don't retry on client errors (4xx)
      if (error.status >= 400 && error.status < 500) {
        throw error;
      }

      // Don't retry on specific server errors
      if (['MAINTENANCE_MODE', 'SERVICE_UNAVAILABLE'].includes(error.code)) {
        throw error;
      }

      // Wait before retrying with exponential backoff
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
```

#### 4. WebSocket Error Handling

```javascript
const ws = new WebSocket('ws://localhost:9757/ws', [], {
  headers: { 'Authorization': `Bearer ${token}` }
});

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'error') {
    handleWebSocketError(message);
  }
};

function handleWebSocketError(error) {
  switch (error.code) {
    case 'INVALID_SUBSCRIPTION':
      console.error('Invalid subscription:', error.error);
      break;

    case 'TARGET_NOT_SUBSCRIBABLE':
      console.error('Target not available:', error.error);
      break;

    default:
      console.error('WebSocket error:', error.error);
  }
}
```

### Error Recovery Strategies

#### 1. Authentication Recovery

```javascript
async function refreshToken() {
  try {
    const newToken = await getNewToken();
    localStorage.setItem('authToken', newToken);
    return newToken;
  } catch (error) {
    // Token refresh failed, redirect to login
    redirectToLogin();
    throw error;
  }
}

async function authenticatedRequest(url, options) {
  try {
    return await apiRequest(url, options);
  } catch (error) {
    if (error.code === 'TOKEN_EXPIRED' || error.code === 'INVALID_TOKEN') {
      // Try to refresh token and retry
      const newToken = await refreshToken();
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${newToken}`
      };
      return await apiRequest(url, options);
    }
    throw error;
  }
}
```

#### 2. Resource Not Found Recovery

```javascript
async function getProcessWithRetry(processId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiRequest(`/api/v1/process/${processId}/status?id=${processId}`);
    } catch (error) {
      if (error.code === 'NOT_FOUND' && attempt < maxRetries) {
        // Wait a moment and retry (process might still be starting)
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
  }
}
```


## Error Logging and Monitoring

### Client-Side Logging

```javascript
class ApiLogger {
  static logError(error, context = {}) {
    const errorData = {
      timestamp: new Date().toISOString(),
      error: error.message,
      code: error.code,
      status: error.status,
      url: context.url,
      method: context.method,
      userId: getCurrentUserId(),
      sessionId: getSessionId()
    };

    console.error('API Error:', errorData);

    // Send to monitoring service
    if (typeof window.analytics !== 'undefined') {
      window.analytics.track('API Error', errorData);
    }
  }
}

// Usage
try {
  await apiRequest('/api/v1/process/exec', { method: 'POST' });
} catch (error) {
  ApiLogger.logError(error, {
    url: '/api/v1/process/exec',
    method: 'POST'
  });
}
```

### Error Metrics

Track key error metrics to monitor API health:

- Error rate by endpoint
- Error rate by error code
- Authentication failure rate
- Timeout frequency
- Retry success rate

## Debugging Tips

1. **Enable verbose logging**: Set debug flags to see detailed error information
2. **Check timestamps**: Compare error timestamps with request timing
3. **Validate input**: Ensure request data matches API specifications
4. **Monitor network**: Check for connectivity issues or proxy problems
5. **Review logs**: Check both client and server logs for additional context

This comprehensive error handling system ensures that clients can gracefully handle all types of errors and provide appropriate feedback to users.