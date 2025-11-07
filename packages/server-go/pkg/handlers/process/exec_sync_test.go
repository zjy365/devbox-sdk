package process

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success, "Response should be successful")
		assert.Equal(t, "hello world\n", response.Stdout, "Stdout should contain command output")
		assert.Equal(t, "", response.Stderr, "Stderr should be empty for successful command")
		assert.NotNil(t, response.ExitCode, "ExitCode should not be nil")
		assert.Equal(t, 0, *response.ExitCode, "Exit code should be 0 for successful command")
		assert.Greater(t, response.DurationMS, int64(0), "Duration should be positive")
		assert.Greater(t, response.StartTime, int64(0), "StartTime should be set")
		assert.GreaterOrEqual(t, response.EndTime, response.StartTime, "EndTime should be greater than or equal to StartTime")
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, "hello world\n", response.Stdout)
		assert.Equal(t, 0, *response.ExitCode)
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Contains(t, response.Stdout, "packages/server-go", "Should contain current directory")
		assert.Equal(t, 0, *response.ExitCode)
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, testDir+"\n", response.Stdout, "Should show specified working directory")
		assert.Equal(t, 0, *response.ExitCode)
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, "test_value\n", response.Stdout)
		assert.Equal(t, 0, *response.ExitCode)
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Contains(t, response.Stdout, "value with spaces")
		assert.Contains(t, response.Stdout, "value=with=equals")
		assert.Equal(t, 0, *response.ExitCode)
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, "error message\n", response.Stderr, "Stderr should contain error message")
		assert.Equal(t, "", response.Stdout, "Stdout should be empty")
		assert.Equal(t, 0, *response.ExitCode, "Exit code should be 0")
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success, "Response should still be successful")
		assert.NotNil(t, response.ExitCode, "ExitCode should not be nil")
		assert.Equal(t, 42, *response.ExitCode, "Exit code should be 42")
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, "quick command\n", response.Stdout)
		assert.Less(t, response.DurationMS, int64(5000), "Duration should be less than timeout")
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.False(t, response.Success, "Response should not be successful due to timeout")
		assert.Contains(t, response.Error, "execution timeout after 1 seconds", "Error should indicate timeout")
		assert.Greater(t, response.DurationMS, int64(1000), "Duration should be at least timeout duration")
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, "test\n", response.Stdout)
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, "test\n", response.Stdout)
	})

	t.Run("invalid JSON request", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", strings.NewReader("invalid json"))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assertErrorResponse(t, w, "Invalid request body")
	})

	t.Run("missing command", func(t *testing.T) {
		req := SyncExecutionRequest{
			Args: []string{"arg1"},
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec-sync", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcessSync(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
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

		assert.Equal(t, http.StatusBadRequest, w.Code)
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

		assert.Equal(t, http.StatusInternalServerError, w.Code)
		assertErrorResponse(t, w, "Failed to start process")
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

		assert.Equal(t, http.StatusInternalServerError, w.Code)
		assertErrorResponse(t, w, "Failed to start process")
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, "shell test\n", response.Stdout)
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Contains(t, response.Stdout, "Line 1", "Should contain first line")
		assert.Contains(t, response.Stdout, "Line 1000", "Should contain last line")
		assert.Greater(t, len(response.Stdout), 10000, "Output should be substantial")
		assert.Equal(t, 0, *response.ExitCode)
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

		var response SyncExecutionResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, "Hello 世界 🌍\n", response.Stdout)
		assert.Equal(t, 0, *response.ExitCode)
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

		// Go resolves the full path for system commands
		assert.True(t, cmd.Path == "echo" || cmd.Path == "/usr/bin/echo", "Path should be echo or full path to echo")
		assert.Equal(t, []string{"echo", "hello", "world"}, cmd.Args)
	})

	t.Run("command without args - single word", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "pwd",
		}
		cmd := handler.buildCommand(req)

		// Go resolves the full path for system commands
		assert.True(t, cmd.Path == "pwd" || cmd.Path == "/usr/bin/pwd", "Path should be pwd or full path to pwd")
		assert.Equal(t, []string{"pwd"}, cmd.Args)
	})

	t.Run("command without args - multiple words", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "echo hello world",
		}
		cmd := handler.buildCommand(req)

		// Go resolves the full path for system commands
		assert.True(t, cmd.Path == "echo" || cmd.Path == "/usr/bin/echo", "Path should be echo or full path to echo")
		assert.Equal(t, []string{"echo", "hello", "world"}, cmd.Args)
	})

	t.Run("command with working directory", func(t *testing.T) {
		testDir := "/tmp"
		req := SyncExecutionRequest{
			Command: "pwd",
			Cwd:     &testDir,
		}
		cmd := handler.buildCommand(req)

		assert.Equal(t, testDir, cmd.Dir)
	})

	t.Run("command with empty working directory", func(t *testing.T) {
		emptyDir := ""
		req := SyncExecutionRequest{
			Command: "pwd",
			Cwd:     &emptyDir,
		}
		cmd := handler.buildCommand(req)

		assert.Empty(t, cmd.Dir, "Dir should be empty when Cwd is empty string")
	})

	t.Run("command with environment variables", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"test"},
			Env: map[string]string{
				"TEST_VAR": "test_value",
				"PATH":     "/custom/bin",
			},
		}
		cmd := handler.buildCommand(req)

		assert.NotNil(t, cmd.Env)
		assert.Contains(t, cmd.Env, "TEST_VAR=test_value")
		assert.Contains(t, cmd.Env, "PATH=/custom/bin")

		// Should also include existing environment variables
		foundPATH := false
		for _, env := range cmd.Env {
			if strings.HasPrefix(env, "PATH=") {
				foundPATH = true
				break
			}
		}
		assert.True(t, foundPATH, "Should preserve existing PATH")
	})

	t.Run("command with empty environment variables", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"test"},
			Env:     map[string]string{},
		}
		cmd := handler.buildCommand(req)

		// When Env map is empty, buildCommand doesn't set cmd.Env (len(req.Env) is 0)
		assert.Nil(t, cmd.Env, "Environment should be nil when Env map is empty")
	})

	t.Run("command with nil environment variables", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"test"},
			Env:     nil,
		}
		cmd := handler.buildCommand(req)

		// Should use default environment when Env is nil
		assert.Nil(t, cmd.Env)
	})

	t.Run("command with shell parameter", func(t *testing.T) {
		customShell := "/bin/bash"
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"test"},
			Shell:   &customShell,
		}
		cmd := handler.buildCommand(req)

		// Shell should be ignored for now (see implementation comment)
		// Go resolves the full path for system commands
		assert.True(t, cmd.Path == "echo" || cmd.Path == "/usr/bin/echo", "Path should be echo or full path to echo")
		assert.Equal(t, []string{"echo", "test"}, cmd.Args)
	})

	t.Run("command with empty shell parameter", func(t *testing.T) {
		emptyShell := ""
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"test"},
			Shell:   &emptyShell,
		}
		cmd := handler.buildCommand(req)

		// Go resolves the full path for system commands
		assert.True(t, cmd.Path == "echo" || cmd.Path == "/usr/bin/echo", "Path should be echo or full path to echo")
		assert.Equal(t, []string{"echo", "test"}, cmd.Args)
	})

	t.Run("environment variables with special characters", func(t *testing.T) {
		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"test"},
			Env: map[string]string{
				"SPECIAL_CHARS": "!@#$%^&*()_+-=[]{}|;':\",./<>?",
				"NEWLINES":      "line1\nline2",
				"EQUALS":        "key=value",
			},
		}
		cmd := handler.buildCommand(req)

		assert.Contains(t, cmd.Env, "SPECIAL_CHARS=!@#$%^&*()_+-=[]{}|;':\",./<>?")
		assert.Contains(t, cmd.Env, "NEWLINES=line1\nline2")
		assert.Contains(t, cmd.Env, "EQUALS=key=value")
	})

	t.Run("environment variable override existing", func(t *testing.T) {
		// Set an existing environment variable
		os.Setenv("TEST_OVERRIDE", "original_value")
		defer os.Unsetenv("TEST_OVERRIDE")

		req := SyncExecutionRequest{
			Command: "echo",
			Args:    []string{"test"},
			Env: map[string]string{
				"TEST_OVERRIDE": "new_value",
			},
		}
		cmd := handler.buildCommand(req)

		assert.Contains(t, cmd.Env, "TEST_OVERRIDE=new_value")
	})
}
