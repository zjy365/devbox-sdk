package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"time"
)

// Minimal health response
type HealthResponse struct {
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
	Uptime    int64  `json:"uptime"`
	Version   string `json:"version"`
}

// Readiness response with minimal checks
type ReadinessResponse struct {
	Status    string          `json:"status"`
	Ready     bool            `json:"ready"`
	Timestamp string          `json:"timestamp"`
	Checks    map[string]bool `json:"checks"`
}

// HealthHandler handles health check operations
type HealthHandler struct {
	startTime time.Time
}

// NewHealthHandler creates a new health handler
func NewHealthHandler() *HealthHandler {
	return &HealthHandler{
		startTime: time.Now(),
	}
}

// HealthCheck returns minimal health information
func (h *HealthHandler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	response := HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now().Truncate(time.Second).Format(time.RFC3339),
		Uptime:    int64(time.Since(h.startTime).Seconds()),
		Version:   "1.0.0",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// ReadinessCheck performs minimal readiness checks
func (h *HealthHandler) ReadinessCheck(w http.ResponseWriter, r *http.Request) {
	ready := true
	checks := make(map[string]bool)

	// Basic filesystem write check
	tempFile := "/tmp/devbox-readiness-check"
	if err := os.WriteFile(tempFile, []byte("ok"), 0644); err != nil {
		checks["filesystem"] = false
		ready = false
	} else {
		_ = os.Remove(tempFile)
		checks["filesystem"] = true
	}

	status := "ready"
	httpStatus := http.StatusOK
	if !ready {
		status = "not_ready"
		httpStatus = http.StatusServiceUnavailable
	}

	response := ReadinessResponse{
		Status:    status,
		Ready:     ready,
		Timestamp: time.Now().Truncate(time.Second).Format(time.RFC3339),
		Checks:    checks,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpStatus)
	json.NewEncoder(w).Encode(response)
}
