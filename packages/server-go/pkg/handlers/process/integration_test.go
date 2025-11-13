package process

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/labring/devbox-sdk-server/pkg/router"
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
		statusReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/process/%s/status", processID), nil)
		w2 := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("GET", "/api/v1/process/:id/status", handler.GetProcessStatus)
		r.ServeHTTP(w2, statusReq)
		assert.Equal(t, http.StatusOK, w2.Code)

		var statusResponse common.Response[GetProcessStatusResponse]
		err := json.Unmarshal(w2.Body.Bytes(), &statusResponse)
		require.NoError(t, err)
		assert.Equal(t, common.StatusSuccess, statusResponse.Status)
		assert.Equal(t, "running", statusResponse.Data.ProcessStatus)

		// 4. List processes (should include our process)
		listReq := httptest.NewRequest("GET", "/api/v1/processes", nil)
		w3 := httptest.NewRecorder()
		handler.ListProcesses(w3, listReq)
		assert.Equal(t, http.StatusOK, w3.Code)

		var listResponse common.Response[ListProcessesResponse]
		err = json.Unmarshal(w3.Body.Bytes(), &listResponse)
		require.NoError(t, err)
		assert.Equal(t, common.StatusSuccess, listResponse.Status)
		assert.Greater(t, len(listResponse.Data.Processes), 0)

		// 5. Get process logs
		logsReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/process/%s/logs", processID), nil)
		w4 := httptest.NewRecorder()
		r = router.NewRouter()
		r.Register("GET", "/api/v1/process/:id/logs", handler.GetProcessLogs)
		r.ServeHTTP(w4, logsReq)
		assert.Equal(t, http.StatusOK, w4.Code)

		var logsResponse common.Response[GetProcessLogsResponse]
		err = json.Unmarshal(w4.Body.Bytes(), &logsResponse)
		require.NoError(t, err)
		assert.Equal(t, common.StatusSuccess, logsResponse.Status)

		// 6. Kill process
		killReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/process/%s/kill", processID), nil)
		w5 := httptest.NewRecorder()
		r = router.NewRouter()
		r.Register("POST", "/api/v1/process/:id/kill", handler.KillProcess)
		r.ServeHTTP(w5, killReq)
		assert.Equal(t, http.StatusOK, w5.Code)

		var killResponse common.Response[struct{}]
		err = json.Unmarshal(w5.Body.Bytes(), &killResponse)
		require.NoError(t, err)
		assert.Equal(t, common.StatusSuccess, killResponse.Status)

		// 7. Verify process is no longer running
		waitForProcessCompletion(t, handler, processID, 2*time.Second)
	})
}
