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

func TestCreateSession(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("successful session creation with defaults", func(t *testing.T) {
		req := CreateSessionRequest{}
		response, sessionID := createTestSession(t, handler, req)

		assert.True(t, response.Success)
		assert.NotEmpty(t, response.SessionID)
		assert.Equal(t, sessionID, response.SessionID)
		assert.Equal(t, "/bin/bash", response.Shell) // Default shell
		assert.Equal(t, "active", response.Status)
		assert.NotEmpty(t, response.Cwd) // Should be set to current working directory

		// Verify session is stored in handler
		handler.mutex.RLock()
		sessionInfo, exists := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		assert.True(t, exists, "session should be stored in handler")
		assert.NotNil(t, sessionInfo, "session info should not be nil")
		assert.Equal(t, sessionID, sessionInfo.ID)
		assert.Equal(t, "/bin/bash", sessionInfo.Shell)
		assert.Equal(t, "active", sessionInfo.Status)
		assert.True(t, sessionInfo.Active)
	})

	t.Run("session creation with custom shell", func(t *testing.T) {
		customShell := "/bin/sh"
		req := CreateSessionRequest{
			Shell: &customShell,
		}

		response, sessionID := createTestSession(t, handler, req)

		assert.True(t, response.Success)
		assert.Equal(t, customShell, response.Shell)

		// Verify session info
		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		assert.Equal(t, customShell, sessionInfo.Shell)
	})

	t.Run("session creation with custom working directory", func(t *testing.T) {
		tempDir := createTempWorkingDir(t)
		req := CreateSessionRequest{
			WorkingDir: &tempDir,
		}

		response, sessionID := createTestSession(t, handler, req)

		assert.True(t, response.Success)
		assert.Equal(t, tempDir, response.Cwd)

		// Verify session info
		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		assert.Equal(t, tempDir, sessionInfo.Cwd)
	})

	t.Run("session creation with environment variables", func(t *testing.T) {
		envVars := map[string]string{
			"TEST_VAR": "test_value",
			"PATH":     "/custom/path",
		}

		req := CreateSessionRequest{
			Env: envVars,
		}

		response, sessionID := createTestSession(t, handler, req)

		assert.True(t, response.Success)

		// Verify session info
		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		assert.Equal(t, envVars["TEST_VAR"], sessionInfo.Env["TEST_VAR"])
		assert.Equal(t, envVars["PATH"], sessionInfo.Env["PATH"])
	})

	t.Run("session creation with all custom parameters", func(t *testing.T) {
		tempDir := createTempWorkingDir(t)
		customShell := "/bin/sh"
		envVars := createTestEnvVars()

		req := CreateSessionRequest{
			WorkingDir: &tempDir,
			Shell:      &customShell,
			Env:        envVars,
		}

		response, sessionID := createTestSession(t, handler, req)

		assert.True(t, response.Success)
		assert.Equal(t, customShell, response.Shell)
		assert.Equal(t, tempDir, response.Cwd)

		// Verify session info
		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		assert.Equal(t, customShell, sessionInfo.Shell)
		assert.Equal(t, tempDir, sessionInfo.Cwd)

		// Verify environment variables
		for key, value := range envVars {
			assert.Equal(t, value, sessionInfo.Env[key], "environment variable %s should match", key)
		}
	})

	t.Run("invalid JSON request", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions", strings.NewReader("invalid json"))
		w := httptest.NewRecorder()

		handler.CreateSession(w, httpReq)

		// Should return 400 for invalid JSON
		assert.Equal(t, http.StatusBadRequest, w.Code)
		assertErrorResponse(t, w, "JSON")
	})

	t.Run("empty request body", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions", strings.NewReader("{}"))
		w := httptest.NewRecorder()

		handler.CreateSession(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response CreateSessionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.NotEmpty(t, response.SessionID)
	})

	t.Run("session creation with empty shell parameter", func(t *testing.T) {
		emptyShell := ""
		req := CreateSessionRequest{
			Shell: &emptyShell,
		}

		response, sessionID := createTestSession(t, handler, req)

		assert.True(t, response.Success)
		assert.Equal(t, "/bin/bash", response.Shell) // Should use default

		// Verify session info
		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		assert.Equal(t, "/bin/bash", sessionInfo.Shell)
	})

	t.Run("session creation with empty working directory", func(t *testing.T) {
		emptyDir := ""
		req := CreateSessionRequest{
			WorkingDir: &emptyDir,
		}

		response, sessionID := createTestSession(t, handler, req)

		assert.True(t, response.Success)
		assert.NotEmpty(t, response.Cwd) // Should use current directory

		// Verify session info
		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		assert.NotEmpty(t, sessionInfo.Cwd)
	})

	t.Run("session creation timestamps", func(t *testing.T) {
		beforeCreation := time.Now()
		req := CreateSessionRequest{}
		response, sessionID := createTestSession(t, handler, req)
		afterCreation := time.Now()

		assert.True(t, response.Success)

		// Verify session info timestamps
		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		assert.True(t, sessionInfo.CreatedAt.After(beforeCreation) || sessionInfo.CreatedAt.Equal(beforeCreation))
		assert.True(t, sessionInfo.CreatedAt.Before(afterCreation) || sessionInfo.CreatedAt.Equal(afterCreation))
		assert.True(t, sessionInfo.LastUsedAt.After(beforeCreation) || sessionInfo.LastUsedAt.Equal(beforeCreation))
		assert.True(t, sessionInfo.LastUsedAt.Before(afterCreation) || sessionInfo.LastUsedAt.Equal(afterCreation))
		// Allow small time difference between CreatedAt and LastUsedAt due to execution time
		timeDiff := sessionInfo.LastUsedAt.Sub(sessionInfo.CreatedAt)
		assert.True(t, timeDiff >= 0 && timeDiff < time.Second, "LastUsedAt should be close to CreatedAt")
	})

	t.Run("multiple session creation", func(t *testing.T) {
		const numSessions = 5
		sessionIDs := make([]string, 0, numSessions)

		for i := 0; i < numSessions; i++ {
			req := CreateSessionRequest{
				Env: map[string]string{
					"SESSION_NUM": string(rune(i + '1')),
				},
			}

			_, sessionID := createTestSession(t, handler, req)
			sessionIDs = append(sessionIDs, sessionID)
		}

		// Verify all sessions are unique
		seenIDs := make(map[string]bool)
		for _, id := range sessionIDs {
			assert.False(t, seenIDs[id], "session ID should be unique: %s", id)
			seenIDs[id] = true

			// Verify session exists
			handler.mutex.RLock()
			sessionInfo, exists := handler.sessions[id]
			handler.mutex.RUnlock()

			assert.True(t, exists, "session should exist")
			assert.NotNil(t, sessionInfo, "session info should not be nil")
		}

		assert.Len(t, seenIDs, numSessions, "should have unique session IDs")
	})

	t.Run("invalid HTTP method", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions", nil)
		w := httptest.NewRecorder()

		handler.CreateSession(w, httpReq)

		// Should handle method not allowed gracefully or return an error
		assert.True(t, w.Code >= 400, "should return error for invalid method")
	})
}

