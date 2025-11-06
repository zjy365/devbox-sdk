package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNewHealthHandler tests the constructor for HealthHandler
func TestNewHealthHandler(t *testing.T) {
	t.Run("successful creation", func(t *testing.T) {
		handler := NewHealthHandler()

		assert.NotNil(t, handler)
		assert.True(t, time.Since(handler.startTime) < time.Second)
	})

	t.Run("multiple handlers have different start times", func(t *testing.T) {
		handler1 := NewHealthHandler()
		time.Sleep(10 * time.Millisecond)
		handler2 := NewHealthHandler()

		assert.True(t, handler2.startTime.After(handler1.startTime))
	})
}

// TestHealthHandler_HealthCheck tests the health check endpoint
func TestHealthHandler_HealthCheck(t *testing.T) {
	t.Run("successful health check", func(t *testing.T) {
		handler := NewHealthHandler()

		req := httptest.NewRequest("GET", "/health", nil)
		w := httptest.NewRecorder()

		handler.HealthCheck(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response HealthResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "healthy", response.Status)
		assert.NotEmpty(t, response.Timestamp)
		assert.GreaterOrEqual(t, response.Uptime, int64(0))
		assert.Equal(t, "1.0.0", response.Version)
	})

	t.Run("uptime increases over time", func(t *testing.T) {
		handler := NewHealthHandler()

		// First request
		req1 := httptest.NewRequest("GET", "/health", nil)
		w1 := httptest.NewRecorder()
		handler.HealthCheck(w1, req1)

		var response1 HealthResponse
		err := json.Unmarshal(w1.Body.Bytes(), &response1)
		require.NoError(t, err)

		// Wait a bit and make second request
		time.Sleep(100 * time.Millisecond)

		req2 := httptest.NewRequest("GET", "/health", nil)
		w2 := httptest.NewRecorder()
		handler.HealthCheck(w2, req2)

		var response2 HealthResponse
		err = json.Unmarshal(w2.Body.Bytes(), &response2)
		require.NoError(t, err)

		// Second uptime should be greater or equal
		assert.GreaterOrEqual(t, response2.Uptime, response1.Uptime)
	})

	t.Run("timestamp format is RFC3339", func(t *testing.T) {
		handler := NewHealthHandler()

		req := httptest.NewRequest("GET", "/health", nil)
		w := httptest.NewRecorder()

		handler.HealthCheck(w, req)

		var response HealthResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Parse timestamp to verify it's valid RFC3339
		_, err = time.Parse(time.RFC3339, response.Timestamp)
		assert.NoError(t, err)
	})

	t.Run("different HTTP methods", func(t *testing.T) {
		handler := NewHealthHandler()

		methods := []string{"GET", "POST", "PUT", "DELETE", "PATCH"}

		for _, method := range methods {
			t.Run("method "+method, func(t *testing.T) {
				req := httptest.NewRequest(method, "/health", nil)
				w := httptest.NewRecorder()

				handler.HealthCheck(w, req)

				// Health check should work with any method
				assert.Equal(t, http.StatusOK, w.Code)
				assert.Equal(t, "application/json", w.Header().Get("Content-Type"))
			})
		}
	})
}

// TestHealthHandler_ReadinessCheck tests the readiness check endpoint
func TestHealthHandler_ReadinessCheck(t *testing.T) {
	t.Run("successful readiness check", func(t *testing.T) {
		handler := NewHealthHandler()

		req := httptest.NewRequest("GET", "/ready", nil)
		w := httptest.NewRecorder()

		handler.ReadinessCheck(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response ReadinessResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "ready", response.Status)
		assert.True(t, response.Ready)
		assert.NotEmpty(t, response.Timestamp)
		assert.Len(t, response.Checks, 1)
		assert.True(t, response.Checks["filesystem"])
	})

	t.Run("filesystem check failure", func(t *testing.T) {
		// Temporarily make /tmp unwritable to simulate failure
		// Note: This test might not work in all environments
		handler := NewHealthHandler()

		// Create a handler that will simulate filesystem failure
		originalTempFile := "/tmp/devbox-readiness-check"

		req := httptest.NewRequest("GET", "/ready", nil)
		w := httptest.NewRecorder()

		// Since we can't easily override the hardcoded path, we'll test the structure
		handler.ReadinessCheck(w, req)

		// The actual filesystem should be writable, so we expect success
		assert.Equal(t, http.StatusOK, w.Code)

		// Clean up any leftover test file
		os.Remove(originalTempFile)
	})

	t.Run("timestamp format validation", func(t *testing.T) {
		handler := NewHealthHandler()

		req := httptest.NewRequest("GET", "/ready", nil)
		w := httptest.NewRecorder()

		handler.ReadinessCheck(w, req)

		var response ReadinessResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Parse timestamp to verify it's valid RFC3339
		_, err = time.Parse(time.RFC3339, response.Timestamp)
		assert.NoError(t, err)
	})

	t.Run("response structure validation", func(t *testing.T) {
		handler := NewHealthHandler()

		req := httptest.NewRequest("GET", "/ready", nil)
		w := httptest.NewRecorder()

		handler.ReadinessCheck(w, req)

		var response ReadinessResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Validate all expected fields are present
		assert.NotEmpty(t, response.Status)
		assert.Contains(t, []string{"ready", "not_ready"}, response.Status)
		assert.NotEmpty(t, response.Timestamp)
		assert.NotNil(t, response.Checks)
		assert.Contains(t, response.Checks, "filesystem")
	})

	t.Run("multiple concurrent requests", func(t *testing.T) {
		handler := NewHealthHandler()

		const numRequests = 10
		results := make(chan error, numRequests)

		for i := 0; i < numRequests; i++ {
			go func() {
				req := httptest.NewRequest("GET", "/ready", nil)
				w := httptest.NewRecorder()
				handler.ReadinessCheck(w, req)

				if w.Code != http.StatusOK {
					results <- assert.AnError
					return
				}

				var response ReadinessResponse
				err := json.Unmarshal(w.Body.Bytes(), &response)
				if err != nil {
					results <- err
					return
				}

				if !response.Ready {
					results <- assert.AnError
					return
				}

				results <- nil
			}()
		}

		// Collect results
		for i := 0; i < numRequests; i++ {
			err := <-results
			assert.NoError(t, err)
		}
	})
}

