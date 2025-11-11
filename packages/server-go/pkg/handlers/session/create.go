package session

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/errors"
	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
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
	Success   bool   `json:"success"`
	SessionID string `json:"sessionId"`
	Shell     string `json:"shell"`
	Cwd       string `json:"cwd"`
	Status    string `json:"status"`
}

// CreateSession handles session creation
func (h *SessionHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	var req CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Invalid JSON body"))
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
	sessionInfo := &SessionInfo{
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
		errors.WriteErrorResponse(w, errors.NewSessionOperationError(fmt.Sprintf("Failed to start shell: %v", err)))
		return
	}

	// Store session
	h.mutex.Lock()
	h.sessions[sessionID] = sessionInfo
	h.mutex.Unlock()

	response := CreateSessionResponse{
		Success:   true,
		SessionID: sessionID,
		Shell:     shell,
		Cwd:       workingDir,
		Status:    "active",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
