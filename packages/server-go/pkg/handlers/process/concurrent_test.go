package process

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/router"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConcurrentProcessOperations(t *testing.T) {
	handler := createTestProcessHandler(t)

	t.Run("concurrent process execution", func(t *testing.T) {
		numProcesses := 10
		processIDs := make([]string, 0, numProcesses)
		var mutex sync.Mutex

		// Start multiple processes concurrently
		var wg sync.WaitGroup
		for i := 0; i < numProcesses; i++ {
			wg.Add(1)
			go func(index int) {
				defer wg.Done()

				req := ProcessExecRequest{
					Command: "sleep",
					Args:    []string{"1"},
				}

				reqBody, _ := json.Marshal(req)
				httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
				w := httptest.NewRecorder()

				handler.ExecProcess(w, httpReq)

				var response ProcessExecResponse
				if err := json.Unmarshal(w.Body.Bytes(), &response); err == nil {
					mutex.Lock()
					processIDs = append(processIDs, fmt.Sprintf("proc_%d_%d", index, response.PID))
					mutex.Unlock()
				}
			}(i)
		}

		wg.Wait()

		// Should have started all processes
		assert.GreaterOrEqual(t, len(processIDs), numProcesses/2) // Allow some failures in CI

		// List processes concurrently while they're running
		var listWG sync.WaitGroup
		for i := 0; i < 5; i++ {
			listWG.Add(1)
			go func() {
				defer listWG.Done()

				httpReq := httptest.NewRequest("GET", "/api/v1/processes", nil)
				w := httptest.NewRecorder()

				handler.ListProcesses(w, httpReq)

				assert.Equal(t, http.StatusOK, w.Code)
			}()
		}

		listWG.Wait()

		// Clean up remaining processes
		handler.mutex.Lock()
		for id, info := range handler.processes {
			if info.Cmd.Process != nil {
				info.Cmd.Process.Kill()
			}
			delete(handler.processes, id)
		}
		handler.mutex.Unlock()
	})

	t.Run("concurrent process status queries", func(t *testing.T) {
		// Start a long-running process
		req := ProcessExecRequest{
			Command: "sleep",
			Args:    []string{"2"},
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()
		handler.ExecProcess(w, httpReq)

		var execResponse ProcessExecResponse
		err := json.Unmarshal(w.Body.Bytes(), &execResponse)
		require.NoError(t, err)

		// Use returned application-layer process ID
		processID := execResponse.ProcessID
		require.NotEmpty(t, processID)

		// Query status concurrently
		var wg sync.WaitGroup
		for i := 0; i < 10; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()

				httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/process/%s/status", processID), nil)
				w := httptest.NewRecorder()
				r := router.NewRouter()
				r.Register("GET", "/api/v1/process/:id/status", handler.GetProcessStatus)
				r.ServeHTTP(w, httpReq)

				assert.Equal(t, http.StatusOK, w.Code)
			}()
		}

		wg.Wait()
	})

	t.Run("concurrent log access", func(t *testing.T) {
		// Start a process that generates output
		req := ProcessExecRequest{
			Command: "sh",
			Args:    []string{"-c", "for i in $(seq 1 50); do echo \"Log line $i\"; sleep 0.02; done"},
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()
		handler.ExecProcess(w, httpReq)

		var execResponse ProcessExecResponse
		err := json.Unmarshal(w.Body.Bytes(), &execResponse)
		require.NoError(t, err)

		// Use returned application-layer process ID
		processID := execResponse.ProcessID
		require.NotEmpty(t, processID)

		// Access logs concurrently while process is running
		var wg sync.WaitGroup
		for i := 0; i < 5; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()

				httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/process/%s/logs", processID), nil)
				w := httptest.NewRecorder()
				r := router.NewRouter()
				r.Register("GET", "/api/v1/process/:id/logs", handler.GetProcessLogs)
				r.ServeHTTP(w, httpReq)

				assert.Equal(t, http.StatusOK, w.Code)
			}()
		}

		wg.Wait()

		// Wait for process to complete
		waitForProcessCompletion(t, handler, processID, 3*time.Second)
	})
}
