# WebSocket API Documentation

The DevBox SDK Server provides WebSocket connections for real-time log streaming and event subscriptions. This document describes the WebSocket protocol and message formats.

## Overview

The WebSocket endpoint (`/ws`) enables real-time communication between clients and the server for:

- Live log streaming from processes and sessions
- Event notifications
- Real-time status updates
- Subscription management

## Connection

### Endpoint URL

```
ws://localhost:8080/ws
```

### Authentication

WebSocket connections require Bearer token authentication:

```http
Authorization: Bearer <your-token>
```

### Connection Example

**Using JavaScript:**
```javascript
const ws = new WebSocket('ws://localhost:8080/ws', [], {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});

ws.onopen = function(event) {
  console.log('WebSocket connected');
};

ws.onmessage = function(event) {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

**Using wscat (CLI):**
```bash
wscat -c "ws://localhost:8080/ws" -H "Authorization: Bearer YOUR_TOKEN"
```

## Message Protocol

All WebSocket messages are JSON objects with specific types and structures.

### Client Messages

#### 1. Subscribe to Logs

Subscribe to real-time log streaming from a process or session.

```json
{
  "action": "subscribe",
  "type": "process|session",
  "target_id": "target-process-or-session-id",
  "options": {
    "levels": ["stdout", "stderr", "system"],
    "tail": 100,
    "follow": true,
    "startTime": 1640995200000
  }
}
```

**Fields:**
- `action` (string, required): `"subscribe"`
- `type` (string, required): `"process"` or `"session"`
- `target_id` (string, required): Process or session ID to subscribe to
- `options` (object, optional): Subscription options

**Subscription Options:**
- `levels` (array): Log levels to receive (`"stdout"`, `"stderr"`, `"system"`)
- `tail` (number): Number of historical log entries to send initially
- `follow` (boolean): Whether to continue sending new log entries
- `startTime` (number): Unix timestamp filter for historical logs

**Example:**
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

#### 2. Unsubscribe from Logs

Unsubscribe from log streaming for a specific target.

```json
{
  "action": "unsubscribe",
  "type": "process|session",
  "target_id": "target-process-or-session-id"
}
```

**Example:**
```json
{
  "action": "unsubscribe",
  "type": "process",
  "target_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 3. List Active Subscriptions

Get a list of all active subscriptions for the current connection.

```json
{
  "action": "list"
}
```

**Response:**
```json
{
  "type": "subscription_list",
  "subscriptions": [
    {
      "type": "process",
      "target_id": "550e8400-e29b-41d4-a716-446655440000",
      "options": {
        "levels": ["stdout", "stderr"],
        "follow": true
      }
    }
  ]
}
```

### Server Messages

#### 1. Log Entry Message

Real-time log entry from a subscribed process or session.

```json
{
  "type": "log",
  "dataType": "process|session",
  "target_id": "target-id",
  "log": {
    "level": "stdout|stderr|system",
    "content": "log content",
    "timestamp": 1640995200000,
    "sequence": 1,
    "source": "process|session",
    "target_id": "target-id",
    "targetType": "process|session",
    "message": "optional message"
  },
  "sequence": 1,
  "isHistory": false
}
```

**Fields:**
- `type` (string): `"log"`
- `dataType` (string): `"process"` or `"session"`
- `target_id` (string): Process or session ID
- `log` (object): Log entry details
- `sequence` (number): Message sequence number
- `isHistory` (boolean): Whether this is a historical log entry

**Log Entry Fields:**
- `level` (string): Log level (`"stdout"`, `"stderr"`, `"system"`)
- `content` (string): Log content
- `timestamp` (number): Unix timestamp in milliseconds
- `sequence` (number): Log entry sequence number
- `source` (string): Log source
- `target_id` (string): Target ID
- `targetType` (string): Target type
- `message` (string, optional): Additional message

#### 2. Subscription Confirmation

Confirmation of successful subscription or unsubscription.

```json
{
  "type": "subscription_result",
  "action": "subscribed|unsubscribed",
  "dataType": "process|session",
  "target_id": "target-id",
  "levels": {
    "stdout": true,
    "stderr": true,
    "system": false
  },
  "timestamp": 1640995200000,
  "extra": {}
}
```

#### 3. Error Message

Error notification for failed operations.

```json
{
  "type": "error",
  "error": "Error description",
  "code": "ERROR_CODE",
  "timestamp": 1640995200000,
  "context": {
    "action": "subscribe",
    "target_id": "target-id"
  }
}
```

#### 4. Connection Status

Connection status notifications.

```json
{
  "type": "status",
  "status": "connected|disconnected|error",
  "message": "Status message",
  "timestamp": 1640995200000
}
```

## Usage Examples

### Basic Log Streaming

```javascript
const ws = new WebSocket('ws://localhost:8080/ws', [], {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});

ws.onopen = function(event) {
  // Subscribe to process logs
  ws.send(JSON.stringify({
    action: 'subscribe',
    type: 'process',
    target_id: '550e8400-e29b-41d4-a716-446655440000',
    options: {
      levels: ['stdout', 'stderr'],
      tail: 10,
      follow: true
    }
  }));
};

ws.onmessage = function(event) {
  const message = JSON.parse(event.data);

  switch(message.type) {
    case 'log':
      console.log(`[${message.log.level.toUpperCase()}] ${message.log.content}`);
      break;

    case 'subscription_result':
      console.log(`Subscription ${message.action} for ${message.dataType}:${message.target_id}`);
      break;

    case 'error':
      console.error(`Error: ${message.error} (${message.code})`);
      break;
  }
};
```

### Multiple Subscriptions

```javascript
// Subscribe to multiple targets
const subscriptions = [
  {
    type: 'process',
    target_id: 'process-id-1',
    options: { levels: ['stdout'], tail: 20, follow: true }
  },
  {
    type: 'session',
    target_id: 'session-id-1',
    options: { levels: ['stdout', 'stderr'], tail: 50, follow: true }
  }
];

subscriptions.forEach(sub => {
  ws.send(JSON.stringify({
    action: 'subscribe',
    ...sub
  }));
});
```

### Filtering and Buffer Management

```javascript
let logBuffer = [];
const MAX_BUFFER_SIZE = 1000;

ws.onmessage = function(event) {
  const message = JSON.parse(event.data);

  if (message.type === 'log') {
    // Add to buffer
    logBuffer.push({
      timestamp: message.log.timestamp,
      level: message.log.level,
      content: message.log.content,
      target_id: message.target_id
    });

    // Maintain buffer size
    if (logBuffer.length > MAX_BUFFER_SIZE) {
      logBuffer = logBuffer.slice(-MAX_BUFFER_SIZE);
    }

    // Process log entry
    processLogEntry(message);
  }
};

function processLogEntry(message) {
  // Custom log processing logic
  if (message.log.level === 'stderr') {
    // Handle error logs
    alertError(message.log.content);
  } else {
    // Handle normal logs
    displayLog(message);
  }
}
```

### Reconnection Logic

```javascript
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000; // 5 seconds

function connectWebSocket() {
  const ws = new WebSocket('ws://localhost:8080/ws', [], {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  });

  ws.onopen = function(event) {
    console.log('WebSocket connected');
    reconnectAttempts = 0;

    // Resubscribe after reconnection
    resubscribeAll();
  };

  ws.onclose = function(event) {
    console.log('WebSocket disconnected');

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      setTimeout(() => {
        reconnectAttempts++;
        console.log(`Attempting to reconnect... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        connectWebSocket();
      }, RECONNECT_DELAY);
    }
  };

  ws.onerror = function(error) {
    console.error('WebSocket error:', error);
  };

  return ws;
}

