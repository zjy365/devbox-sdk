package session

import (
	"net/http"
	"strconv"

	"github.com/labring/devbox-sdk-server/pkg/common"
)

// Session operation response types
type SessionLogsResponse struct {
	SessionID string   `json:"sessionId"`
	Logs      []string `json:"logs"`
}

type SessionResponse struct {
	ID         string            `json:"Id"`
	Shell      string            `json:"shell"`
	Cwd        string            `json:"cwd"`
	Env        map[string]string `json:"env"`
	CreatedAt  int64             `json:"createdAt"`
	LastUsedAt int64             `json:"lastUsedAt"`
	Status     string            `json:"Status"`
}

type GetAllSessionsResponse struct {
	Sessions []SessionResponse `json:"sessions"`
	Count    int               `json:"count"`
}

// GetSessionLogs handles session log retrieval
func (h *SessionHandler) GetSessionLogs(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	sessionID := query.Get("sessionId")
	if sessionID == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "sessionId parameter is required")
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
		Sessions: sessions,
		Count:    len(sessions),
	}

	common.WriteSuccessResponse(w, response)
}
