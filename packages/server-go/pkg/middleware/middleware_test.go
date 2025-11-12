package middleware

import (
	"bufio"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

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

	// Trace ID should be returned in response header
	req := httptest.NewRequest("GET", "/path", nil)
	rr := httptest.NewRecorder()
	mw(okHandler(http.StatusOK, "ok")).ServeHTTP(rr, req)
	// No trace ID provided, so response should not have one
	assert.Empty(t, rr.Header().Get("X-Trace-ID"))

	// Provided trace id should pass through to response header
	req2 := httptest.NewRequest("GET", "/path", nil)
	req2.Header.Set("X-Trace-ID", "trace-123")
	rr2 := httptest.NewRecorder()
	mw(okHandler(http.StatusCreated, "created")).ServeHTTP(rr2, req2)
	assert.Equal(t, "trace-123", rr2.Header().Get("X-Trace-ID"))
}

func TestRecovery(t *testing.T) {
	mw := Recovery()

	// Panic with generic string goes to default case
	req := httptest.NewRequest("GET", "/panic", nil)
	rr := httptest.NewRecorder()

	panicHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom")
	})

	mw(panicHandler).ServeHTTP(rr, req)
	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "Unknown error occurred")

	// Panic with error type should include error message
	req2 := httptest.NewRequest("GET", "/panic2", nil)
	rr2 := httptest.NewRecorder()
	mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { panic(assert.AnError) })).ServeHTTP(rr2, req2)
	assert.Equal(t, http.StatusInternalServerError, rr2.Code)
	assert.Contains(t, rr2.Body.String(), "general error")
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

// mockFlushWriter is a mock ResponseWriter that implements http.Flusher
type mockFlushWriter struct {
	*httptest.ResponseRecorder
	flushed bool
}

func (m *mockFlushWriter) Flush() {
	m.flushed = true
}

func TestResponseWriter_Flush(t *testing.T) {
	mw := Logger()

	t.Run("flush is called on underlying writer", func(t *testing.T) {
		mock := &mockFlushWriter{ResponseRecorder: httptest.NewRecorder()}
		req := httptest.NewRequest("GET", "/flush", nil)

		flushHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("data"))
			if flusher, ok := w.(http.Flusher); ok {
				flusher.Flush()
			}
		})

		mw(flushHandler).ServeHTTP(mock, req)

		assert.True(t, mock.flushed, "Flush should be called on underlying writer")
		assert.Equal(t, http.StatusOK, mock.Code)
	})

	t.Run("flush on non-flusher writer", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/flush", nil)
		rr := httptest.NewRecorder()

		flushHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			if flusher, ok := w.(http.Flusher); ok {
				flusher.Flush()
			}
		})

		mw(flushHandler).ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
	})
}

// mockHijackWriter is a mock ResponseWriter that implements http.Hijacker
type mockHijackWriter struct {
	*httptest.ResponseRecorder
	hijacked    bool
	hijackError error
}

func (m *mockHijackWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	m.hijacked = true
	if m.hijackError != nil {
		return nil, nil, m.hijackError
	}
	return nil, nil, nil
}

func TestResponseWriter_Hijack(t *testing.T) {
	mw := Logger()

	t.Run("hijack is called on underlying writer", func(t *testing.T) {
		mock := &mockHijackWriter{ResponseRecorder: httptest.NewRecorder()}
		req := httptest.NewRequest("GET", "/hijack", nil)

		hijackHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if hijacker, ok := w.(http.Hijacker); ok {
				_, _, err := hijacker.Hijack()
				if err == nil {
					return
				}
			}
			w.WriteHeader(http.StatusOK)
		})

		mw(hijackHandler).ServeHTTP(mock, req)

		assert.True(t, mock.hijacked, "Hijack should be called on underlying writer")
	})

	t.Run("hijack returns error", func(t *testing.T) {
		mock := &mockHijackWriter{
			ResponseRecorder: httptest.NewRecorder(),
			hijackError:      errors.New("hijack not supported"),
		}
		req := httptest.NewRequest("GET", "/hijack", nil)

		hijackHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if hijacker, ok := w.(http.Hijacker); ok {
				_, _, err := hijacker.Hijack()
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "hijack not supported")
			}
			w.WriteHeader(http.StatusOK)
		})

		mw(hijackHandler).ServeHTTP(mock, req)

		assert.True(t, mock.hijacked, "Hijack should be attempted")
		assert.Equal(t, http.StatusOK, mock.Code)
	})

	t.Run("hijack on non-hijacker writer", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/hijack", nil)
		rr := httptest.NewRecorder()

		hijackHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if hijacker, ok := w.(http.Hijacker); ok {
				_, _, err := hijacker.Hijack()
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "hijacking not supported")
			}
			w.WriteHeader(http.StatusOK)
		})

		mw(hijackHandler).ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
	})
}
