package session

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
)

// startShellProcess starts a shell process for the session
func (h *SessionHandler) startShellProcess(sessionInfo *SessionInfo) error {
	// Create command
	cmd := exec.Command(sessionInfo.Shell)
	cmd.Dir = sessionInfo.Cwd

	// Set environment
	env := os.Environ()
	for k, v := range sessionInfo.Env {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}
	cmd.Env = env

	// Create pipes
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdin pipe: %v", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %v", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create stderr pipe: %v", err)
	}

	// Start process
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start shell: %v", err)
	}

	// Set up session info
	sessionInfo.Cmd = cmd
	sessionInfo.Stdin = stdin
	sessionInfo.Stdout = bufio.NewScanner(stdout)
	sessionInfo.Stderr = bufio.NewScanner(stderr)

	// Start log collection
	ctx, cancel := context.WithCancel(context.Background())
	sessionInfo.CleanupFunc = cancel

	go h.collectSessionLogs(ctx, sessionInfo, stdout, "stdout")
	go h.collectSessionLogs(ctx, sessionInfo, stderr, "stderr")
	go h.monitorSession(sessionInfo)

	return nil
}

// collectSessionLogs collects logs from session stdout/stderr
func (h *SessionHandler) collectSessionLogs(ctx context.Context, sessionInfo *SessionInfo, reader io.Reader, source string) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return
		default:
			line := scanner.Text()
			logEntry := fmt.Sprintf("[%s] %s: %s", time.Now().Format("2006-01-02 15:04:05"), source, line)

			sessionInfo.LogMux.Lock()
			sessionInfo.Logs = append(sessionInfo.Logs, logEntry)
			// Add structured log entry
			structuredLogEntry := &common.LogEntry{
				Timestamp:  time.Now().Unix(),
				Level:      "info",
				Source:     source,
				TargetID:   sessionInfo.ID,
				TargetType: "session",
				Message:    line,
			}
			sessionInfo.LogEntries = append(sessionInfo.LogEntries, *structuredLogEntry)
			// Broadcast log entry
			if h.webSocketHandler != nil {
				h.webSocketHandler.BroadcastLogEntry(structuredLogEntry)
			}
			// Keep only last 1000 log lines
			if len(sessionInfo.Logs) > 1000 {
				sessionInfo.Logs = sessionInfo.Logs[len(sessionInfo.Logs)-1000:]
			}
			if len(sessionInfo.LogEntries) > 1000 {
				sessionInfo.LogEntries = sessionInfo.LogEntries[len(sessionInfo.LogEntries)-1000:]
			}
			sessionInfo.LogMux.Unlock()
		}
	}
}

// monitorSession monitors session status
func (h *SessionHandler) monitorSession(sessionInfo *SessionInfo) {
	err := sessionInfo.Cmd.Wait()

	sessionInfo.LogMux.Lock()
	if err != nil {
		sessionInfo.Status = "failed"
		logEntry := fmt.Sprintf("[%s] session: Shell exited with error: %v", time.Now().Format("2006-01-02 15:04:05"), err)
		sessionInfo.Logs = append(sessionInfo.Logs, logEntry)
		// Add structured log entry for failure
		structuredLogEntry := &common.LogEntry{
			Timestamp:  time.Now().Unix(),
			Level:      "error",
			Source:     "system",
			TargetID:   sessionInfo.ID,
			TargetType: "session",
			Message:    fmt.Sprintf("Shell exited with error: %v", err),
		}
		sessionInfo.LogEntries = append(sessionInfo.LogEntries, *structuredLogEntry)
		// Broadcast log entry
		if h.webSocketHandler != nil {
			h.webSocketHandler.BroadcastLogEntry(structuredLogEntry)
		}
	} else {
		sessionInfo.Status = "completed"
		logEntry := fmt.Sprintf("[%s] session: Shell exited normally", time.Now().Format("2006-01-02 15:04:05"))
		sessionInfo.Logs = append(sessionInfo.Logs, logEntry)
		// Add structured log entry for completion
		structuredLogEntry := &common.LogEntry{
			Timestamp:  time.Now().Unix(),
			Level:      "info",
			Source:     "system",
			TargetID:   sessionInfo.ID,
			TargetType: "session",
			Message:    "Shell exited normally",
		}
		sessionInfo.LogEntries = append(sessionInfo.LogEntries, *structuredLogEntry)
		// Broadcast log entry
		if h.webSocketHandler != nil {
			h.webSocketHandler.BroadcastLogEntry(structuredLogEntry)
		}
	}
	sessionInfo.Active = false
	sessionInfo.LogMux.Unlock()
}

// cleanupInactiveSessions periodically cleans up inactive sessions
func (h *SessionHandler) cleanupInactiveSessions() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		h.mutex.Lock()
		now := time.Now()
		for sessionID, sessionInfo := range h.sessions {
			// Clean up sessions inactive for more than 30 minutes
			if now.Sub(sessionInfo.LastUsedAt) > 30*time.Minute && !sessionInfo.Active {
				if sessionInfo.CleanupFunc != nil {
					sessionInfo.CleanupFunc()
				}
				delete(h.sessions, sessionID)
			}
		}
		h.mutex.Unlock()
	}
}
