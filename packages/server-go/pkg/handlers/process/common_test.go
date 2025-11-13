package process

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"syscall"
	"testing"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Helper function to create test process handler
func createTestProcessHandler(t *testing.T) *ProcessHandler {
	handler := NewProcessHandler()

	// Register cleanup to ensure all processes are terminated
	t.Cleanup(func() {
		cleanupTestProcesses(t, handler)
	})

	return handler
}

// Helper function to start a test process and return its info
func startTestProcess(t *testing.T, handler *ProcessHandler, req ProcessExecRequest) (ProcessExecResponse, string) {
	reqBody, _ := json.Marshal(req)
	httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
	w := httptest.NewRecorder()

	handler.ExecProcess(w, httpReq)
	assert.Equal(t, http.StatusOK, w.Code)

	var response common.Response[ProcessExecResponse]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	processID := response.Data.ProcessID
	require.NotEmpty(t, processID)

	return response.Data, processID
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

// Helper function to clean up test processes
func cleanupTestProcesses(t *testing.T, h *ProcessHandler) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	for processID, processInfo := range h.processes {
		if processInfo.Cmd != nil && processInfo.Cmd.Process != nil {
			// Try graceful termination first
			if err := processInfo.Cmd.Process.Signal(syscall.SIGTERM); err != nil {
				// Force kill if SIGTERM fails
				_ = processInfo.Cmd.Process.Kill()
			}
			t.Logf("Cleaned up process: %s (PID: %d)", processID, processInfo.Cmd.Process.Pid)
		}
	}

	// Clear the process map
	h.processes = make(map[string]*processInfo)
}

// Helper function to wait for process completion with timeout
func waitForProcessCompletion(t *testing.T, h *ProcessHandler, processID string, timeout time.Duration) {
	timeoutChan := time.After(timeout)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-timeoutChan:
			t.Fatalf("Process %s did not complete within timeout", processID)
		case <-ticker.C:
			h.mutex.RLock()
			processInfo, exists := h.processes[processID]
			if !exists {
				h.mutex.RUnlock()
				return
			}
			if processInfo.Status != "running" {
				h.mutex.RUnlock()
				return
			}
			h.mutex.RUnlock()
		}
	}
}
