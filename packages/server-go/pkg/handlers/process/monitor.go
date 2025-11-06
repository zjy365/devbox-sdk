package process

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
)

// collectLogs collects logs from stdout and stderr
func (h *ProcessHandler) collectLogs(processID string, stdout, stderr io.Reader) {
	processInfo, err := h.getProcess(processID)
	if err != nil {
		return
	}

	// Create scanners for stdout and stderr
	stdoutScanner := bufio.NewScanner(stdout)
	stderrScanner := bufio.NewScanner(stderr)

	// Create channels for log lines
	stdoutLines := make(chan string)
	stderrLines := make(chan string)
	done := make(chan bool, 2)

	// Start stdout reader
	go func() {
		for stdoutScanner.Scan() {
			stdoutLines <- h.formatLog("stdout", stdoutScanner.Text())
		}
		close(stdoutLines)
		done <- true
	}()

	// Start stderr reader
	go func() {
		for stderrScanner.Scan() {
			stderrLines <- h.formatLog("stderr", stderrScanner.Text())
		}
		close(stderrLines)
		done <- true
	}()

	// Collect logs
	go func() {
		defer func() {
			<-done
			<-done
		}()

		for {
			select {
			case line, ok := <-stdoutLines:
				if ok {
					processInfo.LogMux.Lock()
					processInfo.Logs = append(processInfo.Logs, line)
					// Add structured log entry
					logEntry := &common.LogEntry{
						Timestamp:  time.Now().Unix(),
						Level:      "info",
						Source:     "stdout",
						TargetID:   processID,
						TargetType: "process",
						Message:    stdoutScanner.Text(),
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
			case line, ok := <-stderrLines:
				if ok {
					processInfo.LogMux.Lock()
					processInfo.Logs = append(processInfo.Logs, line)
					// Add structured log entry
					logEntry := &common.LogEntry{
						Timestamp:  time.Now().Unix(),
						Level:      "error",
						Source:     "stderr",
						TargetID:   processID,
						TargetType: "process",
						Message:    stderrScanner.Text(),
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
			case <-done:
				return
			}
		}
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
		common.WriteJSONResponse(w, common.ErrorResponse{
			Error:     "Streaming not supported",
			Timestamp: time.Now().Unix(),
		})
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