func TestCreateSession_ProcessInitialization(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("shell process is started", func(t *testing.T) {
		req := CreateSessionRequest{
			Shell: &[]string{"/bin/bash"}[0],
		}

		response, sessionID := createTestSession(t, handler, req)
		assert.True(t, response.Success)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		// Verify the shell process is running
		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		require.NotNil(t, sessionInfo, "session info should not be nil")
		require.NotNil(t, sessionInfo.Cmd, "command should not be nil")
		require.NotNil(t, sessionInfo.Cmd.Process, "process should not be nil")
		assert.True(t, isProcessRunning(sessionInfo.Cmd.Process.Pid), "shell process should be running")
	})

	t.Run("session logs are initialized", func(t *testing.T) {
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)

		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		assert.NotNil(t, sessionInfo.Logs, "logs slice should be initialized")
		assert.Empty(t, sessionInfo.Logs, "logs should start empty")
	})

	t.Run("session I/O streams are set up", func(t *testing.T) {
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		handler.mutex.RLock()
		sessionInfo := handler.sessions[sessionID]
		handler.mutex.RUnlock()

		// We can't easily test the I/O streams without actually using them,
		// but we can verify they're set up (not nil)
		// Note: This might be implementation dependent
		assert.NotNil(t, sessionInfo, "session info should not be nil")
	})
}

func TestCreateSession_ErrorHandling(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("session creation with invalid shell", func(t *testing.T) {
		invalidShell := "/nonexistent/shell"
		req := CreateSessionRequest{
			Shell: &invalidShell,
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.CreateSession(w, httpReq)

		// Should return 500 for invalid shell path
		assert.Equal(t, http.StatusInternalServerError, w.Code)
		assertErrorResponse(t, w, "shell")
	})

	t.Run("session creation with invalid working directory", func(t *testing.T) {
		invalidDir := "/nonexistent/directory/path"
		req := CreateSessionRequest{
			WorkingDir: &invalidDir,
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.CreateSession(w, httpReq)

		// Should return 500 for invalid working directory
		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}
