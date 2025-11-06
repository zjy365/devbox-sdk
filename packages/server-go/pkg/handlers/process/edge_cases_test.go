package process

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEdgeCases(t *testing.T) {
	handler := createTestProcessHandler(t)

	// Setup multiple processes with different commands and durations
	processIDs := make([]string, 0)
	commands := []ProcessExecRequest{
		{Command: "sleep", Args: []string{"0.1"}},
		{Command: "echo", Args: []string{"Hello, World!"}},
		{Command: "sh", Args: []string{"-c", "echo test && sleep 0.2"}},
	}

	for _, req := range commands {
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		var response ProcessExecResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		processIDs = append(processIDs, response.ProcessID)
	}

	// Verify process listing contains all processes
	httpReq := httptest.NewRequest("GET", "/api/v1/processes", nil)
	w := httptest.NewRecorder()

	handler.ListProcesses(w, httpReq)
	assert.Equal(t, http.StatusOK, w.Code)

	var listResponse ListProcessesResponse
	err := json.Unmarshal(w.Body.Bytes(), &listResponse)
	require.NoError(t, err)

	assert.True(t, listResponse.Success)
	assert.NotEmpty(t, listResponse.Processes)

	// Verify status endpoint handles multiple processes
	for _, processID := range processIDs {
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/status?id=%s", processID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessStatus(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		var statusResponse GetProcessStatusResponse
		err := json.Unmarshal(w.Body.Bytes(), &statusResponse)
		require.NoError(t, err)

		assert.True(t, statusResponse.Success)
		assert.Equal(t, processID, statusResponse.ProcessID)
		assert.Greater(t, statusResponse.PID, 0)
		// Status could be running or completed depending on timing
		assert.Contains(t, []string{"running", "completed", "failed"}, statusResponse.Status)
		assert.NotEmpty(t, statusResponse.StartAt)
	}

	// Verify logs endpoint handles special characters
	for _, processID := range processIDs {
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/logs?id=%s&stream=true", processID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessLogs(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		// For streaming, we expect event-stream content type
		assert.Equal(t, "text/event-stream", w.Header().Get("Content-Type"))

		// Try without streaming
		httpReq = httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/logs?id=%s", processID), nil)
		w = httptest.NewRecorder()

		handler.GetProcessLogs(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		var logsResponse GetProcessLogsResponse
		err := json.Unmarshal(w.Body.Bytes(), &logsResponse)
		require.NoError(t, err)

		assert.True(t, logsResponse.Success)
		assert.Equal(t, processID, logsResponse.ProcessID)
		assert.NotNil(t, logsResponse.Logs)
	}

	// Kill all processes
	for _, processID := range processIDs {
		httpReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/processes/kill?id=%s", processID), nil)
		w := httptest.NewRecorder()

		handler.KillProcess(w, httpReq)
		// Accept 200 when running, or 409 when already not running
		if w.Code == http.StatusOK {
			var response map[string]any
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)
			assert.True(t, response["success"].(bool))
		} else {
			assert.Equal(t, http.StatusConflict, w.Code)
			assertErrorResponse(t, w, "Process is not running")
		}
	}

	// Verify status after kill
	for _, processID := range processIDs {
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/status?id=%s", processID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessStatus(w, httpReq)

		var statusResponse GetProcessStatusResponse
		err := json.Unmarshal(w.Body.Bytes(), &statusResponse)
		require.NoError(t, err)

		// Status may vary after kill, but should be present
		assert.NotEmpty(t, statusResponse.Status)
	}
}

func TestErrorPaths(t *testing.T) {
	handler := createTestProcessHandler(t)

	t.Run("malformed process ID in status query", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/processes/status?id=", nil)
		w := httptest.NewRecorder()

		handler.GetProcessStatus(w, httpReq)

		// Now should be 400 with message
		assert.Equal(t, http.StatusBadRequest, w.Code)
		assertErrorResponse(t, w, "Process ID is required")
	})

	t.Run("malformed process ID in kill request", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/kill?id=", nil)
		w := httptest.NewRecorder()

		handler.KillProcess(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assertErrorResponse(t, w, "Process ID is required")
	})

	t.Run("malformed process ID in logs request", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/processes/logs?id=", nil)
		w := httptest.NewRecorder()

		handler.GetProcessLogs(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assertErrorResponse(t, w, "Process ID is required")
	})

	t.Run("extremely long process ID", func(t *testing.T) {
		longID := strings.Repeat("a", 1000)
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/status?id=%s", longID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessStatus(w, httpReq)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assertErrorResponse(t, w, "not found")
	})

	t.Run("special characters in process ID", func(t *testing.T) {
		specialID := "../../../etc/passwd&command=rm"
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/status?id=%s", specialID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessStatus(w, httpReq)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assertErrorResponse(t, w, "not found")
	})
}
