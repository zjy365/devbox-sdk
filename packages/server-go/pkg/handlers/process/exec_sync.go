package process

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
)

// SyncExecutionRequest Synchronous execution request
type SyncExecutionRequest struct {
	Command string            `json:"command"`
	Args    []string          `json:"args,omitempty"`
	Cwd     *string           `json:"cwd,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	Shell   *string           `json:"shell,omitempty"`
	Timeout *int              `json:"timeout,omitempty"` // Timeout (seconds)
}

// SyncExecutionResponse Synchronous execution response
type SyncExecutionResponse struct {
	Stdout     string `json:"stdout"`
	Stderr     string `json:"stderr"`
	ExitCode   *int   `json:"exitCode"`
	DurationMS int64  `json:"durationMs"` // Execution time (milliseconds)
	StartTime  int64  `json:"startTime"`
	EndTime    int64  `json:"endTime"`
}

// ExecProcessSync Handle synchronous process execution
func (h *ProcessHandler) ExecProcessSync(w http.ResponseWriter, r *http.Request) {
	var req SyncExecutionRequest
	if err := common.ParseJSONBodyReturn(w, r, &req); err != nil {
		return
	}

	// Parameter validation
	if req.Command == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Command is required")
		return
	}

	// Set default values
	timeout := 30 // Default 30-second timeout
	if req.Timeout != nil && *req.Timeout > 0 {
		timeout = *req.Timeout
	}

	startTime := time.Now()

	// Create command
	cmd := h.buildCommand(req)

	// Create output capturer
	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	// Start process
	if err := cmd.Start(); err != nil {
		// If process fails to start, we can still return a proper response
		// This handles cases like command not found (exit code 127)
		startTime = time.Now()
		endTime := time.Now()

		// Try to extract exit code from the error
		var exitCode *int
		if exitErr, ok := err.(*exec.ExitError); ok {
			code := exitErr.ExitCode()
			exitCode = &code
		} else {
			// For "command not found" errors, set exit code 127
			code := 127
			exitCode = &code
		}

		response := SyncExecutionResponse{
			Stdout:     "",
			Stderr:     err.Error(),
			DurationMS: 0,
			StartTime:  startTime.Unix(),
			EndTime:    endTime.Unix(),
			ExitCode:   exitCode,
		}
		common.WriteJSONResponse(w, common.StatusOperationError, "", response)
		return
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	// Wait for process completion (with timeout)
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
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		<-done // Wait for process to actually end
		waitErr = fmt.Errorf("execution timeout after %d seconds", timeout)
	}

	endTime := time.Now()
	duration := endTime.Sub(startTime).Milliseconds()

	// Log execution results
	if waitErr != nil {
		slog.Error("Sync execution failed", "duration_ms", duration, "error", waitErr)
	} else {
		slog.Info("Sync execution completed", "duration_ms", duration)
	}

	// Build response
	response := SyncExecutionResponse{
		Stdout:     stdoutBuf.String(),
		Stderr:     stderrBuf.String(),
		DurationMS: duration,
		StartTime:  startTime.Unix(),
		EndTime:    endTime.Unix(),
	}

	// Set exit code
	if waitErr != nil {
		if exitErr, ok := waitErr.(*exec.ExitError); ok {
			exitCode := exitErr.ExitCode()
			response.ExitCode = &exitCode
		} else {
			// Timeout or other error
			common.WriteJSONResponse(w, common.StatusOperationError, waitErr.Error(), response)
			return
		}
	} else {
		exitCode := 0
		response.ExitCode = &exitCode
	}

	common.WriteSuccessResponse(w, response)
}

// buildCommand Build command
func (h *ProcessHandler) buildCommand(req SyncExecutionRequest) *exec.Cmd {
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
		// Note: Shell support can be implemented here as needed
		// Currently keeping it simple, using exec.Command directly
	}

	return cmd
}
