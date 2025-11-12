package session

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/labring/devbox-sdk-server/pkg/router"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetSessionLogs(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("get logs from active session", func(t *testing.T) {
		req := CreateSessionRequest{
			Env: map[string]string{"TEST": "logs"},
		}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/"+sessionID+"/logs", nil)
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("GET", "/api/v1/sessions/:id/logs", handler.GetSessionLogsWithParams)
		r.ServeHTTP(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SessionLogsResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, sessionID, response.Data.SessionID)
		assert.NotNil(t, response.Data.Logs)
	})

	t.Run("get logs from non-existent session", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/non-existent/logs", nil)
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("GET", "/api/v1/sessions/:id/logs", handler.GetSessionLogsWithParams)
		r.ServeHTTP(w, httpReq)
		assertErrorResponse(t, w, "not found")
	})

	t.Run("missing session ID", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions//logs", nil)
		w := httptest.NewRecorder()
		handler.GetSessionLogs(w, httpReq)
		assertErrorResponse(t, w, "sessionId parameter is required")
	})
}

func TestGetAllSessions(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("get all sessions from empty handler", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions", nil)
		w := httptest.NewRecorder()

		handler.GetAllSessions(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[GetAllSessionsResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Check for success field or sessions field directly
		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Empty(t, response.Data.Sessions)
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

		var response common.Response[GetAllSessionsResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Check response is successful
		assert.Equal(t, common.StatusSuccess, response.Status)
		require.NotNil(t, response.Data.Sessions)
		assert.Len(t, response.Data.Sessions, numSessions)

		// Verify session information
		for _, s := range response.Data.Sessions {
			assert.NotEmpty(t, s.SessionID)
			assert.Equal(t, "active", s.SessionStatus)
			assert.NotEmpty(t, s.Shell)
			assert.NotZero(t, s.CreatedAt)
			assert.NotZero(t, s.LastUsedAt)
		}
	})

	t.Run("get all sessions with mixed states", func(t *testing.T) {
		// Clear existing sessions to ensure test isolation
		handler.mutex.Lock()
		handler.sessions = make(map[string]*sessionInfo)
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
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/"+terminatedSessionID+"/terminate", nil)
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

		var response common.Response[GetAllSessionsResponse]
		err := json.Unmarshal(w2.Body.Bytes(), &response)
		require.NoError(t, err)

		// Check response is successful
		assert.Equal(t, common.StatusSuccess, response.Status)
		require.NotNil(t, response.Data.Sessions)
		assert.Len(t, response.Data.Sessions, 2)

		// Verify we have both active and terminated sessions
		var activeCount, terminatedCount int
		for _, s := range response.Data.Sessions {
			switch s.SessionStatus {
			case "active":
				activeCount++
			case "terminated", "failed", "completed":
				terminatedCount++
			}
		}

		assert.Equal(t, 1, activeCount, "should have one active session")
		assert.Equal(t, 1, terminatedCount, "should have one terminated session")
	})
}

func TestGetSessionLogsWithParams(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("get session logs with tail parameter", func(t *testing.T) {
		req := CreateSessionRequest{
			Env: map[string]string{"TEST": "params"},
		}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/"+sessionID+"/logs?tail=10", nil)
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("GET", "/api/v1/sessions/:id/logs", handler.GetSessionLogsWithParams)
		r.ServeHTTP(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SessionLogsResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, sessionID, response.Data.SessionID)
		assert.NotNil(t, response.Data.Logs)
	})
}

func TestSessionLogCollection(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("log collection during session execution", func(t *testing.T) {
		req := CreateSessionRequest{
			Env: map[string]string{"TEST": "collection"},
		}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		execReq := SessionExecRequest{
			Command: "echo 'test log message 1'; echo 'test log message 2'",
		}

		reqBody, _ := json.Marshal(execReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/"+sessionID+"/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("POST", "/api/v1/sessions/:id/exec", handler.SessionExec)
		r.ServeHTTP(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		time.Sleep(100 * time.Millisecond)

		httpReq = httptest.NewRequest("GET", "/api/v1/sessions/"+sessionID+"/logs", nil)
		w = httptest.NewRecorder()
		r2 := router.NewRouter()
		r2.Register("GET", "/api/v1/sessions/:id/logs", handler.GetSessionLogsWithParams)
		r2.ServeHTTP(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SessionLogsResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, sessionID, response.Data.SessionID)
		assert.NotNil(t, response.Data.Logs)
	})
}

func TestSessionLogErrorHandling(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("get logs from terminated session", func(t *testing.T) {
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/"+sessionID+"/terminate", nil)
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("POST", "/api/v1/sessions/:id/terminate", handler.TerminateSession)
		r.ServeHTTP(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		time.Sleep(100 * time.Millisecond)

		httpReq = httptest.NewRequest("GET", "/api/v1/sessions/"+sessionID+"/logs", nil)
		w = httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("special characters in session ID for logs", func(t *testing.T) {
		specialID := "../../../etc/passwd&command=rm"
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/"+specialID+"/logs", nil)
		w := httptest.NewRecorder()

		handler.GetSessionLogs(w, httpReq)

		assertErrorResponse(t, w, "not found")
	})
}
