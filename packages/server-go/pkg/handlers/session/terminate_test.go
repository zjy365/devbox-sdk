package session

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTerminateSession(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("terminate active session", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Verify session is active
		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		isActiveBefore := sessionInfo.Active
		handler.mutex.RUnlock()

		assert.True(t, isActiveBefore, "session should be active before termination")

		// Terminate the session
		terminateReq := SessionTerminateRequest{SessionID: sessionID}
		reqBody, _ := json.Marshal(terminateReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response["success"].(bool))

		// Wait for termination to complete
		time.Sleep(100 * time.Millisecond)

		// Verify session is terminated
		handler.mutex.RLock()
		sessionInfo, exists := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		if exists {
			assert.False(t, sessionInfo.Active, "session should not be active after termination")
			// Status can be "terminated", "failed", or "completed" depending on how the shell exits
			assert.Contains(t, []string{"terminated", "failed", "completed"}, sessionInfo.Status,
				"session status should indicate termination")
		}
	})

	t.Run("terminate non-existent session", func(t *testing.T) {
		terminateReq := SessionTerminateRequest{SessionID: "non-existent"}
		reqBody, _ := json.Marshal(terminateReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assertErrorResponse(t, w, "not found")
	})

	t.Run("terminate session without ID", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", nil)
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assertErrorResponse(t, w, "Invalid JSON body")
	})

	t.Run("terminate already terminated session", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Terminate the session once
		terminateReq := SessionTerminateRequest{SessionID: sessionID}
		reqBody, _ := json.Marshal(terminateReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", bytes.NewReader(reqBody))
		w1 := httptest.NewRecorder()

		handler.TerminateSession(w1, httpReq)
		assert.Equal(t, http.StatusOK, w1.Code)

		// Wait for termination
		time.Sleep(100 * time.Millisecond)

		// Try to terminate again
		httpReq = httptest.NewRequest("POST", "/api/v1/sessions/terminate", bytes.NewReader(reqBody))
		w2 := httptest.NewRecorder()

		handler.TerminateSession(w2, httpReq)

		assert.Equal(t, http.StatusOK, w2.Code)
		// Response might be success (idempotent) or error depending on implementation
	})

	t.Run("terminate multiple sessions", func(t *testing.T) {
		const numSessions = 3
		sessionIDs := make([]string, 0, numSessions)

		// Create multiple sessions
		for i := 0; i < numSessions; i++ {
			req := CreateSessionRequest{
				Env: map[string]string{"SESSION_NUM": string(rune(i + '1'))},
			}
			_, sessionID := createTestSession(t, handler, req)
			sessionIDs = append(sessionIDs, sessionID)

			// Wait for session to be ready
			waitForSessionReady(t, handler, sessionID, 2*time.Second)
		}

		// Terminate all sessions
		for _, sessionID := range sessionIDs {
			params := map[string]string{"id": sessionID}
			httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate?id="+sessionID, nil)
			w := httptest.NewRecorder()

			handler.TerminateSessionWithParams(w, httpReq, params)

			assert.Equal(t, http.StatusOK, w.Code)

			var response map[string]any
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			assert.True(t, response["success"].(bool), "termination should succeed")
		}

		// Wait for all terminations to complete
		time.Sleep(200 * time.Millisecond)

		// Verify all sessions are terminated
		handler.mutex.RLock()
		for _, sessionID := range sessionIDs {
			if sessionInfo, exists := handler.sessions[sessionID]; exists {
				assert.False(t, sessionInfo.Active, "session %s should not be active", sessionID)
			}
		}
		handler.mutex.RUnlock()
	})

	t.Run("invalid HTTP method", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/terminate?id=test", nil)
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)

		// Should handle method not allowed gracefully - currently returns 400 for GET due to JSON decode error
		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("terminate session with cleanup verification", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Get the process PID before termination
		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		var processPID int
		if sessionInfo.Cmd != nil && sessionInfo.Cmd.Process != nil {
			processPID = sessionInfo.Cmd.Process.Pid
		}
		handler.mutex.RUnlock()

		// Terminate the session
		terminateReq := SessionTerminateRequest{SessionID: sessionID}
		reqBody, _ := json.Marshal(terminateReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		// Wait for termination
		time.Sleep(200 * time.Millisecond)

		// Verify process is no longer running (if we could get the PID)
		if processPID > 0 {
			assert.False(t, isProcessRunning(processPID), "process should be terminated")
		}
	})
}

