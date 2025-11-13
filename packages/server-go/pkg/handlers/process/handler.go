package process

import (
	"os/exec"
	"sync"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
)

// WebSocketBroadcaster interface for broadcasting log entries
type WebSocketBroadcaster interface {
	BroadcastLogEntry(logEntry *common.LogEntry)
}

// ProcessHandler handles process operations
type ProcessHandler struct {
	processes        map[string]*processInfo
	mutex            sync.RWMutex
	webSocketHandler WebSocketBroadcaster
}

// processInfo holds information about a running process
type processInfo struct {
	ID         string
	Cmd        *exec.Cmd
	StartAt    time.Time
	Status     string
	Logs       []string
	LogMux     sync.RWMutex
	LogEntries []common.LogEntry // Structured log entries
}

// NewProcessHandler creates a new process handler
func NewProcessHandler() *ProcessHandler {
	return &ProcessHandler{
		processes:        make(map[string]*processInfo),
		webSocketHandler: nil,
	}
}

// SetWebSocketHandler sets the WebSocket handler for broadcasting logs
func (h *ProcessHandler) SetWebSocketHandler(handler WebSocketBroadcaster) {
	h.webSocketHandler = handler
}

// GetHistoricalLogs returns historical logs for a process
func (h *ProcessHandler) GetHistoricalLogs(processID string, logLevels []string) []common.LogEntry {
	h.mutex.RLock()
	processInfo, exists := h.processes[processID]
	h.mutex.RUnlock()

	if !exists {
		return []common.LogEntry{}
	}

	processInfo.LogMux.RLock()
	defer processInfo.LogMux.RUnlock()

	// If no specific log levels requested, return all logs
	if len(logLevels) == 0 {
		result := make([]common.LogEntry, len(processInfo.LogEntries))
		copy(result, processInfo.LogEntries)
		return result
	}

	// Filter by log levels
	var result []common.LogEntry
	for _, entry := range processInfo.LogEntries {
		for _, level := range logLevels {
			if entry.Level == level {
				result = append(result, entry)
				break
			}
		}
	}

	return result
}
