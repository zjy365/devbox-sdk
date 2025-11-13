package common

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

func TestStatusString(t *testing.T) {
	tests := []struct {
		name     string
		status   Status
		expected string
	}{
		{"success status", StatusSuccess, "success"},
		{"panic status", StatusPanic, "panic"},
		{"validation error", StatusValidationError, "validation_error"},
		{"not found", StatusNotFound, "not_found"},
		{"internal error", StatusInternalError, "internal_error"},
		{"unauthorized", StatusUnauthorized, "unauthorized"},
		{"forbidden", StatusForbidden, "forbidden"},
		{"invalid request", StatusInvalidRequest, "invalid_request"},
		{"conflict", StatusConflict, "conflict"},
		{"operation error", StatusOperationError, "operation_error"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.status.String()
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestResponseIsSuccess(t *testing.T) {
	t.Run("success status returns true", func(t *testing.T) {
		resp := &Response[struct{}]{Status: StatusSuccess}
		assert.True(t, resp.IsSuccess())
	})

	t.Run("error status returns false", func(t *testing.T) {
		resp := &Response[struct{}]{Status: StatusInternalError}
		assert.False(t, resp.IsSuccess())
	})
}

func TestWriteJSONResponse(t *testing.T) {
	t.Run("successful JSON response", func(t *testing.T) {
		data := map[string]any{
			"key": "value",
		}

		w := httptest.NewRecorder()
		WriteJSONResponse(w, StatusSuccess, "test message", data)

		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response Response[map[string]any]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, StatusSuccess, response.Status)
		assert.Equal(t, "test message", response.Message)
	})

	t.Run("response with nil data", func(t *testing.T) {
		w := httptest.NewRecorder()
		WriteJSONResponse(w, StatusSuccess, "no data", struct{}{})

		var response Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, StatusSuccess, response.Status)
		assert.Equal(t, "no data", response.Message)
	})

	t.Run("response with empty message", func(t *testing.T) {
		w := httptest.NewRecorder()
		WriteJSONResponse(w, StatusSuccess, "", map[string]any{"result": "ok"})

		var response Response[map[string]any]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, StatusSuccess, response.Status)
	})

	t.Run("JSON encoding error with invalid data", func(t *testing.T) {
		invalidData := map[string]any{
			"channel": make(chan int),
		}

		w := httptest.NewRecorder()
		WriteJSONResponse(w, StatusSuccess, "test", invalidData)

		assert.Contains(t, w.Body.String(), "json: unsupported type")
	})
}

func TestWriteSuccessResponse(t *testing.T) {
	t.Run("writes empty success response", func(t *testing.T) {
		w := httptest.NewRecorder()
		WriteSuccessResponse(w, struct{}{})

		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, StatusSuccess, response.Status)
		assert.Equal(t, "success", response.Message)
		assert.True(t, response.IsSuccess())
	})

	type testStruct struct {
		Data string `json:"data"`
	}
	t.Run("writes data success response", func(t *testing.T) {
		w := httptest.NewRecorder()
		// use a generic map as the response payload so it satisfies the ResponseData constraint
		dataMap := map[string]any{
			"data": "testdata",
		}
		WriteSuccessResponse(w, dataMap)

		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response Response[testStruct]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, StatusSuccess, response.Status)
		assert.Equal(t, "success", response.Message)
		assert.True(t, response.IsSuccess())
		assert.NotNil(t, response.Data)
	})
}

func TestParseJSONBodyReturn(t *testing.T) {
	type testStruct struct {
		Name  string `json:"name"`
		Value int    `json:"value"`
	}

	t.Run("parse valid JSON body", func(t *testing.T) {
		data := testStruct{Name: "test", Value: 42}
		jsonData, err := json.Marshal(data)
		require.NoError(t, err)

		req := httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(jsonData))
		w := httptest.NewRecorder()

		var result testStruct
		err = ParseJSONBodyReturn(w, req, &result)

		assert.NoError(t, err)
		assert.Equal(t, "test", result.Name)
		assert.Equal(t, 42, result.Value)
	})

	t.Run("parse invalid JSON body", func(t *testing.T) {
		invalidJSON := []byte(`{"name": "test", "value": }`)
		req := httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(invalidJSON))
		w := httptest.NewRecorder()

		var result testStruct
		err := ParseJSONBodyReturn(w, req, &result)

		assert.Error(t, err)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response Response[map[string]any]
		decodeErr := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, decodeErr)
		assert.Equal(t, StatusInvalidRequest, response.Status)
		assert.Equal(t, "Invalid JSON body", response.Message)
	})

	t.Run("parse JSON with unknown fields", func(t *testing.T) {
		jsonWithExtra := []byte(`{"name": "test", "value": 42, "extra": "field"}`)
		req := httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(jsonWithExtra))
		w := httptest.NewRecorder()

		var result testStruct
		err := ParseJSONBodyReturn(w, req, &result)

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "unknown field")

		var response Response[map[string]any]
		decodeErr := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, decodeErr)
		assert.Equal(t, StatusInvalidRequest, response.Status)
	})

	t.Run("parse empty body", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(""))
		w := httptest.NewRecorder()

		var result testStruct
		err := ParseJSONBodyReturn(w, req, &result)

		assert.Error(t, err)

		var response Response[map[string]any]
		decodeErr := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, decodeErr)
		assert.Equal(t, StatusInvalidRequest, response.Status)
	})

	t.Run("parse JSON with wrong types", func(t *testing.T) {
		wrongTypeJSON := []byte(`{"name": "test", "value": "not a number"}`)
		req := httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(wrongTypeJSON))
		w := httptest.NewRecorder()

		var result testStruct
		err := ParseJSONBodyReturn(w, req, &result)

		assert.Error(t, err)

		var response Response[map[string]any]
		decodeErr := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, decodeErr)
		assert.Equal(t, StatusInvalidRequest, response.Status)
	})
}
