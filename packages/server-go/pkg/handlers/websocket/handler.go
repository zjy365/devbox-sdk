package websocket

import "time"

// WebSocketConfig WebSocket Config
type WebSocketConfig struct {
	PingPeriod            time.Duration `json:"ping_period"`
	WriteWait             time.Duration `json:"write_wait"`
	MaxMessageSize        int64         `json:"max_message_size"`
	ReadTimeout           time.Duration `json:"read_timeout"`
	HealthCheckInterval   time.Duration `json:"health_check_interval"`
	BufferCleanupInterval time.Duration `json:"buffer_cleanup_interval"`
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
