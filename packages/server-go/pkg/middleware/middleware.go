package middleware

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
)

// Middleware is a function that wraps an http.Handler
type Middleware func(http.Handler) http.Handler

// Chain combines multiple middlewares into a single middleware
func Chain(middlewares ...Middleware) Middleware {
	return func(next http.Handler) http.Handler {
		for i := len(middlewares) - 1; i >= 0; i-- {
			next = middlewares[i](next)
		}
		return next
	}
}

// Logger middleware logs HTTP requests using slog
func Logger() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			// Wrap ResponseWriter to capture status code
			wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

			// Process request
			next.ServeHTTP(wrapped, r)

			// Log request completion
			duration := time.Since(start)
			fields := []any{
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.String("remote", r.RemoteAddr),
				slog.Int("status", wrapped.statusCode),
				slog.String("duration", duration.String()),
				slog.Int64("bytes", wrapped.bytesWritten),
			}

			// Generate or get TraceID
			traceID := r.Header.Get("X-Trace-ID")
			if traceID != "" {
				// Add TraceID to context and response header
				ctx := context.WithValue(r.Context(), "trace_id", traceID)
				r = r.WithContext(ctx)
				w.Header().Set("X-Trace-ID", traceID)

				fields = append(fields, slog.String("trace_id", traceID))
			}

			// Choose log level based solely on status code
			if wrapped.statusCode >= http.StatusInternalServerError {
				slog.Error("request", fields...)
			} else if wrapped.statusCode >= http.StatusBadRequest {
				slog.Warn("request", fields...)
			} else {
				slog.Info("request", fields...)
			}
		})
	}
}

// responseWriter wraps http.ResponseWriter to capture status code
type responseWriter struct {
	http.ResponseWriter
	statusCode   int
	bytesWritten int64
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	n, err := rw.ResponseWriter.Write(b)
	rw.bytesWritten += int64(n)
	return n, err
}

func (rw *responseWriter) Flush() {
	if flusher, ok := rw.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (rw *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hijacker, ok := rw.ResponseWriter.(http.Hijacker); ok {
		return hijacker.Hijack()
	}
	return nil, nil, fmt.Errorf("hijacking not supported by underlying ResponseWriter")
}

// Recovery middleware recovers from panics and returns proper error responses
func Recovery() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if err := recover(); err != nil {
					// Log the panic with stack trace independently
					if traceID, ok := r.Context().Value("trace_id").(string); ok && traceID != "" {
						slog.Error("panic recovered", slog.Any("error", err), slog.String("stack", string(debug.Stack())), slog.String("trace_id", traceID))
					} else {
						slog.Error("panic recovered", slog.Any("error", err), slog.String("stack", string(debug.Stack())))
					}

					// Send error response
					switch e := err.(type) {
					case error:
						common.WriteErrorResponse(w, common.StatusPanic, "%s", e.Error())
					default:
						common.WriteErrorResponse(w, common.StatusPanic, "Unknown error occurred")
					}
				}
			}()

			next.ServeHTTP(w, r)
		})
	}
}

// TokenAuth returns a middleware that validates Authorization: Bearer <token>
func TokenAuth(expectedToken string, skipPaths []string) Middleware {
	// Normalize skip paths into a set for fast lookup
	skip := make(map[string]struct{}, len(skipPaths))
	for _, p := range skipPaths {
		skip[p] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip auth for specific paths
			if _, ok := skip[r.URL.Path]; ok {
				next.ServeHTTP(w, r)
				return
			}

			// Extract Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte("Unauthorized"))
				return
			}

			token := strings.TrimPrefix(authHeader, "Bearer ")
			if token != expectedToken {
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte("Unauthorized"))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
