package common

import (
	"encoding/json"
	"net/http"
)

func ParseJSONBodyReturn(w http.ResponseWriter, r *http.Request, v any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	err := decoder.Decode(v)
	if err != nil {
		WriteErrorResponse(w, StatusInvalidRequest, "Invalid JSON body")
		return err
	}
	return nil
}
