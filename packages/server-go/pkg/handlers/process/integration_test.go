package process

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProcessHandlerIntegration(t *testing.T) {
	handler := createTestProcessHandler(t)

	t.Run("complete process lifecycle", func(t *testing.T) {
		// 1. Execute process
		req := ProcessExecRequest{
			Command: "sh",
			Args:    []string{"-c", "echo 'lifecycle test'; sleep 0.2"},
		}
		_, processID := startTestProcess(t, handler, req)

		// 3. Get process status
		statusReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/status?id=%s", processID), nil)
		w2 := httptest.NewRecorder()
		handler.GetProcessStatus(w2, statusReq)
		assert.Equal(t, http.StatusOK, w2.Code)

		var statusResponse GetProcessStatusResponse
		err := json.Unmarshal(w2.Body.Bytes(), &statusResponse)
		require.NoError(t, err)
		assert.True(t, statusResponse.Success)
		assert.Equal(t, "running", statusResponse.Status)

		// 4. List processes (should include our process)
		listReq := httptest.NewRequest("GET", "/api/v1/processes", nil)
		w3 := httptest.NewRecorder()
		handler.ListProcesses(w3, listReq)
		assert.Equal(t, http.StatusOK, w3.Code)

		var listResponse ListProcessesResponse
		err = json.Unmarshal(w3.Body.Bytes(), &listResponse)
		require.NoError(t, err)
		assert.True(t, listResponse.Success)
		assert.Greater(t, len(listResponse.Processes), 0)

		// 5. Get process logs
		logsReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/logs?id=%s", processID), nil)
		w4 := httptest.NewRecorder()
		handler.GetProcessLogs(w4, logsReq)
		assert.Equal(t, http.StatusOK, w4.Code)

		var logsResponse GetProcessLogsResponse
		err = json.Unmarshal(w4.Body.Bytes(), &logsResponse)
		require.NoError(t, err)
		assert.True(t, logsResponse.Success)

		// 6. Kill process
		killReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/processes/kill?id=%s", processID), nil)
		w5 := httptest.NewRecorder()
		handler.KillProcess(w5, killReq)
		assert.Equal(t, http.StatusOK, w5.Code)

		var killResponse common.Response
		err = json.Unmarshal(w5.Body.Bytes(), &killResponse)
		require.NoError(t, err)
		assert.True(t, killResponse.Success)

		// 7. Verify process is no longer running
		waitForProcessCompletion(t, handler, processID, 2*time.Second)
	})
}
