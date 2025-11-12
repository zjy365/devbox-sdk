// Package common provides common types and utilities for handlers
package common

// LogEntry structured log entry
type LogEntry struct {
	Level      string `json:"level"`                // "stdout", "stderr", "system"
	Content    string `json:"content"`              // Log content
	Timestamp  int64  `json:"timestamp"`            // Unix second timestamp
	Sequence   int64  `json:"sequence"`             // Sequence number (optional)
	Source     string `json:"source,omitempty"`     // Log source
	TargetID   string `json:"targetId,omitempty"`   // Target ID
	TargetType string `json:"targetType,omitempty"` // Target type (process/session)
	Message    string `json:"message,omitempty"`    // Message content
}

// LogMessage log message structure
type LogMessage struct {
	Type      string   `json:"type"`
	DataType  string   `json:"dataType"` // "process" or "session"
	TargetID  string   `json:"targetId"`
	Log       LogEntry `json:"log"`
	Sequence  int      `json:"sequence"`
	IsHistory bool     `json:"isHistory,omitempty"` // Mark whether it is historical log
}

// SubscriptionRequest subscription request structure
type SubscriptionRequest struct {
	Action   string              `json:"action"` // "subscribe", "unsubscribe", "list"
	Type     string              `json:"type"`   // "process", "session"
	TargetID string              `json:"targetId"`
	Options  SubscriptionOptions `json:"options"`
}

// SubscriptionOptions subscription options
type SubscriptionOptions struct {
	Levels []string `json:"levels"` // ["stdout", "stderr", "system"]
	Tail   int      `json:"tail"`   // Historical log lines count
}

// SubscriptionResult subscription result response
type SubscriptionResult struct {
	Action    string          `json:"action"` // "subscribed", "unsubscribed"
	Type      string          `json:"type"`   // "process" or "session"
	TargetID  string          `json:"targetId"`
	Levels    map[string]bool `json:"levels,omitempty"`
	Timestamp int64           `json:"timestamp"`
	Extra     map[string]any  `json:"extra,omitempty"`
}
