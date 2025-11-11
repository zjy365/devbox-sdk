package process

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/errors"
	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
	"github.com/labring/devbox-sdk-server/pkg/utils"
)

// Process operation request types
type ProcessExecRequest struct {
	Command string            `json:"command"`
	Args    []string          `json:"args,omitempty"`
	Cwd     *string           `json:"cwd,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	Shell   *string           `json:"shell,omitempty"`
	Timeout *int              `json:"timeout,omitempty"`
}

// Process operation response types
type ProcessExecResponse struct {
	common.Response
	ProcessID string  `json:"processId"`
	PID       int     `json:"pid"`
	Status    string  `json:"status"`
	ExitCode  *int    `json:"exitCode,omitempty"`
	Stdout    *string `json:"stdout,omitempty"`
	Stderr    *string `json:"stderr,omitempty"`
}

// ExecProcess handles process execution
func (h *ProcessHandler) ExecProcess(w http.ResponseWriter, r *http.Request) {
	var req ProcessExecRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Invalid request body"))
		return
	}

	// Validate required fields
	if req.Command == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Command is required"))
		return
	}

	// Generate process ID
	processID := utils.NewNanoID()

	// Prepare command
	var cmd *exec.Cmd
	if len(req.Args) > 0 {
		cmd = exec.Command(req.Command, req.Args...)
	} else {
		// Split command string if no args provided
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

	// Create pipes for stdout and stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewInternalError(fmt.Sprintf("Failed to create stdout pipe: %v", err)))
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewInternalError(fmt.Sprintf("Failed to create stderr pipe: %v", err)))
		return
	}

	// Start the process
	if err := cmd.Start(); err != nil {
		// If process fails to start, create a failed process entry for consistency
		// This allows users to query the process status and logs
		processInfo := &ProcessInfo{
			ID:         processID,
			Cmd:        cmd,
			StartAt:    time.Now(),
			Status:     "failed",
			Logs:       make([]string, 0),
			LogEntries: make([]common.LogEntry, 0),
		}

		// Add failure log entry
		logEntry := common.LogEntry{
			Timestamp:  time.Now().Unix(),
			Level:      "error",
			Source:     "system",
			TargetID:   processID,
			TargetType: "process",
			Message:    fmt.Sprintf("Failed to start process: %v", err),
		}
		processInfo.LogEntries = append(processInfo.LogEntries, logEntry)

		// Store process info
		h.mutex.Lock()
		h.processes[processID] = processInfo
		h.mutex.Unlock()

		// Return success response with process ID, but indicate failure in status
		response := ProcessExecResponse{
			Response: common.Response{
				Success: false,
				Error:   fmt.Sprintf("Failed to start process: %v", err),
			},
			ProcessID: processID,
			Status:    "failed",
		}

		common.WriteJSONResponse(w, response)
		return
	}

	// Create process info
	processInfo := &ProcessInfo{
		ID:         processID,
		Cmd:        cmd,
		StartAt:    time.Now(),
		Status:     "running",
		Logs:       make([]string, 0),
		LogEntries: make([]common.LogEntry, 0),
	}

	// Store process info
	h.mutex.Lock()
	h.processes[processID] = processInfo
	h.mutex.Unlock()

	// Start log collection goroutines
	go h.collectLogs(processID, stdout, stderr)

	// Start process monitoring goroutine
	go h.monitorProcess(processID)

	response := ProcessExecResponse{
		Response:  common.Response{Success: true},
		ProcessID: processID,
		PID:       cmd.Process.Pid,
		Status:    "running",
	}

	common.WriteJSONResponse(w, response)
}
