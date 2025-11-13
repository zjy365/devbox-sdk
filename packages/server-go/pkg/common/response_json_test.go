package common

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestWriteSuccessResponseWithSampleData(t *testing.T) {
	type SampleData struct {
		Data string `json:"data"`
	}

	t.Run("write success response with SampleData", func(t *testing.T) {
		w := httptest.NewRecorder()
		extra := SampleData{Data: "test value"}

		WriteSuccessResponse(w, extra)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response Response[SampleData]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, StatusSuccess, response.Status)
		assert.Equal(t, "success", response.Message)
		assert.Equal(t, "test value", response.Data.Data)
	})
}
