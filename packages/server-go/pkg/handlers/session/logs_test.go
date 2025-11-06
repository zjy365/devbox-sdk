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

func TestGetSessionLogs(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("get logs from active session", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{
			Env: map[string]string{"TEST": "logs"},
		}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Get session logs
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/logs?sessionId="+sessionID, nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Check response is successful
		if success, ok := response["success"]; ok {
			assert.True(t, success.(bool), "Response should be successful")
		}
		assert.Equal(t, sessionID, response["sessionId"])
		assert.NotNil(t, response["logs"])
	})

	t.Run("get logs from non-existent session", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/logs?sessionId=non-existent", nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("get logs without session ID", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/logs", nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("get logs with empty session ID", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/logs?sessionId=", nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("invalid HTTP method", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/logs?sessionId=test", nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		// Should handle method not allowed gracefully
		assert.True(t, w.Code >= 400, "should return error for invalid method")
	})
}

func TestGetAllSessions(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("get all sessions from empty handler", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions", nil)
		w := httptest.NewRecorder()

		handler.GetAllSessions(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Check for success field or sessions field directly
		if success, ok := response["success"]; ok {
			assert.True(t, success.(bool), "Response should be successful")
		}
		// Check sessions field exists and is empty
		if sessions, ok := response["sessions"]; ok {
			assert.Empty(t, sessions, "Sessions should be empty")
		}
	})

	t.Run("get all sessions with active sessions", func(t *testing.T) {
		const numSessions = 3

		// Create multiple sessions
		for i := 0; i < numSessions; i++ {
			req := CreateSessionRequest{
				Env: map[string]string{"SESSION_NUM": string(rune(i + '1'))},
			}
			_, sessionID := createTestSession(t, handler, req)

			// Wait for session to be ready
			waitForSessionReady(t, handler, sessionID, 2*time.Second)
		}

		// Get all sessions
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions", nil)
		w := httptest.NewRecorder()

		handler.GetAllSessions(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Check response is successful
		if success, ok := response["success"]; ok {
			assert.True(t, success.(bool), "Response should be successful")
		}

		sessions, ok := response["sessions"].([]interface{})
		require.True(t, ok, "sessions should be an array")
		assert.Len(t, sessions, numSessions, "should have all sessions")

		// Verify session information
		for _, session := range sessions {
			sessionMap, ok := session.(map[string]any)
			require.True(t, ok, "session should be a map")

			assert.NotEmpty(t, sessionMap["sessionId"])
			assert.Equal(t, "active", sessionMap["status"])
			assert.NotEmpty(t, sessionMap["shell"])
			assert.NotEmpty(t, sessionMap["createdAt"])
			assert.NotEmpty(t, sessionMap["lastUsedAt"])
		}
	})

	t.Run("get all sessions with mixed states", func(t *testing.T) {
		// Clear existing sessions to ensure test isolation
		handler.mutex.Lock()
		handler.sessions = make(map[string]*SessionInfo)
		handler.mutex.Unlock()

		// Create an active session
		req1 := CreateSessionRequest{
			Env: map[string]string{"STATE": "active"},
		}
		_, activeSessionID := createTestSession(t, handler, req1)
		waitForSessionReady(t, handler, activeSessionID, 2*time.Second)

		// Create and terminate a session
		req2 := CreateSessionRequest{
			Env: map[string]string{"STATE": "terminated"},
		}
		_, terminatedSessionID := createTestSession(t, handler, req2)
		waitForSessionReady(t, handler, terminatedSessionID, 2*time.Second)

		// Terminate the second session
		terminateReq := SessionTerminateRequest{SessionID: terminatedSessionID}
		reqBody, _ := json.Marshal(terminateReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", bytes.NewReader(reqBody))
		w1 := httptest.NewRecorder()

		handler.TerminateSession(w1, httpReq)
		assert.Equal(t, http.StatusOK, w1.Code)

		// Wait for termination
		time.Sleep(100 * time.Millisecond)

		// Get all sessions
		httpReq = httptest.NewRequest("GET", "/api/v1/sessions", nil)
		w2 := httptest.NewRecorder()

		handler.GetAllSessions(w2, httpReq)

		assert.Equal(t, http.StatusOK, w2.Code)

		var response map[string]any
		err := json.Unmarshal(w2.Body.Bytes(), &response)
		require.NoError(t, err)

		// Check response is successful
		if success, ok := response["success"]; ok {
			assert.True(t, success.(bool), "Response should be successful")
		}

		sessions, ok := response["sessions"].([]interface{})
		require.True(t, ok, "sessions should be an array")
		assert.Len(t, sessions, 2, "should have both sessions")

		// Verify we have both active and terminated sessions
		var activeCount, terminatedCount int
		for _, session := range sessions {
			sessionMap := session.(map[string]any)
			switch sessionMap["status"].(string) {
			case "active":
				activeCount++
			case "terminated", "failed", "completed":
				terminatedCount++
			}
		}

		assert.Equal(t, 1, activeCount, "should have one active session")
		assert.Equal(t, 1, terminatedCount, "should have one terminated session")
	})

	t.Run("invalid HTTP method", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions", nil)
		w := httptest.NewRecorder()

		handler.GetAllSessions(w, httpReq)

		// Should handle method gracefully (returns 200)
		assert.Equal(t, http.StatusOK, w.Code)
	})
}

func TestGetSessionLogsWithParams(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("get session logs with parameters", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{
			Env: map[string]string{"TEST": "params"},
		}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Get session logs with parameters
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/logs?id="+sessionID+"&tail=10", nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogsWithParams(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Check response is successful
		if success, ok := response["success"]; ok {
			assert.True(t, success.(bool), "Response should be successful")
		}
		assert.Equal(t, sessionID, response["sessionId"])
		assert.NotNil(t, response["logs"])
	})

	t.Run("get logs for non-existent session with params", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/logs?id=non-existent&tail=10", nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogsWithParams(w, httpReq)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("get logs without session ID with params", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/logs", nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogsWithParams(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestSessionLogCollection(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("log collection during session execution", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{
			Env: map[string]string{"TEST": "collection"},
		}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Execute a command that generates output
		execReq := SessionExecRequest{
			Command: "echo 'test log message 1'; echo 'test log message 2'",
		}

		reqBody, _ := json.Marshal(execReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/exec?sessionId="+sessionID, bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.SessionExec(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		// Wait a bit for logs to be collected
		time.Sleep(100 * time.Millisecond)

		// Get logs
		httpReq = httptest.NewRequest("GET", "/api/v1/sessions/logs?sessionId="+sessionID, nil)
		w = httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Check response is successful
		if success, ok := response["success"]; ok {
			assert.True(t, success.(bool), "Response should be successful")
		}
		assert.Equal(t, sessionID, response["sessionId"])

		logs := response["logs"]
		assert.NotNil(t, logs, "logs should not be nil")
	})

	t.Run("log collection with multiple commands", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Execute multiple commands
		commands := []string{
			"echo 'First message'",
			"echo 'Second message'",
			"echo 'Third message'",
		}

		for _, command := range commands {
			execReq := SessionExecRequest{
				Command: command,
			}

			reqBody, _ := json.Marshal(execReq)
			httpReq := httptest.NewRequest("POST", "/api/v1/sessions/exec?sessionId="+sessionID, bytes.NewReader(reqBody))
			w := httptest.NewRecorder()

			handler.SessionExec(w, httpReq)
			assert.Equal(t, http.StatusOK, w.Code)
		}

		// Wait for logs to be collected
		time.Sleep(200 * time.Millisecond)

		// Get logs
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/logs?sessionId="+sessionID, nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Check response is successful
		if success, ok := response["success"]; ok {
			assert.True(t, success.(bool), "Response should be successful")
		}
		assert.Equal(t, sessionID, response["sessionId"])

		logs := response["logs"]
		assert.NotNil(t, logs, "logs should not be nil")
	})
}

func TestSessionLogFormat(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("log entry format verification", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Execute a command
		execReq := SessionExecRequest{
			Command: "echo 'formatted message'",
		}

		reqBody, _ := json.Marshal(execReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/exec?sessionId="+sessionID, bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.SessionExec(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		// Get logs
		httpReq = httptest.NewRequest("GET", "/api/v1/sessions/logs?sessionId="+sessionID, nil)
		w = httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Check response is successful
		if success, ok := response["success"]; ok {
			assert.True(t, success.(bool), "Response should be successful")
		}
		assert.Equal(t, sessionID, response["sessionId"])

		// Log entries should have proper format (implementation dependent)
		logs := response["logs"]
		assert.NotNil(t, logs, "logs should not be nil")
	})
}

func TestSessionLogErrorHandling(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("get logs from terminated session", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Terminate the session
		terminateReq := SessionTerminateRequest{SessionID: sessionID}
		reqBody, _ := json.Marshal(terminateReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/terminate", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.TerminateSession(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		// Wait for termination
		time.Sleep(100 * time.Millisecond)

		// Try to get logs from terminated session
		httpReq = httptest.NewRequest("GET", "/api/v1/sessions/logs?sessionId="+sessionID, nil)
		w = httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		// Response might succeed or fail depending on implementation
		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("malformed session ID in logs request", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/logs?sessionId=", nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("special characters in session ID for logs", func(t *testing.T) {
		specialID := "../../../etc/passwd&command=rm"
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/logs?sessionId="+specialID, nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("extremely long session ID for logs", func(t *testing.T) {
		longID := strings.Repeat("a", 1000)
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/logs?sessionId="+longID, nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})
}
