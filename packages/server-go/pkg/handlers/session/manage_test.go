package session

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/labring/devbox-sdk-server/pkg/router"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetSession(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("get existing session", func(t *testing.T) {
		req := CreateSessionRequest{
			Env: map[string]string{"TEST": "value"},
		}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/"+sessionID, nil)
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("GET", "/api/v1/sessions/:id", handler.GetSession)
		r.ServeHTTP(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[SessionInfoResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, sessionID, response.Data.SessionID)
		assert.Equal(t, "/bin/bash", response.Data.Shell)
		assert.Equal(t, "active", response.Data.SessionStatus)
		assert.Equal(t, "value", response.Data.Env["TEST"])
	})

	t.Run("get non-existent session", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions/non-existent", nil)
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("GET", "/api/v1/sessions/:id", handler.GetSession)
		r.ServeHTTP(w, httpReq)
		assertErrorResponse(t, w, "not found")
	})

	t.Run("missing session ID", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/sessions", nil)
		w := httptest.NewRecorder()
		handler.GetSession(w, httpReq)
		assertErrorResponse(t, w, "session id parameter is required")
	})
}

func TestUpdateSessionEnv(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("update session environment variables", func(t *testing.T) {
		req := CreateSessionRequest{
			Env: map[string]string{"INITIAL": "value"},
		}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		updateReq := UpdateSessionEnvRequest{
			Env: map[string]string{
				"NEW_VAR":  "new_value",
				"MODIFIED": "updated_value",
			},
		}

		reqBody, _ := json.Marshal(updateReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/"+sessionID+"/env", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("POST", "/api/v1/sessions/:id/env", handler.UpdateSessionEnv)
		r.ServeHTTP(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		httpReq = httptest.NewRequest("GET", "/api/v1/sessions/"+sessionID, nil)
		w = httptest.NewRecorder()
		r = router.NewRouter()
		r.Register("GET", "/api/v1/sessions/:id", handler.GetSession)
		r.ServeHTTP(w, httpReq)

		var sessionResponse common.Response[SessionInfoResponse]
		err := json.Unmarshal(w.Body.Bytes(), &sessionResponse)
		require.NoError(t, err)

		assert.Equal(t, "new_value", sessionResponse.Data.Env["NEW_VAR"])
		assert.Equal(t, "updated_value", sessionResponse.Data.Env["MODIFIED"])
		assert.Equal(t, "value", sessionResponse.Data.Env["INITIAL"])
	})

	t.Run("update non-existent session", func(t *testing.T) {
		updateReq := UpdateSessionEnvRequest{
			Env: map[string]string{"TEST": "value"},
		}

		reqBody, _ := json.Marshal(updateReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/non-existent/env", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("POST", "/api/v1/sessions/:id/env", handler.UpdateSessionEnv)
		r.ServeHTTP(w, httpReq)
		assertErrorResponse(t, w, "not found")
	})

	t.Run("invalid JSON request", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/test/env", strings.NewReader("invalid json"))
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("POST", "/api/v1/sessions/:id/env", handler.UpdateSessionEnv)
		r.ServeHTTP(w, httpReq)
		assertErrorResponse(t, w, "Invalid JSON body")
	})
}

func TestSessionExec(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("execute command in session", func(t *testing.T) {
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		execReq := SessionExecRequest{
			Command: "echo 'test output'",
		}

		reqBody, _ := json.Marshal(execReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/"+sessionID+"/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("POST", "/api/v1/sessions/:id/exec", handler.SessionExec)
		r.ServeHTTP(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response SessionExecResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, 0, response.ExitCode)
	})

	t.Run("execute command in non-existent session", func(t *testing.T) {
		execReq := SessionExecRequest{
			Command: "echo test",
		}

		reqBody, _ := json.Marshal(execReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/non-existent/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("POST", "/api/v1/sessions/:id/exec", handler.SessionExec)
		r.ServeHTTP(w, httpReq)
		assertErrorResponse(t, w, "not found")
	})

	t.Run("execute empty command", func(t *testing.T) {
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		execReq := SessionExecRequest{
			Command: "",
		}

		reqBody, _ := json.Marshal(execReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/"+sessionID+"/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("POST", "/api/v1/sessions/:id/exec", handler.SessionExec)
		r.ServeHTTP(w, httpReq)
		assertErrorResponse(t, w, "Command is required")
	})
}

func TestSessionCd(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("change working directory", func(t *testing.T) {
		tempDir := createTempWorkingDir(t)
		req := CreateSessionRequest{
			WorkingDir: &tempDir,
		}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		subDir := filepath.Join(tempDir, "subdir")
		err := os.Mkdir(subDir, 0755)
		require.NoError(t, err)

		cdReq := SessionCdRequest{
			Path: "subdir",
		}

		reqBody, _ := json.Marshal(cdReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/"+sessionID+"/cd", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("POST", "/api/v1/sessions/:id/cd", handler.SessionCd)
		r.ServeHTTP(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		httpReq = httptest.NewRequest("GET", "/api/v1/sessions/"+sessionID, nil)
		w = httptest.NewRecorder()
		r = router.NewRouter()
		r.Register("GET", "/api/v1/sessions/:id", handler.GetSession)
		r.ServeHTTP(w, httpReq)

		var response common.Response[SessionInfoResponse]
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, subDir, response.Data.Cwd)
	})

	t.Run("change to absolute path", func(t *testing.T) {
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		tempDir := createTempWorkingDir(t)
		cdReq := SessionCdRequest{
			Path: tempDir,
		}

		reqBody, _ := json.Marshal(cdReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/"+sessionID+"/cd", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("POST", "/api/v1/sessions/:id/cd", handler.SessionCd)
		r.ServeHTTP(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("change directory in non-existent session", func(t *testing.T) {
		cdReq := SessionCdRequest{
			Path: "/tmp",
		}

		reqBody, _ := json.Marshal(cdReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/non-existent/cd", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()
		r := router.NewRouter()
		r.Register("POST", "/api/v1/sessions/:id/cd", handler.SessionCd)
		r.ServeHTTP(w, httpReq)
		assertErrorResponse(t, w, "Session not found")
	})

	t.Run("change to non-existent directory", func(t *testing.T) {
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		cdReq := SessionCdRequest{
			Path: "/nonexistent/directory/path",
		}

		reqBody, _ := json.Marshal(cdReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/sessions/"+sessionID+"/cd", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.SessionCd(w, httpReq)

		assertErrorResponse(t, w, "Directory not found")
	})
}