func TestTerminateSessionWithParams(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("terminate session with parameters", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Terminate with parameters
		params := map[string]string{
			"id":    sessionID,
			"force": "true",
		}

		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", nil)
		w := httptest.NewRecorder()

		handler.TerminateSessionWithParams(w, httpReq, params)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response["success"].(bool))

		// Wait for termination
		time.Sleep(100 * time.Millisecond)

		// Verify session is terminated
		handler.mutex.RLock()
		sessionInfo, exists := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		if exists {
			assert.False(t, sessionInfo.Active, "session should not be active")
			assert.Contains(t, []string{"terminated", "failed", "completed"}, sessionInfo.Status,
				"session status should indicate termination")
		}
	})

	t.Run("terminate non-existent session with params", func(t *testing.T) {
		params := map[string]string{
			"id":    "non-existent",
			"force": "true",
		}

		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", nil)
		w := httptest.NewRecorder()

		handler.TerminateSessionWithParams(w, httpReq, params)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assertErrorResponse(t, w, "not found")
	})

	t.Run("terminate session without params", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Terminate with session ID param only
		params := map[string]string{
			"id": sessionID,
		}

		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", nil)
		w := httptest.NewRecorder()

		handler.TerminateSessionWithParams(w, httpReq, params)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response["success"].(bool))
	})
}

func TestSessionCleanup(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("session cleanup after termination", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{
			Env: map[string]string{"TEST": "cleanup"},
		}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Add some logs to the session
		handler.mutex.Lock()
		if sessionInfo, exists := handler.sessions[sessionID]; exists {
			sessionInfo.LogMux.Lock()
			sessionInfo.Logs = append(sessionInfo.Logs, "test log message")
			sessionInfo.Logs = append(sessionInfo.Logs, "another log message")
			sessionInfo.LogMux.Unlock()
		}
		handler.mutex.Unlock()

		// Terminate the session
		terminateReq := SessionTerminateRequest{SessionID: sessionID}
		reqBody, _ := json.Marshal(terminateReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		// Wait for termination
		time.Sleep(200 * time.Millisecond)

		// Verify cleanup happened
		handler.mutex.RLock()
		sessionInfo, exists := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		if exists {
			assert.False(t, sessionInfo.Active, "session should not be active")
			assert.Contains(t, []string{"terminated", "failed", "completed"}, sessionInfo.Status,
				"session status should indicate termination")
			// Session info should still exist for historical purposes
			assert.NotNil(t, sessionInfo, "session info should still exist")
		}
	})

	t.Run("session resource cleanup", func(t *testing.T) {
		// This test verifies that resources are properly cleaned up
		// Create multiple sessions and terminate them
		const numSessions = 5
		sessionIDs := make([]string, 0, numSessions)

		for i := 0; i < numSessions; i++ {
			req := CreateSessionRequest{
				Env: map[string]string{"SESSION": string(rune(i + 'A'))},
			}
			_, sessionID := createTestSession(t, handler, req)
			sessionIDs = append(sessionIDs, sessionID)

			// Wait for session to be ready
			waitForSessionReady(t, handler, sessionID, 2*time.Second)
		}

		// Terminate all sessions
		for _, sessionID := range sessionIDs {
			params := map[string]string{"id": sessionID}
			httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate?id="+sessionID, nil)
			w := httptest.NewRecorder()

			handler.TerminateSessionWithParams(w, httpReq, params)
			assert.Equal(t, http.StatusOK, w.Code)
		}

		// Wait for all terminations
		time.Sleep(500 * time.Millisecond)

		// Verify cleanup
		handler.mutex.RLock()
		activeCount := 0
		for _, sessionInfo := range handler.sessions {
			if sessionInfo.Active {
				activeCount++
			}
		}
		handler.mutex.RUnlock()

		assert.Equal(t, 0, activeCount, "no sessions should be active")
	})
}

func TestSessionTerminationErrorHandling(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("malformed session ID", func(t *testing.T) {
		// Test with empty session ID in JSON body
		terminateReq := SessionTerminateRequest{SessionID: ""}
		reqBody, _ := json.Marshal(terminateReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assertErrorResponse(t, w, "SessionID is required")
	})

	t.Run("special characters in session ID", func(t *testing.T) {
		specialID := "../../../etc/passwd&command=rm"
		terminateReq := SessionTerminateRequest{SessionID: specialID}
		reqBody, _ := json.Marshal(terminateReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assertErrorResponse(t, w, "not found")
	})

	t.Run("extremely long session ID", func(t *testing.T) {
		longID := strings.Repeat("a", 1000)
		terminateReq := SessionTerminateRequest{SessionID: longID}
		reqBody, _ := json.Marshal(terminateReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assertErrorResponse(t, w, "not found")
	})
}
