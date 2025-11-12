package common

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResponseError(t *testing.T) {
	t.Run("error response returns formatted error string", func(t *testing.T) {
		resp := &Response[struct{}]{
			Status:  StatusInternalError,
			Message: "test error details",
		}

		errorString := resp.Error()
		assert.Contains(t, errorString, "internal_error")
		assert.Contains(t, errorString, "test error details")
	})

	t.Run("success response returns empty error string", func(t *testing.T) {
		resp := &Response[struct{}]{
			Status:  StatusSuccess,
			Message: "success",
		}

		assert.Empty(t, resp.Error())
	})
}

func TestWriteErrorResponse(t *testing.T) {
	t.Run("write validation error", func(t *testing.T) {
		w := httptest.NewRecorder()
		WriteErrorResponse(w, StatusValidationError, "invalid field: %s", "name")

		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, StatusValidationError, response.Status)
		assert.Equal(t, "invalid field: name", response.Message)
	})

	t.Run("write internal error", func(t *testing.T) {
		w := httptest.NewRecorder()
		WriteErrorResponse(w, StatusInternalError, "server error")

		var response Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, StatusInternalError, response.Status)
		assert.Equal(t, "server error", response.Message)
	})

	t.Run("write not found error", func(t *testing.T) {
		w := httptest.NewRecorder()
		WriteErrorResponse(w, StatusNotFound, "resource not found")

		var response Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, StatusNotFound, response.Status)
	})
}
