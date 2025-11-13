package session

import (
	"bufio"
	"context"
	"io"
	"os/exec"
	"sync"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
)

// WebSocketBroadcaster interface for broadcasting log entries
type WebSocketBroadcaster interface {
	BroadcastLogEntry(logEntry *common.LogEntry)
}

// SessionHandler handles session operations
type SessionHandler struct {
	sessions         map[string]*sessionInfo
	mutex            sync.RWMutex
	webSocketHandler WebSocketBroadcaster
}

// sessionInfo holds information about a session
type sessionInfo struct {
	ID          string
	Shell       string
	Cwd         string
	Env         map[string]string
	CreatedAt   time.Time
	LastUsedAt  time.Time
	Status      string
	Cmd         *exec.Cmd
	Stdin       io.WriteCloser
	Stdout      *bufio.Scanner
	Stderr      *bufio.Scanner
	Logs        []string
	LogMux      sync.RWMutex
	Active      bool
	CleanupFunc context.CancelFunc
	LogEntries  []common.LogEntry // Structured log entries
}

// NewSessionHandler creates a new session handler
func NewSessionHandler() *SessionHandler {
	handler := &SessionHandler{
		sessions:         make(map[string]*sessionInfo),
		webSocketHandler: nil,
	}

	// Start cleanup routine
	go handler.cleanupInactiveSessions()

	return handler
}

// SetWebSocketHandler sets the WebSocket handler for broadcasting logs
func (h *SessionHandler) SetWebSocketHandler(handler WebSocketBroadcaster) {
	h.webSocketHandler = handler
}

// GetHistoricalLogs returns historical logs for a session
func (h *SessionHandler) GetHistoricalLogs(sessionID string, logLevels []string) []common.LogEntry {
	h.mutex.RLock()
	sessionInfo, exists := h.sessions[sessionID]
	h.mutex.RUnlock()

	if !exists {
		return []common.LogEntry{}
	}

	sessionInfo.LogMux.RLock()
	defer sessionInfo.LogMux.RUnlock()

	// If no specific log levels requested, return all logs
	if len(logLevels) == 0 {
		result := make([]common.LogEntry, len(sessionInfo.LogEntries))
		copy(result, sessionInfo.LogEntries)
		return result
	}

	// Filter by log levels
	var result []common.LogEntry
	for _, entry := range sessionInfo.LogEntries {
		for _, level := range logLevels {
			if entry.Level == level {
				result = append(result, entry)
				break
			}
		}
	}

	return result
}
