package process

import (
	"bufio"
	"os/exec"
	"sync"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
)

// WebSocketBroadcaster interface for broadcasting log entries
type WebSocketBroadcaster interface {
	BroadcastLogEntry(logEntry *common.LogEntry)
}

// ProcessHandler handles process operations
type ProcessHandler struct {
	processes        map[string]*ProcessInfo
	mutex            sync.RWMutex
	webSocketHandler WebSocketBroadcaster
}

// ProcessInfo holds information about a running process
type ProcessInfo struct {
	ID         string
	Cmd        *exec.Cmd
	StartAt    time.Time
	Status     string
	Stdout     *bufio.Scanner
	Stderr     *bufio.Scanner
	Logs       []string
	LogMux     sync.RWMutex
	LogEntries []common.LogEntry // Structured log entries
}

// NewProcessHandler creates a new process handler
func NewProcessHandler() *ProcessHandler {
	return &ProcessHandler{
		processes:        make(map[string]*ProcessInfo),
		webSocketHandler: nil,
	}
}

// SetWebSocketHandler sets the WebSocket handler for broadcasting logs
func (h *ProcessHandler) SetWebSocketHandler(handler WebSocketBroadcaster) {
	h.webSocketHandler = handler
}

// AddLogEntry adds a structured log entry and broadcasts it
func (h *ProcessHandler) AddLogEntry(processID string, logEntry *common.LogEntry) {
	h.mutex.RLock()
	processInfo, exists := h.processes[processID]
	h.mutex.RUnlock()

	if !exists {
		return
	}

	// Add to log entries
	processInfo.LogMux.Lock()
	processInfo.LogEntries = append(processInfo.LogEntries, *logEntry)
	// Keep only last 1000 log entries to prevent memory issues
	if len(processInfo.LogEntries) > 1000 {
		processInfo.LogEntries = processInfo.LogEntries[len(processInfo.LogEntries)-1000:]
	}
	processInfo.LogMux.Unlock()

	// Broadcast log entry
	if h.webSocketHandler != nil {
		h.webSocketHandler.BroadcastLogEntry(logEntry)
	}
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
