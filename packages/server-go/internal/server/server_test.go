package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labring/devbox-sdk-server/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewWithValidConfig(t *testing.T) {
	cfg := &config.Config{
		Addr:     ":9757",
		Token:    "test-token-123",
		LogLevel: slog.LevelInfo,
	}

	srv, err := New(cfg)
	require.NoError(t, err)
	require.NotNil(t, srv)
	assert.NotNil(t, srv.router)
	assert.Equal(t, cfg, srv.config)
}

func TestServer_ServeHTTP_AuthAndHealth(t *testing.T) {
	cfg := &config.Config{Addr: ":9757", Token: "test-token", LogLevel: slog.LevelInfo}
	srv, err := New(cfg)
	require.NoError(t, err)

	t.Run("valid health endpoint returns JSON", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/health", nil)
		req.Header.Set("Authorization", "Bearer test-token")
		rr := httptest.NewRecorder()

		srv.ServeHTTP(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))
		traceID := rr.Header().Get("X-Trace-ID")
		assert.NotEmpty(t, traceID, "logger should add trace id header")

		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, "healthy", resp["status"])
	})

	t.Run("missing auth token returns 401", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/health", nil)
		rr := httptest.NewRecorder()
		srv.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusUnauthorized, rr.Code)
	})

	t.Run("invalid auth token returns 401", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/health", nil)
		req.Header.Set("Authorization", "Bearer wrong-token")
		rr := httptest.NewRecorder()
		srv.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusUnauthorized, rr.Code)
	})
}

func TestHealthAndReadinessEndpoints(t *testing.T) {
	cfg := &config.Config{Addr: ":9757", Token: "test-token", LogLevel: slog.LevelInfo}
	srv, err := New(cfg)
	require.NoError(t, err)

	testCases := []struct {
		name string
		path string
	}{
		{"health", "/health"},
		{"readiness", "/health/ready"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tc.path, nil)
			req.Header.Set("Authorization", "Bearer test-token")
			rr := httptest.NewRecorder()

			srv.ServeHTTP(rr, req)
			assert.Equal(t, http.StatusOK, rr.Code)
			assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))

			var resp map[string]interface{}
			require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
			assert.NotEmpty(t, resp["status"])
		})
	}
}

func TestServer_Cleanup(t *testing.T) {
	cfg := &config.Config{Addr: ":9757", Token: "test-token", LogLevel: slog.LevelInfo}
	srv, err := New(cfg)
	require.NoError(t, err)
	assert.NoError(t, srv.Cleanup())
}

func TestRoutesReachableBehavior(t *testing.T) {
	cfg := &config.Config{Addr: ":9757", Token: "test-token", LogLevel: slog.LevelInfo}
	srv, err := New(cfg)
	require.NoError(t, err)

	// Verify that key routes are registered and reachable (not 404/405)
	cases := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{"file write", "POST", "/api/v1/files/write", `{}`},
		{"file read", "POST", "/api/v1/files/read", `{}`},
		{"file delete", "POST", "/api/v1/files/delete", `{}`},
		{"file batch", "POST", "/api/v1/files/batch-upload", `{}`},
		{"file list", "GET", "/api/v1/files/list", ``},
		{"process exec", "POST", "/api/v1/process/exec", `{}`},
		{"process status", "GET", "/api/v1/process/123/status", ``},
		{"process kill", "POST", "/api/v1/process/123/kill", `{}`},
		{"process list", "GET", "/api/v1/process/list", ``},
		{"process logs", "GET", "/api/v1/process/123/logs", ``},
		{"session create", "POST", "/api/v1/sessions/create", `{}`},
		{"session get", "GET", "/api/v1/sessions/123", ``},
		{"sessions list", "GET", "/api/v1/sessions", ``},
		{"session env", "POST", "/api/v1/sessions/123/env", `{}`},
		{"session exec", "POST", "/api/v1/sessions/123/exec", `{}`},
		{"session cd", "POST", "/api/v1/sessions/123/cd", `{}`},
		{"session terminate", "POST", "/api/v1/sessions/123/terminate", `{}`},
		{"session logs", "GET", "/api/v1/sessions/123/logs", ``},
		{"websocket", "GET", "/ws", ``},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var req *http.Request
			if tc.body != "" {
				req = httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
				req.Header.Set("Content-Type", "application/json")
			} else {
				req = httptest.NewRequest(tc.method, tc.path, nil)
			}
			req.Header.Set("Authorization", "Bearer "+cfg.Token)
			rr := httptest.NewRecorder()

			srv.ServeHTTP(rr, req)

			// For 404 responses, check if it's a business logic 404 (JSON) or routing 404 (plain text)
			if rr.Code == http.StatusNotFound {
				contentType := rr.Header().Get("Content-Type")
				// Business logic 404s return JSON, routing 404s return plain text
				if strings.Contains(contentType, "application/json") {
					// This is a business logic 404, which is expected and means the route exists
				} else {
					assert.Fail(t, "route should exist", "Got routing 404 (plain text) instead of business logic 404")
				}
			} else if rr.Code == http.StatusMethodNotAllowed {
				assert.Fail(t, "method should be registered", "Got 405 Method Not Allowed")
			}
		})
	}
}

func BenchmarkServer_ServeHTTP(b *testing.B) {
	cfg := &config.Config{Addr: ":9757", Token: "test-token", LogLevel: slog.LevelInfo}
	srv, err := New(cfg)
	if err != nil {
		b.Fatal(err)
	}

	req := httptest.NewRequest("GET", "/health", nil)
	req.Header.Set("Authorization", "Bearer test-token")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rr := httptest.NewRecorder()
		srv.ServeHTTP(rr, req)
	}
}
