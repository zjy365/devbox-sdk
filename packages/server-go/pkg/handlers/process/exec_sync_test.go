package process

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExecProcessSync(t *testing.T) {
	handler := createTestProcessHandler(t)

	t.Run("successful simple command execution", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"hello", "world"},
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status, "Status should be success")
		assert.Equal(t, "hello world\n", response.Data.Stdout, "Stdout should contain command output")
		assert.Equal(t, "", response.Data.Stderr, "Stderr should be empty for successful command")
		assert.NotNil(t, response.Data.ExitCode, "ExitCode should not be nil")
		assert.Equal(t, 0, *response.Data.ExitCode, "Exit code should be 0 for successful command")
		assert.Greater(t, response.Data.DurationMS, int64(0), "Duration should be positive")
		assert.Greater(t, response.Data.StartTime, int64(0), "StartTime should be set")
		assert.GreaterOrEqual(t, response.Data.EndTime, response.Data.StartTime, "EndTime should be greater than or equal to StartTime")
	})

	t.Run("command without args (string parsing)", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "echo hello world",
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, "hello world\n", response.Data.Stdout)
		assert.Equal(t, 0, *response.Data.ExitCode)
	})

	t.Run("command with single word", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "pwd",
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Contains(t, response.Data.Stdout, "packages/server-go", "Should contain current directory")
		assert.Equal(t, 0, *response.Data.ExitCode)
	})

	t.Run("command with working directory", func(t *testing.T) {
		testDir := t.TempDir()
		req := SyncExecutionRequest{
			Command: "pwd",
			Cwd:     &testDir,
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, testDir+"\n", response.Data.Stdout, "Should show specified working directory")
		assert.Equal(t, 0, *response.Data.ExitCode)
	})

	t.Run("command with environment variables", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "sh",
			Args:    []string{"-c", "echo $TEST_VAR"},
			Env: map[string]string{
				"TEST_VAR": "test_value",
			},
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, "test_value\n", response.Data.Stdout)
		assert.Equal(t, 0, *response.Data.ExitCode)
	})

	t.Run("complex environment variables", func(t *testing.T) {
		req := SyncExecutionRequest{
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
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Contains(t, response.Data.Stdout, "value with spaces")
		assert.Contains(t, response.Data.Stdout, "value=with=equals")
		assert.Equal(t, 0, *response.Data.ExitCode)
	})

	t.Run("command that outputs to stderr", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "sh",
			Args:    []string{"-c", "echo 'error message' >&2"},
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, "error message\n", response.Data.Stderr, "Stderr should contain error message")
		assert.Equal(t, "", response.Data.Stdout, "Stdout should be empty")
		assert.Equal(t, 0, *response.Data.ExitCode, "Exit code should be 0")
	})

	t.Run("command that exits with non-zero code", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "sh",
			Args:    []string{"-c", "exit 42"},
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status, "Response should still be successful")
		assert.NotNil(t, response.Data.ExitCode, "ExitCode should not be nil")
		assert.Equal(t, 42, *response.Data.ExitCode, "Exit code should be 42")
	})

	t.Run("custom timeout", func(t *testing.T) {
		timeout := 5
		req := SyncExecutionRequest{
			Command: "sh",
			Args:    []string{"-c", "echo 'quick command'"},
			Timeout: &timeout,
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, "quick command\n", response.Data.Stdout)
		assert.Less(t, response.Data.DurationMS, int64(5000), "Duration should be less than timeout")
	})

	t.Run("timeout exceeded", func(t *testing.T) {
		timeout := 1
		req := SyncExecutionRequest{
			Command: "sh",
			Args:    []string{"-c", "sleep 3"},
			Timeout: &timeout,
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		start := time.Now()
		handler.ExecProcessSync(w, httpReq)
		elapsed := time.Since(start)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusOperationError, response.Status, "Status should indicate operation error")
		assert.Contains(t, response.Message, "execution timeout after 1 seconds", "Message should indicate timeout")
		assert.Greater(t, response.Data.DurationMS, int64(1000), "Duration should be at least timeout duration")
		assert.Less(t, elapsed, 4*time.Second, "Total request time should be less than actual command time due to timeout")
	})

	t.Run("zero timeout (should use default)", func(t *testing.T) {
		timeout := 0
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"test"},
			Timeout: &timeout,
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, "test\n", response.Data.Stdout)
	})

	t.Run("negative timeout (should use default)", func(t *testing.T) {
		timeout := -5
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"test"},
			Timeout: &timeout,
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, "test\n", response.Data.Stdout)
	})

	t.Run("invalid JSON request", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", strings.NewReader("invalid json"))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assertErrorResponse(t, w, "Invalid JSON body")
	})

	t.Run("missing command", func(t *testing.T) {
		req := SyncExecutionRequest{
			Args: []string{"arg1"},
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assertErrorResponse(t, w, "Command is required")
	})

	t.Run("empty command string", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "",
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assertErrorResponse(t, w, "Command is required")
	})

	t.Run("non-existent command", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "nonexistent-command-12345",
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusOperationError, response.Status)
		assert.NotNil(t, response.Data.ExitCode)
		assert.Equal(t, 127, *response.Data.ExitCode, "Exit code should be 127 for command not found")
		assert.Contains(t, response.Data.Stderr, "nonexistent-command-12345")
	})

	t.Run("invalid working directory", func(t *testing.T) {
		invalidDir := "/nonexistent/directory/path"
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"test"},
			Cwd:     &invalidDir,
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusOperationError, response.Status)
		assert.NotNil(t, response.Data.ExitCode)
		assert.Equal(t, 127, *response.Data.ExitCode, "Exit code should be 127 for failed start")
		assert.Contains(t, response.Data.Stderr, "nonexistent")
	})

	t.Run("shell parameter (should be ignored for now)", func(t *testing.T) {
		customShell := "/bin/sh"
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"shell test"},
			Shell:   &customShell,
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, "shell test\n", response.Data.Stdout)
	})

	t.Run("large output", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "sh",
			Args:    []string{"-c", "for i in $(seq 1 1000); do echo \"Line $i with some content\"; done"},
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Contains(t, response.Data.Stdout, "Line 1", "Should contain first line")
		assert.Contains(t, response.Data.Stdout, "Line 1000", "Should contain last line")
		assert.Greater(t, len(response.Data.Stdout), 10000, "Output should be substantial")
		assert.Equal(t, 0, *response.Data.ExitCode)
	})

	t.Run("command with unicode output", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"Hello 世界 🌍"},
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SyncExecutionResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, "Hello 世界 🌍\n", response.Data.Stdout)
		assert.Equal(t, 0, *response.Data.ExitCode)
	})
}

func TestBuildCommand(t *testing.T) {
	handler := NewProcessHandler()

	t.Run("command with args", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"hello", "world"},
		}
		cmd := handler.buildCommand(req)

		assert.True(t, cmd.Path == "echo" || cmd.Path == "/usr/bin/echo", "Path should be echo or full path to echo")
		assert.Equal(t, []string{"echo", "hello", "world"}, cmd.Args)
	})

	t.Run("command string parsing", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "echo hello world",
		}
		cmd := handler.buildCommand(req)

		assert.True(t, cmd.Path == "echo" || cmd.Path == "/usr/bin/echo")
		assert.Equal(t, []string{"echo", "hello", "world"}, cmd.Args)
	})

	t.Run("working directory and environment", func(t *testing.T) {
		testDir := "/tmp"
		req := SyncExecutionRequest{
			Command: "pwd",
			Cwd:     &testDir,
			Env: map[string]string{
				"TEST_VAR": "test_value",
			},
		}
		cmd := handler.buildCommand(req)

		assert.Equal(t, testDir, cmd.Dir)
		assert.Contains(t, cmd.Env, "TEST_VAR=test_value")
	})
}
