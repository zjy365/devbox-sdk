package session

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/labring/devbox-sdk-server/pkg/errors"
)

// Session operation response types
type SessionLogsResponse struct {
	Success   bool     `json:"success"`
	SessionID string   `json:"session_id"`
	Logs      []string `json:"logs"`
}

type SessionResponse struct {
	ID         string            `json:"session_id"`
	Shell      string            `json:"shell"`
	Cwd        string            `json:"cwd"`
	Env        map[string]string `json:"env"`
	CreatedAt  int64             `json:"created_at"`
	LastUsedAt int64             `json:"last_used_at"`
	Status     string            `json:"status"`
}

type GetAllSessionsResponse struct {
	Success  bool              `json:"success"`
	Sessions []SessionResponse `json:"sessions"`
	Count    int               `json:"count"`
}

// GetSessionLogs handles session log retrieval
func (h *SessionHandler) GetSessionLogs(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	sessionID := query.Get("sessionId")
	if sessionID == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("sessionId parameter is required"))
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
		errors.WriteErrorResponse(w, errors.NewSessionNotFoundError(sessionID))
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
		Success:   true,
		SessionID: sessionID,
		Logs:      tailedLogs,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// GetAllSessions handles getting all sessions
func (h *SessionHandler) GetAllSessions(w http.ResponseWriter, r *http.Request) {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	sessions := make([]SessionResponse, 0, len(h.sessions))
	for _, sessionInfo := range h.sessions {
		sessions = append(sessions, SessionResponse{
			ID:         sessionInfo.ID,
			Shell:      sessionInfo.Shell,
			Cwd:        sessionInfo.Cwd,
			Env:        sessionInfo.Env,
			CreatedAt:  sessionInfo.CreatedAt.Unix(),
			LastUsedAt: sessionInfo.LastUsedAt.Unix(),
			Status:     sessionInfo.Status,
		})
	}

	response := GetAllSessionsResponse{
		Success:  true,
		Sessions: sessions,
		Count:    len(sessions),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
