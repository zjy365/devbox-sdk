package process

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
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
	ProcessID     string  `json:"processId"`
	PID           int     `json:"pid"`
	ProcessStatus string  `json:"processStatus"`
	ExitCode      *int    `json:"exitCode,omitempty"`
	Stdout        *string `json:"stdout,omitempty"`
	Stderr        *string `json:"stderr,omitempty"`
}

// ExecProcess handles process execution
func (h *ProcessHandler) ExecProcess(w http.ResponseWriter, r *http.Request) {
	var req ProcessExecRequest
	if err := common.ParseJSONBodyReturn(w, r, &req); err != nil {
		return
	}

	// Validate required fields
	if req.Command == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Command is required")
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
		common.WriteErrorResponse(w, common.StatusInternalError, "Failed to create stdout pipe: %v", err)
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		common.WriteErrorResponse(w, common.StatusInternalError, "Failed to create stderr pipe: %v", err)
		return
	}

	// Start the process
	if err := cmd.Start(); err != nil {
		// If process fails to start, return failure response
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to start process: %v", err)
		return
	}

	// Create process info
	processInfo := &processInfo{
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
		ProcessID:     processID,
		PID:           cmd.Process.Pid,
		ProcessStatus: "running",
	}

	common.WriteSuccessResponse(w, response)
}
