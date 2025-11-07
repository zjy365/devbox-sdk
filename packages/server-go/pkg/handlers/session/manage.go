package session

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/errors"
	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
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
	common.Response
	SessionID  string            `json:"session_id"`
	Shell      string            `json:"shell"`
	Cwd        string            `json:"cwd"`
	Env        map[string]string `json:"env"`
	Status     string            `json:"status"`
	CreatedAt  string            `json:"created_at"`
	LastUsedAt string            `json:"last_used_at"`
}

type SessionEnvUpdateResponse struct {
	common.Response
}

type SessionExecResponse struct {
	common.Response
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	Duration int64  `json:"duration"`
}

type SessionCdResponse struct {
	common.Response
	WorkingDir string `json:"working_dir"`
}

// GetSession handles session information retrieval
func (h *SessionHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		errors.WriteErrorResponse(w, errors.NewAPIError(errors.ErrorTypeInvalidRequest, "Method not allowed", http.StatusMethodNotAllowed))
		return
	}

	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("sessionId parameter is required"))
		return
	}

	h.mutex.RLock()
	sessionInfo, exists := h.sessions[sessionID]
	h.mutex.RUnlock()

	if !exists {
		errors.WriteErrorResponse(w, errors.NewSessionNotFoundError(sessionID))
		return
	}

	response := SessionInfoResponse{
		Response:   common.Response{Success: true},
		SessionID:  sessionID,
		Shell:      sessionInfo.Shell,
		Cwd:        sessionInfo.Cwd,
		Env:        sessionInfo.Env,
		Status:     sessionInfo.Status,
		CreatedAt:  sessionInfo.CreatedAt.Truncate(time.Second).Format(time.RFC3339),
		LastUsedAt: sessionInfo.LastUsedAt.Truncate(time.Second).Format(time.RFC3339),
	}

	common.WriteJSONResponse(w, response)
}

// UpdateSessionEnv handles session environment updates
func (h *SessionHandler) UpdateSessionEnv(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errors.WriteErrorResponse(w, errors.NewAPIError(errors.ErrorTypeInvalidRequest, "Method not allowed", http.StatusMethodNotAllowed))
		return
	}

	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("sessionId parameter is required"))
		return
	}

	var req UpdateSessionEnvRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Invalid JSON body"))
		return
	}

	h.mutex.Lock()
	sessionInfo, exists := h.sessions[sessionID]
	if !exists {
		h.mutex.Unlock()
		errors.WriteErrorResponse(w, errors.NewSessionNotFoundError(sessionID))
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
			errors.WriteErrorResponse(w, errors.NewInternalError(fmt.Sprintf("Failed to update environment: %v", err)))
			return
		}
	}

	response := SessionEnvUpdateResponse{
		Response: common.Response{Success: true},
	}

	common.WriteJSONResponse(w, response)
}

// SessionExec handles command execution in session
func (h *SessionHandler) SessionExec(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errors.WriteErrorResponse(w, errors.NewAPIError(errors.ErrorTypeInvalidRequest, "Method not allowed", http.StatusMethodNotAllowed))
		return
	}

	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("sessionId parameter is required"))
		return
	}

	var req SessionExecRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Invalid JSON body"))
		return
	}

	if req.Command == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Command is required"))
		return
	}

	h.mutex.RLock()
	sessionInfo, exists := h.sessions[sessionID]
	h.mutex.RUnlock()

	if !exists {
		errors.WriteErrorResponse(w, errors.NewSessionNotFoundError(sessionID))
		return
	}

	if sessionInfo.Status != "active" {
		errors.WriteErrorResponse(w, errors.NewAPIError(errors.ErrorTypeConflict, "Session is not active", http.StatusConflict))
		return
	}

	// Update last used time
	h.mutex.Lock()
	sessionInfo.LastUsedAt = time.Now()
	h.mutex.Unlock()

	// Execute command in session
	command := req.Command + "\n"
	if _, err := sessionInfo.Stdin.Write([]byte(command)); err != nil {
		errors.WriteErrorResponse(w, errors.NewInternalError(fmt.Sprintf("Failed to execute command: %v", err)))
		return
	}

	// Log the command
	sessionInfo.LogMux.Lock()
	sessionInfo.Logs = append(sessionInfo.Logs, fmt.Sprintf("[%d] exec: %s", time.Now().Unix(), req.Command))
	sessionInfo.LogMux.Unlock()

	response := SessionExecResponse{
		Response: common.Response{Success: true},
		ExitCode: 0,
		Stdout:   "",
		Stderr:   "",
		Duration: 0,
	}

	common.WriteJSONResponse(w, response)
}

// SessionCd handles directory change in session
func (h *SessionHandler) SessionCd(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errors.WriteErrorResponse(w, errors.NewAPIError(errors.ErrorTypeInvalidRequest, "Method not allowed", http.StatusMethodNotAllowed))
		return
	}

	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("sessionId parameter is required"))
		return
	}

	var req SessionCdRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Invalid JSON body"))
		return
	}

	if req.Path == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Path is required"))
		return
	}

	h.mutex.Lock()
	sessionInfo, exists := h.sessions[sessionID]
	if !exists {
		h.mutex.Unlock()
		errors.WriteErrorResponse(w, errors.NewSessionNotFoundError(sessionID))
		return
	}

	if sessionInfo.Status != "active" {
		h.mutex.Unlock()
		errors.WriteErrorResponse(w, errors.NewAPIError(errors.ErrorTypeConflict, "Session is not active", http.StatusConflict))
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
		errors.WriteErrorResponse(w, errors.NewAPIError(errors.ErrorTypeNotFound, fmt.Sprintf("Directory not found: %s", newPath), http.StatusNotFound))
		return
	}

	// Update session working directory
	sessionInfo.Cwd = newPath
	sessionInfo.LastUsedAt = time.Now()
	h.mutex.Unlock()

	// Send cd command to shell
	cdCmd := fmt.Sprintf("cd %s\n", newPath)
	if _, err := sessionInfo.Stdin.Write([]byte(cdCmd)); err != nil {
		errors.WriteErrorResponse(w, errors.NewInternalError(fmt.Sprintf("Failed to change directory: %v", err)))
		return
	}

	// Log the directory change
	sessionInfo.LogMux.Lock()
	sessionInfo.Logs = append(sessionInfo.Logs, fmt.Sprintf("[%d] cd: %s", time.Now().Unix(), newPath))
	sessionInfo.LogMux.Unlock()

	response := SessionCdResponse{
		Response:   common.Response{Success: true},
		WorkingDir: newPath,
	}

	common.WriteJSONResponse(w, response)
}
