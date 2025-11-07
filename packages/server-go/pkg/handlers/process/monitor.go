package process

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/errors"
	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
)

// collectLogs collects logs from stdout and stderr
func (h *ProcessHandler) collectLogs(processID string, stdout, stderr io.Reader) {
	processInfo, err := h.getProcess(processID)
	if err != nil {
		return
	}

	// Create a single goroutine to handle both stdout and stderr
	go func() {
		// Create scanners with larger buffer
		stdoutScanner := bufio.NewScanner(stdout)
		stderrScanner := bufio.NewScanner(stderr)

		buf := make([]byte, 0, 64*1024)      // 64KB initial buffer
		stdoutScanner.Buffer(buf, 1024*1024) // 1MB max line length
		stderrScanner.Buffer(buf, 1024*1024) // 1MB max line length

		// Read all available data from both streams using goroutines
		done := make(chan bool, 2)

		// Handle stdout in separate goroutine
		go func() {
			defer func() { done <- true }()
			for stdoutScanner.Scan() {
				text := stdoutScanner.Text()
				formattedLog := h.formatLog("stdout", text)

				processInfo.LogMux.Lock()
				processInfo.Logs = append(processInfo.Logs, formattedLog)

				// Add structured log entry
				logEntry := &common.LogEntry{
					Timestamp:  time.Now().Unix(),
					Level:      "info",
					Source:     "stdout",
					TargetID:   processID,
					TargetType: "process",
					Message:    text,
				}
				processInfo.LogEntries = append(processInfo.LogEntries, *logEntry)

				// Broadcast log entry
				if h.webSocketHandler != nil {
					h.webSocketHandler.BroadcastLogEntry(logEntry)
				}

				// Keep only last 1000 log lines to prevent memory issues
				if len(processInfo.Logs) > 1000 {
					processInfo.Logs = processInfo.Logs[len(processInfo.Logs)-1000:]
				}
				if len(processInfo.LogEntries) > 1000 {
					processInfo.LogEntries = processInfo.LogEntries[len(processInfo.LogEntries)-1000:]
				}
				processInfo.LogMux.Unlock()
			}
		}()

		// Handle stderr in separate goroutine
		go func() {
			defer func() { done <- true }()
			for stderrScanner.Scan() {
				text := stderrScanner.Text()
				formattedLog := h.formatLog("stderr", text)

				processInfo.LogMux.Lock()
				processInfo.Logs = append(processInfo.Logs, formattedLog)

				// Add structured log entry
				logEntry := &common.LogEntry{
					Timestamp:  time.Now().Unix(),
					Level:      "error",
					Source:     "stderr",
					TargetID:   processID,
					TargetType: "process",
					Message:    text,
				}
				processInfo.LogEntries = append(processInfo.LogEntries, *logEntry)

				// Broadcast log entry
				if h.webSocketHandler != nil {
					h.webSocketHandler.BroadcastLogEntry(logEntry)
				}

				// Keep only last 1000 log lines to prevent memory issues
				if len(processInfo.Logs) > 1000 {
					processInfo.Logs = processInfo.Logs[len(processInfo.Logs)-1000:]
				}
				if len(processInfo.LogEntries) > 1000 {
					processInfo.LogEntries = processInfo.LogEntries[len(processInfo.LogEntries)-1000:]
				}
				processInfo.LogMux.Unlock()
			}
		}()

		// Wait for both streams to complete
		<-done
		<-done
	}()
}

// monitorProcess monitors process status and updates logs
func (h *ProcessHandler) monitorProcess(processID string) {
	processInfo, err := h.getProcess(processID)
	if err != nil {
		return
	}

	// Wait for process to finish
	waitErr := processInfo.Cmd.Wait()

	// Update process status
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if waitErr != nil {
		processInfo.Status = "failed"
		processInfo.LogMux.Lock()
		processInfo.Logs = append(processInfo.Logs, h.formatLog("system", fmt.Sprintf("Process failed: %v", waitErr)))
		// Add structured log entry for failure
		logEntry := &common.LogEntry{
			Timestamp:  time.Now().Unix(),
			Level:      "error",
			Source:     "system",
			TargetID:   processID,
			TargetType: "process",
			Message:    fmt.Sprintf("Process failed: %v", waitErr),
		}
		processInfo.LogEntries = append(processInfo.LogEntries, *logEntry)
		if h.webSocketHandler != nil {
			h.webSocketHandler.BroadcastLogEntry(logEntry)
		}
		processInfo.LogMux.Unlock()
	} else {
		processInfo.Status = "completed"
		processInfo.LogMux.Lock()
		processInfo.Logs = append(processInfo.Logs, h.formatLog("system", "Process completed successfully"))
		// Add structured log entry for completion
		logEntry := &common.LogEntry{
			Timestamp:  time.Now().Unix(),
			Level:      "info",
			Source:     "system",
			TargetID:   processID,
			TargetType: "process",
			Message:    "Process completed successfully",
		}
		processInfo.LogEntries = append(processInfo.LogEntries, *logEntry)
		if h.webSocketHandler != nil {
			h.webSocketHandler.BroadcastLogEntry(logEntry)
		}
		processInfo.LogMux.Unlock()
	}
}

// streamLogs streams logs to the client
func (h *ProcessHandler) streamLogs(w http.ResponseWriter, processID string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		errors.WriteErrorResponse(w, errors.NewInternalError("Streaming not supported"))
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	processInfo, err := h.getProcess(processID)
	if err != nil {
		fmt.Fprintf(w, "data: %s\n\n", err.Error())
		flusher.Flush()
		return
	}

	// Send initial logs
	processInfo.LogMux.RLock()
	for _, log := range processInfo.Logs {
		fmt.Fprintf(w, "data: %s\n\n", log)
	}
	processInfo.LogMux.RUnlock()
	flusher.Flush()

	// Stream new logs
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			processInfo.LogMux.RLock()
			logLen := len(processInfo.Logs)
			var newLogs []string
			if logLen > 10 {
				newLogs = processInfo.Logs[logLen-10:] // Send last 10 logs
			} else if logLen > 0 {
				newLogs = processInfo.Logs // Send all logs if less than 10
			}
			processInfo.LogMux.RUnlock()

			for _, log := range newLogs {
				fmt.Fprintf(w, "data: %s\n\n", log)
			}
			flusher.Flush()

			// Check if process has finished
			h.mutex.RLock()
			if processInfo, exists := h.processes[processID]; exists && processInfo.Status != "running" {
				h.mutex.RUnlock()
				return
			}
			h.mutex.RUnlock()
		case <-time.After(1 * time.Second):
			return
		}
	}
}
