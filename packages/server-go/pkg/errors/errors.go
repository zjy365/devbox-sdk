package errors

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// ErrorType represents the type of error
type ErrorType string

const (
	ErrorTypeValidation     ErrorType = "validation_error"
	ErrorTypeNotFound       ErrorType = "not_found"
	ErrorTypeUnauthorized   ErrorType = "unauthorized"
	ErrorTypeForbidden      ErrorType = "forbidden"
	ErrorTypeConflict       ErrorType = "conflict"
	ErrorTypeInternal       ErrorType = "internal_error"
	ErrorTypeFileOperation  ErrorType = "file_operation_error"
	ErrorTypeProcessError   ErrorType = "process_error"
	ErrorTypeInvalidRequest ErrorType = "invalid_request"
)

// APIError represents a structured API error
type APIError struct {
	Type    ErrorType `json:"type"`
	Message string    `json:"message"`
	Code    int       `json:"code"`
	Details string    `json:"details,omitempty"`
}

// Error implements the error interface
func (e *APIError) Error() string {
	return fmt.Sprintf("%s: %s", e.Type, e.Message)
}

// NewAPIError creates a new API error
func NewAPIError(errorType ErrorType, message string, code int, details ...string) *APIError {
	err := &APIError{
		Type:    errorType,
		Message: message,
		Code:    code,
	}
	if len(details) > 0 {
		err.Details = details[0]
	}
	return err
}

func NewInternalError(message string, details ...string) *APIError {
	return NewAPIError(ErrorTypeInternal, message, http.StatusInternalServerError, details...)
}

func NewFileOperationError(message string, details ...string) *APIError {
	return NewAPIError(ErrorTypeFileOperation, message, http.StatusInternalServerError, details...)
}

func NewInvalidRequestError(message string, details ...string) *APIError {
	return NewAPIError(ErrorTypeInvalidRequest, message, http.StatusBadRequest, details...)
}

func NewFileNotFoundError(path string, details ...string) *APIError {
	message := fmt.Sprintf("File not found: %s", path)
	return NewAPIError(ErrorTypeNotFound, message, http.StatusNotFound, details...)
}

// NewProcessNotFoundError creates a process not found error
func NewProcessNotFoundError(processID string) *APIError {
	return &APIError{
		Type:    "PROCESS_NOT_FOUND",
		Message: fmt.Sprintf("Process not found: %s", processID),
		Code:    404,
	}
}

func NewSessionOperationError(message string) *APIError {
	return &APIError{
		Type:    "SESSION_OPERATION_ERROR",
		Message: message,
		Code:    500,
	}
}

func NewSessionNotFoundError(sessionID string) *APIError {
	return &APIError{
		Type:    "SESSION_NOT_FOUND",
		Message: fmt.Sprintf("Session not found: %s", sessionID),
		Code:    404,
	}
}

// WriteErrorResponse writes an error response to the HTTP response writer
func WriteErrorResponse(w http.ResponseWriter, err *APIError) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(err.Code)

	if encodeErr := json.NewEncoder(w).Encode(err); encodeErr != nil {
		// Fallback to plain text if JSON encoding fails
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprintf(w, "Error: %s", err.Message)
	}
}
