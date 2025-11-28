# Error Handling Documentation

This document describes the error handling system used by the DevBox SDK Server API.

## Error Response Format

The API uses a consistent JSON format for all responses, including errors. Most API endpoints return HTTP 200 OK even for logical errors, with the error details contained in the response body.

```json
{
  "status": 1404,
  "message": "Resource not found",
  "data": {}
}
```

### Fields

- **status** (integer, required): Status code indicating success (0) or specific error type.
- **message** (string, required): Human-readable description of the status.
- **data** (object, optional): Additional data associated with the response or error.

## Status Codes

The `status` field in the JSON body indicates the result of the operation:

| Status Code | Name | Description |
|-------------|------|-------------|
| 0 | Success | Operation completed successfully |
| 500 | Panic | Unexpected server panic |
| 1400 | ValidationError | Input validation failed |
| 1404 | NotFound | Resource not found |
| 1401 | Unauthorized | Authentication required or invalid |
| 1403 | Forbidden | Insufficient permissions |
| 1422 | InvalidRequest | Request is invalid |
| 1500 | InternalError | Internal server error |
| 1409 | Conflict | Resource conflict |
| 1600 | OperationError | Operation specific error |

## HTTP Status Codes

Unlike standard REST APIs, this server returns **HTTP 200 OK** for most logical errors (Client Errors 4xx).
**HTTP 500 Internal Server Error** is reserved for unrecoverable server panics.

### Success (HTTP 200)

All successful operations and handled errors return HTTP 200. Check the `status` field in the body to determine success.

- `status: 0` -> Success
- `status: > 0` -> Error

### Server Error (HTTP 500)

- **500 Internal Server Error**: Unexpected server panic or crash.

## Error Handling Best Practices

### Client-Side Error Handling

#### 1. Check Response Body Status

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

  // Check for HTTP 500
  if (response.status === 500) {
    throw new Error('Internal Server Error');
  }

  const data = await response.json();

  // Check logical status
  if (data.status !== 0) {
    throw new ApiError(data.status, data.message, data.data);
  }

  return data; // or data.data depending on endpoint
}

class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}
```

#### 2. Handle Specific Status Codes

```javascript
try {
  await apiRequest('/api/v1/process/exec', { ... });
} catch (error) {
  switch (error.status) {
    case 1401: // Unauthorized
      redirectToLogin();
      break;
    case 1404: // NotFound
      showNotification('Resource not found');
      break;
    default:
      showNotification(`Error: ${error.message}`);
  }
}
```
