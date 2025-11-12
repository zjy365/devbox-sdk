package session

import (
	"net/http"
	"strconv"
	"syscall"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/labring/devbox-sdk-server/pkg/router"
)

// Session operation response types
type SessionTerminateResponse struct {
	SessionID     string `json:"sessionId"`
	SessionStatus string `json:"SessionStatus"`
}

// TerminateSession handles session termination
func (h *SessionHandler) TerminateSession(w http.ResponseWriter, r *http.Request) {
	sessionID := router.Param(r, "id")
	if sessionID == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "session id parameter is required")
		return
	}

	h.mutex.Lock()
	sessionInfo, exists := h.sessions[sessionID]
	if !exists {
		h.mutex.Unlock()
		common.WriteErrorResponse(w, common.StatusNotFound, "Session not found: %s", sessionID)
		return
	}

	// Mark session as terminated
	sessionInfo.Status = "terminated"
	sessionInfo.Active = false
	h.mutex.Unlock()

	// Terminate shell process
	if sessionInfo.Cmd != nil && sessionInfo.Cmd.Process != nil {
		sessionInfo.Stdin.Close()
		sessionInfo.Cmd.Process.Signal(syscall.SIGTERM)

		// Wait for process to exit with timeout
		done := make(chan error, 1)
		go func() {
			done <- sessionInfo.Cmd.Wait()
		}()

		select {
		case <-done:
			// Process exited
		case <-time.After(5 * time.Second):
			// Force kill
			sessionInfo.Cmd.Process.Kill()
		}
	}

	// Cancel cleanup function
	if sessionInfo.CleanupFunc != nil {
		sessionInfo.CleanupFunc()
	}

	// Remove session after delay
	go func(id string) {
		time.Sleep(1 * time.Minute)
		h.mutex.Lock()
		delete(h.sessions, id)
		h.mutex.Unlock()
	}(sessionID)

	response := SessionTerminateResponse{
		SessionID:     sessionID,
		SessionStatus: "terminated",
	}

	common.WriteSuccessResponse(w, response)
}

// TerminateSessionWithParams handles session termination using path parameters
func (h *SessionHandler) TerminateSessionWithParams(w http.ResponseWriter, r *http.Request, params map[string]string) {
	sessionID := params["id"]
	if sessionID == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "session id parameter is required")
		return
	}

	h.mutex.Lock()
	sessionInfo, exists := h.sessions[sessionID]
	if !exists {
		h.mutex.Unlock()
		common.WriteErrorResponse(w, common.StatusNotFound, "Session not found: %s", sessionID)
		return
	}

	// Mark session as terminated
	sessionInfo.Status = "terminated"
	sessionInfo.Active = false
	h.mutex.Unlock()

	// Terminate shell process
	if sessionInfo.Cmd != nil && sessionInfo.Cmd.Process != nil {
		sessionInfo.Stdin.Close()
		sessionInfo.Cmd.Process.Signal(syscall.SIGTERM)

		// Wait for process to exit with timeout
		done := make(chan error, 1)
		go func() {
			done <- sessionInfo.Cmd.Wait()
		}()

		select {
		case <-done:
			// Process exited
		case <-time.After(5 * time.Second):
			// Force kill
			sessionInfo.Cmd.Process.Kill()
		}
	}

	// Cancel cleanup function
	if sessionInfo.CleanupFunc != nil {
		sessionInfo.CleanupFunc()
	}

	// Remove session after delay
	go func() {
		time.Sleep(1 * time.Minute)
		h.mutex.Lock()
		delete(h.sessions, sessionID)
		h.mutex.Unlock()
	}()

	response := SessionTerminateResponse{
		SessionID:     sessionID,
		SessionStatus: "terminated",
	}

	common.WriteSuccessResponse(w, response)
}

// GetSessionLogsWithParams handles session log retrieval using path parameters
func (h *SessionHandler) GetSessionLogsWithParams(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	sessionID := router.Param(r, "id")
	if sessionID == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "session id parameter is required")
		return
	}

	// Parse query parameters
	tailStr := query.Get("tail")
	tail := 100 // Default tail lines
	if tailStr != "" {
		if t, err := strconv.Atoi(tailStr); err == nil && t > 0 {
			tail = t
		}
	}

	h.mutex.RLock()
	sessionInfo, exists := h.sessions[sessionID]
	h.mutex.RUnlock()

	if !exists {
		common.WriteErrorResponse(w, common.StatusNotFound, "Session not found: %s", sessionID)
		return
	}

	// Get logs
	sessionInfo.LogMux.RLock()
	logs := sessionInfo.Logs
	sessionInfo.LogMux.RUnlock()

	// Apply tail limit
	startIndex := 0
	if len(logs) > tail {
		startIndex = len(logs) - tail
	}
	tailedLogs := logs[startIndex:]

	response := SessionLogsResponse{
		SessionID: sessionID,
		Logs:      tailedLogs,
	}

	common.WriteSuccessResponse(w, response)
}
