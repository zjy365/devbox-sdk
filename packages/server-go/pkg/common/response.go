package common

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type Status uint16

const (
	StatusSuccess Status = 0
	StatusPanic   Status = 500

	StatusValidationError Status = 1400
	StatusNotFound        Status = 1404
	StatusUnauthorized    Status = 1401
	StatusForbidden       Status = 1403
	StatusInvalidRequest  Status = 1422
	StatusInternalError   Status = 1500
	StatusConflict        Status = 1409
	StatusOperationError  Status = 1600
)

func (s Status) String() string {
	switch s {
	case StatusSuccess:
		return "success"
	case StatusPanic:
		return "panic"
	case StatusValidationError:
		return "validation_error"
	case StatusNotFound:
		return "not_found"
	case StatusUnauthorized:
		return "unauthorized"
	case StatusForbidden:
		return "forbidden"
	case StatusInvalidRequest:
		return "invalid_request"
	case StatusInternalError:
		return "internal_error"
	case StatusConflict:
		return "conflict"
	case StatusOperationError:
		return "operation_error"
	default:
		return "unknown"
	}
}

// Response is a generic response structure used across all handlers
type Response[T any] struct {
	Status  Status `json:"status"`
	Message string `json:"message,omitempty"`
	Data    T      `json:",inline"`
}

func (r *Response[T]) IsSuccess() bool {
	return r.Status == StatusSuccess
}

// Error implements the error interface
func (r *Response[T]) Error() string {
	if r.IsSuccess() {
		return ""
	}
	return fmt.Sprintf("%s: %s", r.Status.String(), r.Message)
}

// WriteJSONResponse writes a JSON response to the http.ResponseWriter
func WriteJSONResponse[T any](w http.ResponseWriter, status Status, message string, data T) {
	resp := &Response[T]{
		Status:  status,
		Message: message,
		Data:    data,
	}

	w.Header().Set("Content-Type", "application/json")
	statusCode := http.StatusOK
	if status == StatusPanic {
		statusCode = http.StatusInternalServerError
	}
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(resp); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func WriteSuccessResponse[T any](w http.ResponseWriter, data T) {
	WriteJSONResponse(w, StatusSuccess, "success", data)
}

func WriteErrorResponse(w http.ResponseWriter, status Status, format string, a ...any) {
	WriteJSONResponse(w, status, fmt.Sprintf(format, a...), struct{}{})
}
