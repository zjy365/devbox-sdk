package common

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestWriteJSONResponse(t *testing.T) {
	t.Run("successful JSON response", func(t *testing.T) {
		data := map[string]any{
			"success": true,
			"message": "test message",
		}

		w := httptest.NewRecorder()
		WriteJSONResponse(w, data)

		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, data["success"], response["success"])
		assert.Equal(t, data["message"], response["message"])
	})
}
