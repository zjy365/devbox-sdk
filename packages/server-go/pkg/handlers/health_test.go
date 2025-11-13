package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewHealthHandler(t *testing.T) {
	handler := NewHealthHandler()
	assert.NotNil(t, handler)
	assert.True(t, time.Since(handler.startTime) < time.Second)
}

func TestHealthHandler_HealthCheck(t *testing.T) {
	t.Run("successful health check", func(t *testing.T) {
		handler := NewHealthHandler()

		req := httptest.NewRequest("GET", "/health", nil)
		w := httptest.NewRecorder()

		handler.HealthCheck(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response common.Response[HealthResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.NotEmpty(t, response.Data.Timestamp)
		assert.GreaterOrEqual(t, response.Data.Uptime, int64(0))
		assert.Equal(t, "1.0.0", response.Data.Version)
	})

	t.Run("timestamp format is RFC3339", func(t *testing.T) {
		handler := NewHealthHandler()

		req := httptest.NewRequest("GET", "/health", nil)
		w := httptest.NewRecorder()

		handler.HealthCheck(w, req)

		var response common.Response[HealthResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		_, err = time.Parse(time.RFC3339, response.Data.Timestamp)
		assert.NoError(t, err)
	})
}

func TestHealthHandler_ReadinessCheck(t *testing.T) {
	t.Run("successful readiness check", func(t *testing.T) {
		handler := NewHealthHandler()

		req := httptest.NewRequest("GET", "/ready", nil)
		w := httptest.NewRecorder()

		handler.ReadinessCheck(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response common.Response[ReadinessResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.True(t, response.Data.Ready)
		assert.NotEmpty(t, response.Data.Timestamp)
		assert.Len(t, response.Data.Checks, 1)
		assert.True(t, response.Data.Checks["filesystem"])
	})

	t.Run("timestamp format is RFC3339", func(t *testing.T) {
		handler := NewHealthHandler()

		req := httptest.NewRequest("GET", "/ready", nil)
		w := httptest.NewRecorder()

		handler.ReadinessCheck(w, req)

		var response common.Response[ReadinessResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		_, err = time.Parse(time.RFC3339, response.Data.Timestamp)
		assert.NoError(t, err)
	})
}
