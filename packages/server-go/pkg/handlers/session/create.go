package session

import (
	"net/http"
	"os"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/labring/devbox-sdk-server/pkg/utils"
)

// Session operation request types
type CreateSessionRequest struct {
	WorkingDir *string           `json:"workingDir,omitempty"`
	Env        map[string]string `json:"env,omitempty"`
	Shell      *string           `json:"shell,omitempty"`
}

// Session operation response types
type CreateSessionResponse struct {
	SessionID     string `json:"sessionId"`
	Shell         string `json:"shell"`
	Cwd           string `json:"cwd"`
	SessionStatus string `json:"sessionStatus"`
}

// CreateSession handles session creation
func (h *SessionHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	var req CreateSessionRequest
	if err := common.ParseJSONBodyReturn(w, r, &req); err != nil {
		return
	}

	// Set defaults
	shell := "/bin/bash"
	if req.Shell != nil && *req.Shell != "" {
		shell = *req.Shell
	}

	workingDir, _ := os.Getwd()
	if req.WorkingDir != nil && *req.WorkingDir != "" {
		workingDir = *req.WorkingDir
	}

	// Generate session ID
	sessionID := utils.NewNanoID()

	// Prepare environment
	env := make(map[string]string)
	for k, v := range req.Env {
		env[k] = v
	}

	// Create session info
	sessionInfo := &sessionInfo{
		ID:         sessionID,
		Shell:      shell,
		Cwd:        workingDir,
		Env:        env,
		CreatedAt:  time.Now(),
		LastUsedAt: time.Now(),
		Status:     "active",
		Logs:       make([]string, 0),
		LogEntries: make([]common.LogEntry, 0),
		Active:     true,
	}

	// Start shell process
	if err := h.startShellProcess(sessionInfo); err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to start shell: %v", err)
		return
	}

	// Store session
	h.mutex.Lock()
	h.sessions[sessionID] = sessionInfo
	h.mutex.Unlock()

	response := CreateSessionResponse{
		SessionID:     sessionID,
		Shell:         shell,
		Cwd:           workingDir,
		SessionStatus: "active",
	}

	common.WriteSuccessResponse(w, response)
}
