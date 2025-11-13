package session

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/labring/devbox-sdk-server/pkg/router"
)

// Session operation request types
type UpdateSessionEnvRequest struct {
	Env map[string]string `json:"env"`
}

type SessionExecRequest struct {
	Command string `json:"command"`
}

type SessionCdRequest struct {
	Path string `json:"path"`
}

// Session operation response types
type SessionInfoResponse struct {
	SessionID     string            `json:"sessionId"`
	Shell         string            `json:"shell"`
	Cwd           string            `json:"cwd"`
	Env           map[string]string `json:"env"`
	SessionStatus string            `json:"sessionStatus"`
	CreatedAt     string            `json:"createdAt"`
	LastUsedAt    string            `json:"lastUsedAt"`
}

type SessionExecResponse struct {
	ExitCode int    `json:"exitCode"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	Duration int64  `json:"duration"`
}

type SessionCdResponse struct {
	WorkingDir string `json:"workingDir"`
}

// GetSession handles session information retrieval
func (h *SessionHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	sessionID := router.Param(r, "id")
	if sessionID == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "session id parameter is required")
		return
	}

	h.mutex.RLock()
	sessionInfo, exists := h.sessions[sessionID]
	h.mutex.RUnlock()

	if !exists {
		common.WriteErrorResponse(w, common.StatusNotFound, "Session not found: %s", sessionID)
		return
	}

	response := SessionInfoResponse{
		SessionID:     sessionID,
		Shell:         sessionInfo.Shell,
		Cwd:           sessionInfo.Cwd,
		Env:           sessionInfo.Env,
		SessionStatus: sessionInfo.Status,
		CreatedAt:     sessionInfo.CreatedAt.Truncate(time.Second).Format(time.RFC3339),
		LastUsedAt:    sessionInfo.LastUsedAt.Truncate(time.Second).Format(time.RFC3339),
	}

	common.WriteSuccessResponse(w, response)
}

// UpdateSessionEnv handles session environment updates
func (h *SessionHandler) UpdateSessionEnv(w http.ResponseWriter, r *http.Request) {
	sessionID := router.Param(r, "id")
	if sessionID == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "session id parameter is required")
		return
	}

	var req UpdateSessionEnvRequest
	if err := common.ParseJSONBodyReturn(w, r, &req); err != nil {
		return
	}

	h.mutex.Lock()
	sessionInfo, exists := h.sessions[sessionID]
	if !exists {
		h.mutex.Unlock()
		common.WriteErrorResponse(w, common.StatusNotFound, "Session not found: %s", sessionID)
		return
	}

	// Update environment variables
	for k, v := range req.Env {
		sessionInfo.Env[k] = v
	}
	sessionInfo.LastUsedAt = time.Now()
	h.mutex.Unlock()

	// Send environment updates to shell
	for k, v := range req.Env {
		envCmd := fmt.Sprintf("export %s=%s\n", k, v)
		if _, err := sessionInfo.Stdin.Write([]byte(envCmd)); err != nil {
			common.WriteErrorResponse(w, common.StatusOperationError, "Failed to update environment: %v", err)
			return
		}
	}

	common.WriteSuccessResponse(w, struct{}{})
}

// SessionExec handles command execution in session
func (h *SessionHandler) SessionExec(w http.ResponseWriter, r *http.Request) {
	sessionID := router.Param(r, "id")
	if sessionID == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "session id parameter is required")
		return
	}

	var req SessionExecRequest
	if err := common.ParseJSONBodyReturn(w, r, &req); err != nil {
		return
	}

	if req.Command == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Command is required")
		return
	}

	h.mutex.RLock()
	sessionInfo, exists := h.sessions[sessionID]
	h.mutex.RUnlock()

	if !exists {
		common.WriteErrorResponse(w, common.StatusNotFound, "Session not found: %s", sessionID)
		return
	}

	if sessionInfo.Status != "active" {
		common.WriteErrorResponse(w, common.StatusConflict, "Session is not active")
		return
	}

	// Update last used time
	h.mutex.Lock()
	sessionInfo.LastUsedAt = time.Now()
	h.mutex.Unlock()

	// Execute command in session
	command := req.Command + "\n"
	if _, err := sessionInfo.Stdin.Write([]byte(command)); err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to execute command: %v", err)
		return
	}

	// Log the command
	sessionInfo.LogMux.Lock()
	sessionInfo.Logs = append(sessionInfo.Logs, fmt.Sprintf("[%d] exec: %s", time.Now().Unix(), req.Command))
	sessionInfo.LogMux.Unlock()

	response := SessionExecResponse{
		ExitCode: 0,
		Stdout:   "",
		Stderr:   "",
		Duration: 0,
	}

	common.WriteSuccessResponse(w, response)
}

// SessionCd handles directory change in session
func (h *SessionHandler) SessionCd(w http.ResponseWriter, r *http.Request) {
	sessionID := router.Param(r, "id")
	if sessionID == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "session id parameter is required")
		return
	}

	var req SessionCdRequest
	if err := common.ParseJSONBodyReturn(w, r, &req); err != nil {
		return
	}

	if req.Path == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Path is required")
		return
	}

	h.mutex.Lock()
	sessionInfo, exists := h.sessions[sessionID]
	if !exists {
		h.mutex.Unlock()
		common.WriteErrorResponse(w, common.StatusNotFound, "Session not found: %s", sessionID)
		return
	}

	if sessionInfo.Status != "active" {
		h.mutex.Unlock()
		common.WriteErrorResponse(w, common.StatusConflict, "Session is not active")
		return
	}

	// Resolve path
	var newPath string
	if filepath.IsAbs(req.Path) {
		newPath = req.Path
	} else {
		newPath = filepath.Join(sessionInfo.Cwd, req.Path)
	}

	// Clean path
	newPath = filepath.Clean(newPath)

	// Check if directory exists
	if info, err := os.Stat(newPath); err != nil || !info.IsDir() {
		h.mutex.Unlock()
		common.WriteErrorResponse(w, common.StatusNotFound, "Directory not found: %s", newPath)
		return
	}

	// Update session working directory
	sessionInfo.Cwd = newPath
	sessionInfo.LastUsedAt = time.Now()
	h.mutex.Unlock()

	// Send cd command to shell
	cdCmd := fmt.Sprintf("cd %s\n", newPath)
	if _, err := sessionInfo.Stdin.Write([]byte(cdCmd)); err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to change directory: %v", err)
		return
	}

	// Log the directory change
	sessionInfo.LogMux.Lock()
	sessionInfo.Logs = append(sessionInfo.Logs, fmt.Sprintf("[%d] cd: %s", time.Now().Unix(), newPath))
	sessionInfo.LogMux.Unlock()

	response := SessionCdResponse{
		WorkingDir: newPath,
	}

	common.WriteSuccessResponse(w, response)
}
