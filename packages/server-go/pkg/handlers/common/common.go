package common

import (
	"encoding/json"
	"net/http"
)

// Response is a generic response structure used across all handlers
type Response struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// WriteJSONResponse writes a JSON response to the http.ResponseWriter
func WriteJSONResponse(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
