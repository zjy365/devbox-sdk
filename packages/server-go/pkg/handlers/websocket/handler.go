package websocket

import "time"

// WebSocketConfig WebSocket Config
type WebSocketConfig struct {
	PingPeriod            time.Duration `json:"pingPeriod"`
	WriteWait             time.Duration `json:"writeWait"`
	MaxMessageSize        int64         `json:"maxMessageSize"`
	ReadTimeout           time.Duration `json:"readTimeout"`
	HealthCheckInterval   time.Duration `json:"healthCheckInterval"`
	BufferCleanupInterval time.Duration `json:"bufferCleanupInterval"`
}

// NewDefaultWebSocketConfig Create a default WebSocket configuration
func NewDefaultWebSocketConfig() *WebSocketConfig {
	return &WebSocketConfig{
		PingPeriod:            30 * time.Second,
		WriteWait:             10 * time.Second,
		MaxMessageSize:        512 * 1024, // 512KB
		ReadTimeout:           60 * time.Second,
		HealthCheckInterval:   60 * time.Second,
		BufferCleanupInterval: 5 * time.Minute,
	}
}
