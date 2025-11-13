package process

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
)

type SyncStreamExecutionRequest struct {
	Command string            `json:"command"`
	Args    []string          `json:"args,omitempty"`
	Cwd     *string           `json:"cwd,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	Shell   *string           `json:"shell,omitempty"`
	Timeout *int              `json:"timeout,omitempty"` // Timeout (seconds)
}

// SyncStreamStartEvent Start event
type SyncStreamStartEvent struct {
	Timestamp int64 `json:"timestamp"`
}

// SyncStreamOutputEvent Output event
type SyncStreamOutputEvent struct {
	Output    string `json:"output"`
	Timestamp int64  `json:"timestamp"`
}

// SyncStreamCompleteEvent Complete event
type SyncStreamCompleteEvent struct {
	ExitCode  *int  `json:"exitCode"`
	Duration  int64 `json:"duration"` // Execution time (milliseconds)
	Timestamp int64 `json:"timestamp"`
}

// SyncStreamErrorEvent Error event
type SyncStreamErrorEvent struct {
	Error      string `json:"error"`
	ExitCode   *int   `json:"exitCode,omitempty"`
	DurationMS int64  `json:"durationMs"`
	Timestamp  int64  `json:"timestamp"`
}

// ExecProcessSyncStream Handle synchronous streaming process execution
func (h *ProcessHandler) ExecProcessSyncStream(w http.ResponseWriter, r *http.Request) {
	var req SyncStreamExecutionRequest
	if err := common.ParseJSONBodyReturn(w, r, &req); err != nil {
		return
	}

	// Parameter validation
	if req.Command == "" {
		h.writeStreamError(w, "Command is required", 0)
		return
	}

	// Set default values
	timeout := 300 // Default 5-minute timeout
	if req.Timeout != nil && *req.Timeout > 0 {
		timeout = *req.Timeout
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Ensure immediate data flushing
	flusher, ok := w.(http.Flusher)
	if !ok {
		h.writeStreamError(w, "Streaming not supported", 0)
		return
	}

	startTime := time.Now()

	// Send start event
	h.writeStreamEvent(w, flusher, "start", SyncStreamStartEvent{
		Timestamp: startTime.Unix(),
	})

	// Create command
	cmd := h.buildSyncStreamCommand(req)

	// Create pipes to read output
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		h.writeStreamError(w, fmt.Sprintf("Failed to create stdout pipe: %v", err), time.Since(startTime).Milliseconds())
		return
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		h.writeStreamError(w, fmt.Sprintf("Failed to create stderr pipe: %v", err), time.Since(startTime).Milliseconds())
		return
	}

	// Start process
	if err := cmd.Start(); err != nil {
		h.writeStreamError(w, fmt.Sprintf("Failed to start process: %v", err), time.Since(startTime).Milliseconds())
		return
	}

	// Create context and cancel function
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	// Start output reading goroutines
	var wg sync.WaitGroup
	wg.Add(2)

	// Read stdout
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdoutPipe)
		for scanner.Scan() {
			select {
			case <-ctx.Done():
				return
			default:
				h.writeStreamEvent(w, flusher, "stdout", SyncStreamOutputEvent{
					Output:    scanner.Text() + "\n",
					Timestamp: time.Now().Unix(),
				})
			}
		}
	}()

	// Read stderr
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			select {
			case <-ctx.Done():
				return
			default:
				h.writeStreamEvent(w, flusher, "stderr", SyncStreamOutputEvent{
					Output:    scanner.Text() + "\n",
					Timestamp: time.Now().Unix(),
				})
			}
		}
	}()

	// Wait for process completion or timeout
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	var waitErr error
	select {
	case waitErr = <-done:
		// Process ended normally
	case <-ctx.Done():
		// Timeout, kill process
		cmd.Process.Kill()
		<-done // Wait for process to actually end
		waitErr = fmt.Errorf("execution timeout after %d seconds", timeout)
	}

	// Wait for output reading to complete
	wg.Wait()

	duration := time.Since(startTime).Milliseconds()

	// Send appropriate events based on results
	if waitErr != nil {
		if exitErr, ok := waitErr.(*exec.ExitError); ok {
			exitCode := exitErr.ExitCode()
			h.writeStreamEvent(w, flusher, "complete", SyncStreamCompleteEvent{
				ExitCode:  &exitCode,
				Duration:  duration,
				Timestamp: time.Now().Unix(),
			})
		} else {
			// Timeout or other error
			h.writeStreamError(w, waitErr.Error(), duration)
		}
	} else {
		exitCode := 0
		h.writeStreamEvent(w, flusher, "complete", SyncStreamCompleteEvent{
			ExitCode:  &exitCode,
			Duration:  duration,
			Timestamp: time.Now().Unix(),
		})
	}
}

// buildSyncStreamCommand Build synchronous streaming command
func (h *ProcessHandler) buildSyncStreamCommand(req SyncStreamExecutionRequest) *exec.Cmd {
	var cmd *exec.Cmd

	if len(req.Args) > 0 {
		cmd = exec.Command(req.Command, req.Args...)
	} else {
		// If no args provided, try to split command string
		parts := strings.Fields(req.Command)
		if len(parts) > 1 {
			cmd = exec.Command(parts[0], parts[1:]...)
		} else {
			cmd = exec.Command(req.Command)
		}
	}

	// Set working directory
	if req.Cwd != nil && *req.Cwd != "" {
		cmd.Dir = *req.Cwd
	}

	// Set environment variables
	if len(req.Env) > 0 {
		cmd.Env = os.Environ()
		for key, value := range req.Env {
			cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", key, value))
		}
	}

	// Set shell (if specified)
	if req.Shell != nil && *req.Shell != "" {
		// Execute command using specified shell
		shellCmd := fmt.Sprintf("%s -c '%s'", *req.Shell, req.Command)
		for _, arg := range req.Args {
			shellCmd += fmt.Sprintf(" '%s'", strings.ReplaceAll(arg, "'", "\\'"))
		}
		cmd = exec.Command(*req.Shell, "-c", shellCmd)
	}

	return cmd
}

// writeStreamEvent Write SSE event
func (h *ProcessHandler) writeStreamEvent(w http.ResponseWriter, flusher http.Flusher, eventType string, data any) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		slog.Error("Failed to marshal event data", "error", err)
		return
	}

	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, string(jsonData))
	flusher.Flush()
}

// writeStreamError Write error event
func (h *ProcessHandler) writeStreamError(w http.ResponseWriter, errorMsg string, duration int64) {
	errorEvent := SyncStreamErrorEvent{
		Error:      errorMsg,
		DurationMS: duration,
		Timestamp:  time.Now().Unix(),
	}

	jsonData, _ := json.Marshal(errorEvent)
	fmt.Fprintf(w, "event: error\ndata: %s\n\n", string(jsonData))
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
}
