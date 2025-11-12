package session

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"syscall"
	"testing"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Helper function to create test session handler
func createTestSessionHandler(t *testing.T) *SessionHandler {
	handler := NewSessionHandler()

	// Register cleanup to ensure all sessions are terminated
	t.Cleanup(func() {
		cleanupTestSessions(t, handler)
	})

	return handler
}

// Helper function to create a test session and return its info
func createTestSession(t *testing.T, handler *SessionHandler, req CreateSessionRequest) (CreateSessionResponse, string) {
	reqBody, _ := json.Marshal(req)
	httpReq := httptest.NewRequest("POST", "/api/v1/sessions", bytes.NewReader(reqBody))
	w := httptest.NewRecorder()

	handler.CreateSession(w, httpReq)
	assert.Equal(t, http.StatusOK, w.Code)

	var response common.Response[CreateSessionResponse]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, common.StatusSuccess, response.Status)
	assert.NotEmpty(t, response.Data.SessionID)

	return response.Data, response.Data.SessionID
}

// Helper function to assert error response
func assertErrorResponse(t *testing.T, w *httptest.ResponseRecorder, expectedError string) {
	assert.Equal(t, http.StatusOK, w.Code, "Status code should be 200")

	var response map[string]any
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err, "Response should be valid JSON")

	status, hasStatus := response["status"]
	assert.True(t, hasStatus, "Response should have status field")
	if hasStatus {
		statusFloat, ok := status.(float64)
		assert.True(t, ok, "Status should be a number")
		assert.NotEqual(t, float64(0), statusFloat, "Status should not be 0 (success)")
	}

	message, hasMessage := response["message"]
	if hasMessage {
		if messageStr, isStr := message.(string); isStr {
			assert.Contains(t, messageStr, expectedError, "Message should contain expected text")
		}
	}
}

// Helper function to clean up test sessions
func cleanupTestSessions(t *testing.T, h *SessionHandler) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	for sessionID, sessionInfo := range h.sessions {
		// Terminate the session if it's active
		if sessionInfo.Active && sessionInfo.Cmd != nil && sessionInfo.Cmd.Process != nil {
			// Try graceful termination first
			if err := sessionInfo.Cmd.Process.Signal(syscall.SIGTERM); err != nil {
				// Force kill if SIGTERM fails
				_ = sessionInfo.Cmd.Process.Kill()
			}
			t.Logf("Cleaned up session: %s (PID: %d)", sessionID, sessionInfo.Cmd.Process.Pid)
		}

		// Call cleanup function if exists
		if sessionInfo.CleanupFunc != nil {
			sessionInfo.CleanupFunc()
		}
	}

	// Clear the session map
	h.sessions = make(map[string]*sessionInfo)
}

// Helper function to check if a process is running
func isProcessRunning(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	err = process.Signal(syscall.Signal(0)) // Signal 0 checks if process exists
	return err == nil
}

// Helper function to create a temporary working directory
func createTempWorkingDir(t *testing.T) string {
	tempDir := t.TempDir()
	return tempDir
}

// Helper function to create test environment variables
func createTestEnvVars() map[string]string {
	return map[string]string{
		"TEST_VAR":  "test_value",
		"PATH":      os.Getenv("PATH"),
		"HOME":      os.Getenv("HOME"),
		"LANG":      "en_US.UTF-8",
		"TEST_MODE": "true",
	}
}

// Helper function to wait for session to be ready
func waitForSessionReady(t *testing.T, h *SessionHandler, sessionID string, timeout time.Duration) {
	timeoutChan := time.After(timeout)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-timeoutChan:
			t.Fatalf("Session %s did not become ready within timeout", sessionID)
		case <-ticker.C:
			h.mutex.RLock()
			sessionInfo, exists := h.sessions[sessionID]
			if exists && sessionInfo.Status == "active" && sessionInfo.Cmd != nil && sessionInfo.Cmd.Process != nil {
				h.mutex.RUnlock()
				// Give the shell a moment to fully initialize
				time.Sleep(100 * time.Millisecond)
				return
			}
			h.mutex.RUnlock()
		}
	}
}
