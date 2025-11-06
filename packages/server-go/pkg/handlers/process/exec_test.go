package process

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewProcessHandler(t *testing.T) {
	t.Run("successful handler creation", func(t *testing.T) {
		handler := NewProcessHandler()

		assert.NotNil(t, handler, "handler should not be nil")
		assert.NotNil(t, handler.processes, "processes map should be initialized")
		assert.Empty(t, handler.processes, "processes map should be empty")
	})
}

func TestExecProcess(t *testing.T) {
	handler := createTestProcessHandler(t)

	t.Run("successful simple command execution", func(t *testing.T) {
		req := ProcessExecRequest{
			Command: "echo",
			Args:    []string{"hello", "world"},
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response ProcessExecResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Greater(t, response.PID, 0, "PID should be positive")
		assert.Equal(t, "running", response.Status)
	})

	t.Run("command without args (string parsing)", func(t *testing.T) {
		req := ProcessExecRequest{
			Command: "echo hello world",
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response ProcessExecResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Greater(t, response.PID, 0)
		assert.Equal(t, "running", response.Status)
	})

	t.Run("command with working directory", func(t *testing.T) {
		testDir := t.TempDir()
		req := ProcessExecRequest{
			Command: "pwd",
			Cwd:     &testDir,
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response ProcessExecResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Greater(t, response.PID, 0)
	})

	t.Run("command with environment variables", func(t *testing.T) {
		req := ProcessExecRequest{
			Command: "sh",
			Args:    []string{"-c", "echo $TEST_VAR"},
			Env: map[string]string{
				"TEST_VAR": "test_value",
			},
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response ProcessExecResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Greater(t, response.PID, 0)
	})

	t.Run("complex environment variables", func(t *testing.T) {
		req := ProcessExecRequest{
			Command: "sh",
			Args:    []string{"-c", "echo \"$VAR1\" \"$VAR2\" \"$VAR3\""},
			Env: map[string]string{
				"VAR1": "value with spaces",
				"VAR2": "value=with=equals",
				"VAR3": "value\nwith\nnewlines",
				"VAR4": "special!@#$%^&*()chars",
				"VAR5": "unicode_world_🌍",
			},
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response ProcessExecResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Greater(t, response.PID, 0)
		assert.Equal(t, "running", response.Status)
	})

	t.Run("shell parameter with custom shell", func(t *testing.T) {
		customShell := "/bin/sh"
		req := ProcessExecRequest{
			Command: "echo $0",
			Shell:   &customShell,
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response ProcessExecResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Greater(t, response.PID, 0)
	})

	t.Run("invalid HTTP method", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/processes/exec", nil)
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("invalid JSON request", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", strings.NewReader("invalid json"))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		assertErrorResponse(t, w, "Invalid request body")
	})

	t.Run("missing command", func(t *testing.T) {
		req := ProcessExecRequest{
			Args: []string{"arg1"},
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		assertErrorResponse(t, w, "Command is required")
	})

	t.Run("non-existent command", func(t *testing.T) {
		req := ProcessExecRequest{
			Command: "nonexistent-command-12345",
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		assertErrorResponse(t, w, "Failed to start process")
	})

	t.Run("empty command in args", func(t *testing.T) {
		req := ProcessExecRequest{
			Command: "",
			Args:    []string{"echo", "test"},
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		assertErrorResponse(t, w, "Command is required")
	})

	t.Run("invalid working directory", func(t *testing.T) {
		invalidDir := "/nonexistent/directory/path"
		req := ProcessExecRequest{
			Command: "echo",
			Args:    []string{"test"},
			Cwd:     &invalidDir,
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		assertErrorResponse(t, w, "Failed to start process")
	})
}