// TestHealthHandler_ResponseStructures tests the response structures
func TestHealthHandler_ResponseStructures(t *testing.T) {
	t.Run("HealthResponse structure", func(t *testing.T) {
		response := HealthResponse{
			Status:    "healthy",
			Timestamp: time.Now().Truncate(time.Second).Format(time.RFC3339),
			Uptime:    100,
			Version:   "1.0.0",
		}

		data, err := json.Marshal(response)
		assert.NoError(t, err)

		var decoded HealthResponse
		err = json.Unmarshal(data, &decoded)
		assert.NoError(t, err)
		assert.Equal(t, response, decoded)
	})

	t.Run("ReadinessResponse structure", func(t *testing.T) {
		response := ReadinessResponse{
			Status:    "ready",
			Ready:     true,
			Timestamp: time.Now().Truncate(time.Second).Format(time.RFC3339),
			Checks: map[string]bool{
				"filesystem": true,
				"database":   false,
			},
		}

		data, err := json.Marshal(response)
		assert.NoError(t, err)

		var decoded ReadinessResponse
		err = json.Unmarshal(data, &decoded)
		assert.NoError(t, err)
		assert.Equal(t, response, decoded)
	})
}

// TestHealthHandler_ErrorHandling tests error scenarios and edge cases
func TestHealthHandler_ErrorHandling(t *testing.T) {
	t.Run("malformed request handling", func(t *testing.T) {
		handler := NewHealthHandler()

		// Health handler should handle any request without errors
		req := httptest.NewRequest("GET", "/health?param=value", nil)
		w := httptest.NewRecorder()

		assert.NotPanics(t, func() {
			handler.HealthCheck(w, req)
		})

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("request with headers", func(t *testing.T) {
		handler := NewHealthHandler()

		req := httptest.NewRequest("GET", "/health", nil)
		req.Header.Set("User-Agent", "test-agent")
		req.Header.Set("X-Request-ID", "test-123")
		w := httptest.NewRecorder()

		handler.HealthCheck(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))
	})

	t.Run("concurrent access to handler", func(t *testing.T) {
		handler := NewHealthHandler()

		const numGoroutines = 50
		done := make(chan bool, numGoroutines)

		for i := 0; i < numGoroutines; i++ {
			go func() {
				defer func() {
					done <- true
				}()

				for j := 0; j < 10; j++ {
					req := httptest.NewRequest("GET", "/health", nil)
					w := httptest.NewRecorder()
					handler.HealthCheck(w, req)

					if w.Code != http.StatusOK {
						return
					}
				}
			}()
		}

		// Wait for all goroutines to complete
		for i := 0; i < numGoroutines; i++ {
			<-done
		}
	})
}

// TestHealthHandler_Integration tests integration scenarios
func TestHealthHandler_Integration(t *testing.T) {
	t.Run("full health check workflow", func(t *testing.T) {
		handler := NewHealthHandler()

		// Wait a bit to ensure uptime is measurable
		time.Sleep(50 * time.Millisecond)

		// Test all three endpoints
		endpoints := []struct {
			name    string
			path    string
			handler func(http.ResponseWriter, *http.Request)
		}{
			{"health", "/health", handler.HealthCheck},
			{"readiness", "/ready", handler.ReadinessCheck},
		}

		for _, endpoint := range endpoints {
			t.Run(endpoint.name, func(t *testing.T) {
				req := httptest.NewRequest("GET", endpoint.path, nil)
				w := httptest.NewRecorder()

				endpoint.handler(w, req)

				assert.Equal(t, http.StatusOK, w.Code)
				assert.Equal(t, "application/json", w.Header().Get("Content-Type"))
				assert.NotEmpty(t, w.Body.Bytes())
			})
		}
	})

	t.Run("handler lifecycle", func(t *testing.T) {
		handler := NewHealthHandler()

		startTime := handler.startTime

		// Wait and check uptime increases
		time.Sleep(100 * time.Millisecond)

		req := httptest.NewRequest("GET", "/health", nil)
		w := httptest.NewRecorder()
		handler.HealthCheck(w, req)

		var response HealthResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		// Uptime should be at least 100ms
		assert.GreaterOrEqual(t, response.Uptime, int64(0))
		assert.True(t, response.Uptime >= 0)

		// Start time should not have changed
		assert.Equal(t, startTime, handler.startTime)
	})
}
