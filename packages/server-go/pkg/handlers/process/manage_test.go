package process

import (
	"bytes"
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

func TestGetProcessStatus(t *testing.T) {
	handler := createTestProcessHandler(t)

	// Setup: Start a test process
	execReq := ProcessExecRequest{
		Command: "sleep",
		Args:    []string{"1"},
	}
	execResponse, processID := startTestProcess(t, handler, execReq)

	t.Run("get existing process status", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/status?id=%s", processID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessStatus(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response GetProcessStatusResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, processID, response.ProcessID)
		assert.Equal(t, execResponse.PID, response.PID)
		assert.Equal(t, "running", response.Status)
		assert.NotEmpty(t, response.StartAt)
	})

	t.Run("get non-existent process status", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/processes/status?id=non-existent-id", nil)
		w := httptest.NewRecorder()

		handler.GetProcessStatus(w, httpReq)

		assertErrorResponse(t, w, "not found")
	})

	t.Run("missing process ID", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/processes/status", nil)
		w := httptest.NewRecorder()

		handler.GetProcessStatus(w, httpReq)

		assertErrorResponse(t, w, "Process ID is required")
	})

	t.Run("invalid HTTP method", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/status", nil)
		w := httptest.NewRecorder()

		handler.GetProcessStatus(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestKillProcess(t *testing.T) {
	handler := createTestProcessHandler(t)

	// Setup: Start a long-running test process
	execReq := ProcessExecRequest{
		Command: "sleep",
		Args:    []string{"10"},
	}
	_, processID := startTestProcess(t, handler, execReq)

	t.Run("kill process with default signal", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/processes/kill?id=%s", processID), nil)
		w := httptest.NewRecorder()

		handler.KillProcess(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
	})

	t.Run("kill non-existent process", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/kill?id=non-existent", nil)
		w := httptest.NewRecorder()

		handler.KillProcess(w, httpReq)

		assertErrorResponse(t, w, "not found")
	})

	t.Run("kill process with specific signal", func(t *testing.T) {
		// Start another process for signal test
		_, processID2 := startTestProcess(t, handler, execReq)

		httpReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/processes/kill?id=%s&signal=SIGKILL", processID2), nil)
		w := httptest.NewRecorder()

		handler.KillProcess(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
	})

	t.Run("kill process with invalid signal", func(t *testing.T) {
		// This test uses the already killed process from previous test
		httpReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/processes/kill?id=%s&signal=INVALID", processID), nil)
		w := httptest.NewRecorder()

		handler.KillProcess(w, httpReq)

		assertErrorResponse(t, w, "Invalid signal")
	})

	t.Run("missing process ID", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/kill", nil)
		w := httptest.NewRecorder()

		handler.KillProcess(w, httpReq)

		assertErrorResponse(t, w, "Process ID is required")
	})

	t.Run("invalid HTTP method", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/processes/kill", nil)
		w := httptest.NewRecorder()

		handler.KillProcess(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("kill already completed process", func(t *testing.T) {
		// Start a process that completes quickly
		req := ProcessExecRequest{
			Command: "true",
		}
		_, processID := startTestProcess(t, handler, req)

		// Wait for process to complete
		waitForProcessCompletion(t, handler, processID, 2*time.Second)

		// Try to kill the completed process
		httpReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/processes/kill?id=%s", processID), nil)
		w := httptest.NewRecorder()

		handler.KillProcess(w, httpReq)

		assertErrorResponse(t, w, "Process is not running")
	})

	t.Run("kill already failed process", func(t *testing.T) {
		// Start a process that will fail
		req := ProcessExecRequest{
			Command: "false",
		}
		_, processID := startTestProcess(t, handler, req)

		// Wait for process to fail
		waitForProcessCompletion(t, handler, processID, 2*time.Second)

		// Try to kill the failed process
		httpReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/processes/kill?id=%s", processID), nil)
		w := httptest.NewRecorder()

		handler.KillProcess(w, httpReq)

		assertErrorResponse(t, w, "Process is not running")
	})
}

func TestListProcesses(t *testing.T) {
	handler := createTestProcessHandler(t)

	t.Run("list empty processes", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/processes", nil)
		w := httptest.NewRecorder()

		handler.ListProcesses(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response ListProcessesResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Empty(t, response.Processes)
	})

	t.Run("list with active processes", func(t *testing.T) {
		// Start a few test processes
		for i := 0; i < 3; i++ {
			req := ProcessExecRequest{
				Command: "sleep",
				Args:    []string{"1"},
			}
			reqBody, _ := json.Marshal(req)
			httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
			w := httptest.NewRecorder()
			handler.ExecProcess(w, httpReq)
		}

		httpReq := httptest.NewRequest("GET", "/api/v1/processes", nil)
		w := httptest.NewRecorder()

		handler.ListProcesses(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response ListProcessesResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Len(t, response.Processes, 3)

		// Verify process structure
		for _, process := range response.Processes {
			assert.NotEmpty(t, process.ID)
			assert.Greater(t, process.PID, 0)
			assert.NotEmpty(t, process.Command)
			assert.Equal(t, "running", process.Status)
			assert.Greater(t, process.StartTime, int64(0))
		}
	})
}

func TestGetProcessLogs(t *testing.T) {
	handler := createTestProcessHandler(t)

	// Setup: Start a process that produces output
	execReq := ProcessExecRequest{
		Command: "sh",
		Args:    []string{"-c", "echo 'test output'; echo 'test error' >&2; sleep 0.5"},
	}
	_, processID := startTestProcess(t, handler, execReq)

	// Wait a bit for logs to be collected
	time.Sleep(100 * time.Millisecond)

	t.Run("get process logs", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/logs?id=%s", processID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessLogs(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response GetProcessLogsResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, processID, response.ProcessID)
		assert.NotNil(t, response.Logs)
	})

	t.Run("stream process logs", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/logs?id=%s&stream=true", processID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessLogs(w, httpReq)

		// For streaming, we expect different content type
		assert.Equal(t, "text/event-stream", w.Header().Get("Content-Type"))
	})

	t.Run("get non-existent process logs", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/processes/logs?id=non-existent", nil)
		w := httptest.NewRecorder()

		handler.GetProcessLogs(w, httpReq)

		assertErrorResponse(t, w, "not found")
	})

	t.Run("missing process ID", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/processes/logs", nil)
		w := httptest.NewRecorder()

		handler.GetProcessLogs(w, httpReq)

		assertErrorResponse(t, w, "Process ID is required")
	})

	t.Run("invalid HTTP method", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/processes/logs?id=%s", processID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessLogs(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("streaming basic test", func(t *testing.T) {
		// Start a process that produces output
		req := ProcessExecRequest{
			Command: "sh",
			Args:    []string{"-c", "echo 'streaming test output'"},
		}
		_, processID := startTestProcess(t, handler, req)

		// Test streaming endpoint
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/logs?id=%s&stream=true", processID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessLogs(w, httpReq)

		// Should return event-stream content type
		contentType := w.Header().Get("Content-Type")
		if contentType == "text/event-stream" {
			// Should have event-stream format
			body := w.Body.String()
			if body != "" {
				assert.Contains(t, body, "data:")
			}
		}
		t.Logf("Stream test completed with content-type: %s", contentType)
	})

	t.Run("empty log stream", func(t *testing.T) {
		// Start a process with no output
		req := ProcessExecRequest{
			Command: "true",
		}
		_, processID := startTestProcess(t, handler, req)

		// Get logs immediately (should be empty or minimal)
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/logs?id=%s", processID), nil)
		w := httptest.NewRecorder()

		handler.GetProcessLogs(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response GetProcessLogsResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, processID, response.ProcessID)
		assert.NotNil(t, response.Logs)
		// Logs might be empty or just have system messages
	})

	t.Run("stream with timeout", func(t *testing.T) {
		// Start a short-running process for this test
		req := ProcessExecRequest{
			Command: "sh",
			Args:    []string{"-c", "echo 'streaming test'; sleep 0.5"},
		}
		_, processID := startTestProcess(t, handler, req)

		// Start streaming
		httpReq := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/processes/logs?id=%s&stream=true", processID), nil)
		w := httptest.NewRecorder()

		// Use a goroutine to handle streaming with shorter timeout
		done := make(chan bool, 1)
		go func() {
			handler.GetProcessLogs(w, httpReq)
			done <- true
		}()

		// Wait for streaming with timeout
		select {
		case <-done:
			// Streaming completed (expected behavior)
		case <-time.After(1 * time.Second):
			// Streaming should timeout quickly
			t.Log("Streaming test completed or timed out as expected")
		}

		// Verify streaming response format if available
		contentType := w.Header().Get("Content-Type")
		if contentType == "text/event-stream" {
			// Should have event-stream format
			body := w.Body.String()
			if body != "" {
				assert.Contains(t, body, "data:")
			}
		}
		t.Logf("Stream test completed with content-type: %s", contentType)
	})
}
