package session

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTerminateSession(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("terminate active session", func(t *testing.T) {
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		isActiveBefore := sessionInfo.Active
		handler.mutex.RUnlock()

		assert.True(t, isActiveBefore, "session should be active before termination")

		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/"+sessionID+"/terminate", nil)
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SessionTerminateResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, common.StatusSuccess, response.Status)

		time.Sleep(100 * time.Millisecond)

		handler.mutex.RLock()
		sessionInfo, exists := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		if exists {
			assert.False(t, sessionInfo.Active, "session should not be active after termination")
			assert.Contains(t, []string{"terminated", "failed", "completed"}, sessionInfo.Status,
				"session status should indicate termination")
		}
	})

	t.Run("terminate non-existent session", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/non-existent/terminate", nil)
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)
		assertErrorResponse(t, w, "not found")
	})

	t.Run("missing session ID", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions//terminate", nil)
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)
		assertErrorResponse(t, w, "session id parameter is required")
	})

	t.Run("terminate multiple sessions", func(t *testing.T) {
		const numSessions = 3
		sessionIDs := make([]string, 0, numSessions)

		for i := 0; i < numSessions; i++ {
			req := CreateSessionRequest{
				Env: map[string]string{"SESSION_NUM": string(rune(i + '1'))},
			}
			_, sessionID := createTestSession(t, handler, req)
			sessionIDs = append(sessionIDs, sessionID)
			waitForSessionReady(t, handler, sessionID, 2*time.Second)
		}

		for _, sessionID := range sessionIDs {
			params := map[string]string{"id": sessionID}
			httpReq := httptest.NewRequest("POST", "/api/v1/sessions/"+sessionID+"/terminate", nil)
			w := httptest.NewRecorder()

			handler.TerminateSessionWithParams(w, httpReq, params)

			assert.Equal(t, http.StatusOK, w.Code)

			var response common.Response[SessionTerminateResponse]
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)
			assert.Equal(t, common.StatusSuccess, response.Status, "termination should succeed")
		}

		time.Sleep(200 * time.Millisecond)

		handler.mutex.RLock()
		for _, sessionID := range sessionIDs {
			if sessionInfo, exists := handler.sessions[sessionID]; exists {
				assert.False(t, sessionInfo.Active, "session %s should not be active", sessionID)
			}
		}
		handler.mutex.RUnlock()
	})
}

func TestTerminateSessionWithParams(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("terminate session with parameters", func(t *testing.T) {
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		params := map[string]string{
			"id":    sessionID,
			"force": "true",
		}

		httpReq := httptest.NewRequest("POST", "/api/v1/sessions//terminate", nil)
		w := httptest.NewRecorder()

		handler.TerminateSessionWithParams(w, httpReq, params)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SessionTerminateResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, common.StatusSuccess, response.Status)
	})

	t.Run("terminate non-existent session with params", func(t *testing.T) {
		params := map[string]string{
			"id":    "non-existent",
			"force": "true",
		}

		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", nil)
		w := httptest.NewRecorder()

		handler.TerminateSessionWithParams(w, httpReq, params)
		assertErrorResponse(t, w, "not found")
	})
}

func TestSessionTerminationErrorHandling(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("special characters in session ID", func(t *testing.T) {
		specialID := "../../../etc/passwd&command=rm"
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/"+specialID+"/terminate", nil)
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)

		assertErrorResponse(t, w, "not found")
	})
}
