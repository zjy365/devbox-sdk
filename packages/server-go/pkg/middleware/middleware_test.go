package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labring/devbox-sdk-server/pkg/errors"
	"github.com/stretchr/testify/assert"
)

// helper: simple next handler that writes status and body
func okHandler(status int, body string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	})
}

func TestTokenAuth(t *testing.T) {
	expected := "secret"
	skip := []string{"/public"}
	mw := TokenAuth(expected, skip)

	// Table-driven cases
	tests := []struct {
		name         string
		path         string
		headers      map[string]string
		expectedCode int
	}{
		{"missing header", "/protected", map[string]string{}, http.StatusUnauthorized},
		{"wrong scheme", "/protected", map[string]string{"Authorization": "Basic abc"}, http.StatusUnauthorized},
		{"wrong token", "/protected", map[string]string{"Authorization": "Bearer wrong"}, http.StatusUnauthorized},
		{"correct token", "/protected", map[string]string{"Authorization": "Bearer secret"}, http.StatusOK},
		{"skip path without header", "/public", map[string]string{}, http.StatusOK},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tt.path, nil)
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}
			rr := httptest.NewRecorder()

			mw(okHandler(http.StatusOK, "ok")).ServeHTTP(rr, req)
			assert.Equal(t, tt.expectedCode, rr.Code)
			if rr.Code == http.StatusUnauthorized {
				assert.Contains(t, rr.Body.String(), "Unauthorized")
			}
		})
	}
}

func TestLogger_TraceID(t *testing.T) {
	mw := Logger()

	// Auto-generated trace id when not provided
	req := httptest.NewRequest("GET", "/path", nil)
	rr := httptest.NewRecorder()
	mw(okHandler(http.StatusOK, "ok")).ServeHTTP(rr, req)
	trace := rr.Header().Get("X-Trace-ID")
	assert.NotEmpty(t, trace, "trace id should be set")

	// Provided trace id should pass through
	req2 := httptest.NewRequest("GET", "/path", nil)
	req2.Header.Set("X-Trace-ID", "trace-123")
	rr2 := httptest.NewRecorder()
	mw(okHandler(http.StatusCreated, "created")).ServeHTTP(rr2, req2)
	assert.Equal(t, "trace-123", rr2.Header().Get("X-Trace-ID"))

	// Context injection should be accessible to downstream handler
	req3 := httptest.NewRequest("GET", "/ctx", nil)
	req3.Header.Set("X-Trace-ID", "trace-ctx-xyz")
	rr3 := httptest.NewRecorder()
	ctxEcho := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID, _ := r.Context().Value("traceID").(string)
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(traceID))
	})
	mw(ctxEcho).ServeHTTP(rr3, req3)
	assert.Equal(t, http.StatusAccepted, rr3.Code)
	assert.Equal(t, "trace-ctx-xyz", rr3.Body.String())
}

func TestRecovery(t *testing.T) {
	mw := Recovery()

	// Panic with generic string
	req := httptest.NewRequest("GET", "/panic", nil)
	rr := httptest.NewRecorder()

	panicHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom")
	})

	mw(panicHandler).ServeHTTP(rr, req)
	assert.Equal(t, http.StatusInternalServerError, rr.Code)

	// Panic with APIError should use its code
	req2 := httptest.NewRequest("GET", "/panic2", nil)
	rr2 := httptest.NewRecorder()
	apiErr := errors.NewInvalidRequestError("bad")
	mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { panic(apiErr) })).ServeHTTP(rr2, req2)
	assert.Equal(t, http.StatusBadRequest, rr2.Code)

	// Panic with error type should convert to internal
	req3 := httptest.NewRequest("GET", "/panic3", nil)
	rr3 := httptest.NewRecorder()
	mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { panic(assert.AnError) })).ServeHTTP(rr3, req3)
	assert.Equal(t, http.StatusInternalServerError, rr3.Code)
}

func TestChainOrder(t *testing.T) {
	order := []string{}

	mw1 := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			order = append(order, "mw1-before")
			next.ServeHTTP(w, r)
			order = append(order, "mw1-after")
		})
	}
	mw2 := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			order = append(order, "mw2-before")
			next.ServeHTTP(w, r)
			order = append(order, "mw2-after")
		})
	}

	chained := Chain(mw1, mw2)
	req := httptest.NewRequest("GET", "/chain", nil)
	rr := httptest.NewRecorder()
	chained(okHandler(http.StatusOK, "ok")).ServeHTTP(rr, req)

	assert.Equal(t, []string{"mw1-before", "mw2-before", "mw2-after", "mw1-after"}, order)
	assert.Equal(t, http.StatusOK, rr.Code)
}
