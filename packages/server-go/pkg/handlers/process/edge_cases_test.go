package process

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/labring/devbox-sdk-server/pkg/router"
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

		var response common.Response[ProcessExecResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		processIDs = append(processIDs, response.Data.ProcessID)
	}

	// Verify process listing contains all processes
	httpReq := httptest.NewRequest("GET", "/api/v1/processes", nil)
	w := httptest.NewRecorder()

	handler.ListProcesses(w, httpReq)
	assert.Equal(t, http.StatusOK, w.Code)

	var listResponse common.Response[ListProcessesResponse]
	err := json.Unmarshal(w.Body.Bytes(), &listResponse)
	require.NoError(t, err)

	assert.Equal(t, common.StatusSuccess, listResponse.Status)
	assert.NotEmpty(t, listResponse.Data.Processes)

	// Verify status endpoint handles multiple processes
	for _, processID := range processIDs {
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/process/%s/status", processID), nil)
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("GET", "/api/v1/process/:id/status", handler.GetProcessStatus)
		r.ServeHTTP(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		var statusResponse common.Response[GetProcessStatusResponse]
		err := json.Unmarshal(w.Body.Bytes(), &statusResponse)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, statusResponse.Status)
		assert.Equal(t, processID, statusResponse.Data.ProcessID)
		assert.Greater(t, statusResponse.Data.PID, 0)
		// Status could be running or completed depending on timing
		assert.Contains(t, []string{"running", "completed", "failed"}, statusResponse.Data.ProcessStatus)
		assert.NotEmpty(t, statusResponse.Data.StartedAt)
	}

	// Verify logs endpoint handles special characters
	for _, processID := range processIDs {
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/process/%s/logs?stream=true", processID), nil)
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("GET", "/api/v1/process/:id/logs", handler.GetProcessLogs)
		r.ServeHTTP(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		// For streaming, we expect event-stream content type
		assert.Equal(t, "text/event-stream", w.Header().Get("Content-Type"))

		// Try without streaming
		httpReq = httptest.NewRequest("GET", fmt.Sprintf("/api/v1/process/%s/logs", processID), nil)
		w = httptest.NewRecorder()
		r = router.NewRouter()
		r.Register("GET", "/api/v1/process/:id/logs", handler.GetProcessLogs)
		r.ServeHTTP(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		var logsResponse common.Response[GetProcessLogsResponse]
		err := json.Unmarshal(w.Body.Bytes(), &logsResponse)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, logsResponse.Status)
		assert.Equal(t, processID, logsResponse.Data.ProcessID)
		assert.NotNil(t, logsResponse.Data.Logs)
	}

	// Kill all processes
	for _, processID := range processIDs {
		httpReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/process/%s/kill", processID), nil)
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("POST", "/api/v1/process/:id/kill", handler.KillProcess)
		r.ServeHTTP(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		var response common.Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		// Process might be completed already, so accept success, operation error, not found, or conflict
		validStatuses := []common.Status{
			common.StatusSuccess,
			common.StatusOperationError,
			common.StatusNotFound,
			common.StatusConflict,
		}
		assert.Contains(t, validStatuses, response.Status)
	}

	// Verify status after kill
	for _, processID := range processIDs {
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/process/%s/status", processID), nil)
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("GET", "/api/v1/process/:id/status", handler.GetProcessStatus)
		r.ServeHTTP(w, httpReq)

		var statusResponse common.Response[GetProcessStatusResponse]
		err := json.Unmarshal(w.Body.Bytes(), &statusResponse)
		require.NoError(t, err)

		// Status may vary after kill, but should be present
		assert.NotEmpty(t, statusResponse.Data.ProcessStatus)
	}
}

func TestErrorPaths(t *testing.T) {
	handler := createTestProcessHandler(t)

	t.Run("malformed process ID in status query", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/process//status", nil)
		w := httptest.NewRecorder()

		handler.GetProcessStatus(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assertErrorResponse(t, w, "Process ID is required")
	})

	t.Run("malformed process ID in kill request", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/process//kill", nil)
		w := httptest.NewRecorder()

		handler.KillProcess(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assertErrorResponse(t, w, "Process ID is required")
	})

	t.Run("malformed process ID in logs request", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/process//logs", nil)
		w := httptest.NewRecorder()

		handler.GetProcessLogs(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assertErrorResponse(t, w, "Process ID is required")
	})

	t.Run("extremely long process ID", func(t *testing.T) {
		longID := strings.Repeat("a", 1000)
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/process/%s/status", longID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessStatus(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assertErrorResponse(t, w, "not found")
	})

	t.Run("special characters in process ID", func(t *testing.T) {
		specialID := "../../../etc/passwd&command=rm"
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/process/%s/status", specialID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessStatus(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assertErrorResponse(t, w, "not found")
	})
}