// Start connection
let ws = connectWebSocket();

// Store subscriptions for reconnection
let activeSubscriptions = [];

function resubscribeAll() {
  activeSubscriptions.forEach(sub => {
    ws.send(JSON.stringify({
      action: 'subscribe',
      ...sub
    }));
  });
}
```

## Error Handling

### Common Error Codes

- `INVALID_SUBSCRIPTION`: Invalid subscription request
- `TARGET_NOT_FOUND`: Process or session not found
- `UNAUTHORIZED`: Authentication required or invalid
- `INVALID_MESSAGE_FORMAT`: Malformed message

### Error Response Example

```json
{
  "type": "error",
  "error": "Process not found",
  "code": "TARGET_NOT_FOUND",
  "timestamp": 1640995200000,
  "context": {
    "action": "subscribe",
    "target_id": "non-existent-id"
  }
}
```

## Performance Considerations

### Subscription Features

- Maximum historical log entries per subscription: 1000

### Memory Management

- Log entries are buffered on the server side for up to 1000 entries
- Use appropriate `tail` values to limit initial data transfer
- Consider unsubscribing from inactive targets

### Network Optimization

- Filter log levels to reduce bandwidth
- Implement client-side buffering for display smoothing

## Integration Examples

### React Component

```jsx
import React, { useState, useEffect, useRef } from 'react';

function LogViewer({ processId, token }) {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080/ws', [], {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({
        action: 'subscribe',
        type: 'process',
        target_id: processId,
        options: {
          levels: ['stdout', 'stderr'],
          tail: 50,
          follow: true
        }
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'log') {
        setLogs(prev => [...prev, message.log]);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    wsRef.current = ws;

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [processId, token]);

  return (
    <div>
      <div>Status: {connected ? 'Connected' : 'Disconnected'}</div>
      <div>
        {logs.map((log, index) => (
          <div key={index} className={`log-${log.level}`}>
            [{new Date(log.timestamp).toLocaleTimeString()}] {log.content}
          </div>
        ))}
      </div>
    </div>
  );
}
```

This WebSocket API provides a robust foundation for real-time monitoring and event-driven applications built on the DevBox SDK Server.