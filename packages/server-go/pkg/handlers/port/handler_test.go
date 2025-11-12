package port

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewPortHandler(t *testing.T) {
	handler := NewPortHandler()

	if handler == nil {
		t.Fatal("handler should not be nil")
	}

	if handler.monitor == nil {
		t.Error("handler should have an internal port monitor")
	}
}

func TestPortHandler_GetPorts(t *testing.T) {
	handler := NewPortHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ports", nil)
	w := httptest.NewRecorder()

	handler.GetPorts(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	if contentType := resp.Header.Get("Content-Type"); contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", contentType)
	}

	var response PortsResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !response.Success {
		t.Error("expected success to be true")
	}

	if response.Ports == nil {
		t.Error("ports should not be nil")
	}

	if response.LastUpdatedAt == 0 {
		t.Error("lastUpdatedAt should not be zero")
	}
}

func TestPortHandler_GetPorts_WithData(t *testing.T) {
	handler := NewPortHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ports", nil)
	w := httptest.NewRecorder()

	handler.GetPorts(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	var response PortsResponse
	json.NewDecoder(resp.Body).Decode(&response)

	if response.LastUpdatedAt == 0 {
		t.Error("lastUpdatedAt should be set after refresh")
	}

	for _, port := range response.Ports {
		if port < 1 || port > 65535 {
			t.Errorf("invalid port number: %d", port)
		}
	}
}

func TestPortHandler_ResponseStructure(t *testing.T) {

	handler := NewPortHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ports", nil)
	w := httptest.NewRecorder()

	handler.GetPorts(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	var response map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if _, ok := response["success"]; !ok {
		t.Error("response should contain 'success' field")
	}

	if _, ok := response["ports"]; !ok {
		t.Error("response should contain 'ports' field")
	}

	if _, ok := response["lastUpdatedAt"]; !ok {
		t.Error("response should contain 'lastUpdatedAt' field")
	}

	if _, ok := response["count"]; ok {
		t.Error("response should NOT contain 'count' field")
	}
}

func TestPortHandler_MultipleRequests(t *testing.T) {

	handler := NewPortHandler()

	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/ports", nil)
		w := httptest.NewRecorder()

		handler.GetPorts(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Errorf("request %d: expected status 200, got %d", i, resp.StatusCode)
		}

		var response PortsResponse
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			t.Errorf("request %d: failed to decode response: %v", i, err)
		}

		if !response.Success {
			t.Errorf("request %d: expected success to be true", i)
		}
	}
}
