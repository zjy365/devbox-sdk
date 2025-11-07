package errors

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAPIError_Error tests the error string formatting
func TestAPIError_Error(t *testing.T) {
	err := NewAPIError(ErrorTypeValidation, "test message", 400)
	expected := "validation_error: test message"
	assert.Equal(t, expected, err.Error(), "Error() should return formatted string")
}

// TestErrorConstructors tests all error constructor functions in one table-driven test
func TestErrorConstructors(t *testing.T) {
	testCases := []struct {
		name            string
		constructor     func(...string) *APIError
		args            []string
		expectedType    ErrorType
		expectedMsg     string
		expectedCode    int
		expectedDetails string
	}{
		// Standard constructors
		{
			name:            "InternalError",
			constructor:     func(args ...string) *APIError { return NewInternalError(args[0], args[1:]...) },
			args:            []string{"server error", "database connection failed"},
			expectedType:    ErrorTypeInternal,
			expectedMsg:     "server error",
			expectedCode:    http.StatusInternalServerError,
			expectedDetails: "database connection failed",
		},
		{
			name:            "FileOperationError",
			constructor:     func(args ...string) *APIError { return NewFileOperationError(args[0], args[1:]...) },
			args:            []string{"file write failed", "permission denied"},
			expectedType:    ErrorTypeFileOperation,
			expectedMsg:     "file write failed",
			expectedCode:    http.StatusInternalServerError,
			expectedDetails: "permission denied",
		},
		{
			name:            "InvalidRequestError",
			constructor:     func(args ...string) *APIError { return NewInvalidRequestError(args[0], args[1:]...) },
			args:            []string{"bad request", "missing parameter"},
			expectedType:    ErrorTypeInvalidRequest,
			expectedMsg:     "bad request",
			expectedCode:    http.StatusBadRequest,
			expectedDetails: "missing parameter",
		},
		// Special constructors
		{
			name:            "FileNotFoundError",
			constructor:     func(args ...string) *APIError { return NewFileNotFoundError(args[0], args[1:]...) },
			args:            []string{"/path/to/file.txt", "file details"},
			expectedType:    ErrorTypeNotFound,
			expectedMsg:     "File not found: /path/to/file.txt",
			expectedCode:    http.StatusNotFound,
			expectedDetails: "file details",
		},
		{
			name:            "ProcessNotFoundError",
			constructor:     func(args ...string) *APIError { return NewProcessNotFoundError(args[0]) },
			args:            []string{"proc-12345"},
			expectedType:    ErrorType("PROCESS_NOT_FOUND"),
			expectedMsg:     "Process not found: proc-12345",
			expectedCode:    404,
			expectedDetails: "",
		},
		{
			name:            "SessionOperationError",
			constructor:     func(args ...string) *APIError { return NewSessionOperationError(args[0]) },
			args:            []string{"session expired"},
			expectedType:    ErrorType("SESSION_OPERATION_ERROR"),
			expectedMsg:     "session expired",
			expectedCode:    500,
			expectedDetails: "",
		},
		{
			name:            "SessionNotFoundError",
			constructor:     func(args ...string) *APIError { return NewSessionNotFoundError(args[0]) },
			args:            []string{"sess-67890"},
			expectedType:    ErrorType("SESSION_NOT_FOUND"),
			expectedMsg:     "Session not found: sess-67890",
			expectedCode:    404,
			expectedDetails: "",
		},
		// NewAPIError directly
		{
			name:            "NewAPIError without details",
			constructor:     func(args ...string) *APIError { return NewAPIError(ErrorTypeValidation, "test message", 400) },
			args:            []string{},
			expectedType:    ErrorTypeValidation,
			expectedMsg:     "test message",
			expectedCode:    400,
			expectedDetails: "",
		},
		{
			name:            "NewAPIError with details",
			constructor:     func(args ...string) *APIError { return NewAPIError(ErrorTypeInternal, "error message", 500, "details") },
			args:            []string{},
			expectedType:    ErrorTypeInternal,
			expectedMsg:     "error message",
			expectedCode:    500,
			expectedDetails: "details",
		},
		{
			name: "NewAPIError with multiple details (should use first)",
			constructor: func(args ...string) *APIError {
				return NewAPIError(ErrorTypeNotFound, "not found", 404, "first", "second")
			},
			args:            []string{},
			expectedType:    ErrorTypeNotFound,
			expectedMsg:     "not found",
			expectedCode:    404,
			expectedDetails: "first",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.constructor(tc.args...)

			assert.Equal(t, tc.expectedType, err.Type, "type should match")
			assert.Equal(t, tc.expectedMsg, err.Message, "message should match")
			assert.Equal(t, tc.expectedCode, err.Code, "status code should match")
			assert.Equal(t, tc.expectedDetails, err.Details, "details should match")
		})
	}
}

// TestWriteErrorResponse tests the error response writing functionality
func TestWriteErrorResponse(t *testing.T) {
	t.Run("successful JSON response", func(t *testing.T) {
		err := NewInvalidRequestError("invalid input", "field is required")
		w := httptest.NewRecorder()

		WriteErrorResponse(w, err)

		assert.Equal(t, http.StatusBadRequest, w.Code, "status code should be 400")
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"), "content type should be JSON")

		var response APIError
		decodeErr := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, decodeErr, "response should be valid JSON")

		assert.Equal(t, err.Type, response.Type, "response type should match")
		assert.Equal(t, err.Message, response.Message, "response message should match")
		assert.Equal(t, err.Code, response.Code, "response code should match")
		assert.Equal(t, err.Details, response.Details, "response details should match")

		// Basic JSON format validation
		responseBody := w.Body.String()
		assert.True(t, strings.HasPrefix(responseBody, "{"), "response should start with {")
		assert.True(t, strings.HasSuffix(responseBody, "}\n"), "response should end with }\\n")
	})

	t.Run("fallback to plain text on JSON encoding failure", func(t *testing.T) {
		err := NewInvalidRequestError("invalid input", "field is required")

		// Create a custom response writer that fails on JSON encoding
		w := &mockFailingWriter{}

		WriteErrorResponse(w, err)

		assert.Equal(t, http.StatusBadRequest, w.code, "status code should be set")
		assert.Equal(t, "text/plain", w.ContentType(), "content type should be plain text")
		assert.Contains(t, w.body.String(), "Error: invalid input", "should contain error message")
	})

	t.Run("error without details", func(t *testing.T) {
		err := NewAPIError(ErrorTypeInternal, "server error", 500)
		w := httptest.NewRecorder()

		WriteErrorResponse(w, err)

		var response APIError
		decodeErr := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, decodeErr, "should unmarshal successfully")
		assert.Empty(t, response.Details, "details should be empty")
	})
}

// Simplified mock writer for testing JSON encoding failure
type mockFailingWriter struct {
	body   bytes.Buffer
	header http.Header
	code   int
	failed bool
}

func (w *mockFailingWriter) Header() http.Header {
	if w.header == nil {
		w.header = make(http.Header)
	}
	return w.header
}

func (w *mockFailingWriter) WriteHeader(statusCode int) {
	w.code = statusCode
}

func (w *mockFailingWriter) Write(data []byte) (int, error) {
	if !w.failed {
		w.failed = true
		return 0, errors.New("simulated JSON encoding failure")
	}
	return w.body.Write(data)
}

func (w *mockFailingWriter) ContentType() string {
	return w.header.Get("Content-Type")
}
