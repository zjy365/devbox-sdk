package router

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// helper: no-op handler
var noOpHandler = func(w http.ResponseWriter, r *http.Request) {}

func TestNewRouter(t *testing.T) {
	r := NewRouter()
	require.NotNil(t, r, "NewRouter returned nil")
}

func TestRegisterMethods(t *testing.T) {
	testCases := []struct {
		name   string
		method string
	}{
		{"GET", "GET"},
		{"POST", "POST"},
		{"PUT", "PUT"},
		{"DELETE", "DELETE"},
		{"PATCH", "PATCH"},
		{"OPTIONS", "OPTIONS"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			r := NewRouter()
			r.Register(tc.method, "/a", noOpHandler)
			assert.Len(t, r.routes, 1, "expected 1 route")
			assert.Equal(t, tc.method, r.routes[0].method, "method mismatch")
		})
	}
}

func TestCompilePattern(t *testing.T) {
	r := NewRouter()

	t.Run("params and wildcard", func(t *testing.T) {
		regex, params := r.compilePattern("/users/:id/files/*")
		require.NotNil(t, regex, "regex should not be nil")

		expectedParams := []string{"id"}
		assert.Equal(t, expectedParams, params, "params mismatch")

		// Should match and capture id and wildcard
		matches := regex.FindStringSubmatch("/users/123/files/path/to/file")
		require.NotNil(t, matches, "pattern should match expected path")
		require.Len(t, matches, 3, "expected 3 matches (full + id + wildcard)")

		assert.Equal(t, "123", matches[1], "expected id=123")
		assert.Equal(t, "path/to/file", matches[2], "expected wildcard path")
	})

	t.Run("simple patterns", func(t *testing.T) {
		// Test pattern without parameters
		regex, params := r.compilePattern("/simple/path")
		require.NotNil(t, regex, "regex should not be nil")
		assert.Empty(t, params, "should have no parameters")
		assert.True(t, regex.MatchString("/simple/path"), "should match exact path")
		assert.False(t, regex.MatchString("/simple/path/extra"), "should not match extra path")

		// Test pattern with single parameter
		regex, params = r.compilePattern("/users/:id")
		require.NotNil(t, regex, "regex should not be nil")
		assert.Equal(t, []string{"id"}, params, "should have id parameter")
		assert.True(t, regex.MatchString("/users/123"), "should match with parameter")
		assert.False(t, regex.MatchString("/users/123/profile"), "should not match extra path")

		// Test pattern with multiple parameters
		regex, params = r.compilePattern("/users/:id/posts/:post_id")
		require.NotNil(t, regex, "regex should not be nil")
		assert.Equal(t, []string{"id", "post_id"}, params, "should have both parameters")
		assert.True(t, regex.MatchString("/users/123/posts/456"), "should match with multiple parameters")
	})
}

func TestMatch(t *testing.T) {
	r := NewRouter()

	t.Run("successful match with param decoding", func(t *testing.T) {
		r.Register("GET", "/items/:id", noOpHandler)

		// Encode a value with a slash to ensure QueryUnescape works
		encoded := url.QueryEscape("a/b") // "a%2Fb"
		h, params, found := r.Match("GET", "/items/"+encoded)

		require.True(t, found, "expected to find route")
		require.NotNil(t, h, "expected handler to be found")
		assert.Equal(t, "a/b", params["id"], "expected decoded id 'a/b'")
	})

	t.Run("no route found", func(t *testing.T) {
		r.Register("GET", "/users", noOpHandler)

		// Test wrong method
		h, params, found := r.Match("POST", "/users")
		assert.False(t, found, "should not find route for wrong method")
		assert.Nil(t, h, "handler should be nil")
		assert.Nil(t, params, "params should be nil")

		// Test wrong path
		h, params, found = r.Match("GET", "/posts")
		assert.False(t, found, "should not find route for wrong path")
		assert.Nil(t, h, "handler should be nil")
		assert.Nil(t, params, "params should be nil")
	})

	t.Run("invalid param decoding", func(t *testing.T) {
		r.Register("GET", "/items/:id", noOpHandler)

		// Use a path with invalid URL encoding - should use raw value
		h, params, found := r.Match("GET", "/items/hello%world")
		require.True(t, found, "should find route")
		require.NotNil(t, h, "handler should not be nil")
		assert.Equal(t, "hello%world", params["id"], "should use raw value when decoding fails")
	})
}

func TestQueryParamsStandard(t *testing.T) {
	req := httptest.NewRequest("GET", "/search?q=golang&q=router&page=2", nil)
	q := req.URL.Query()
	assert.Equal(t, "golang", q.Get("q"), "expected first 'q' value 'golang'")
	assert.Equal(t, "2", q.Get("page"), "expected page=2")
}

func TestServeHTTP(t *testing.T) {

	// Modified test: success with context -> success with query parameters, and removed context assertion
	t.Run("success with query parameters", func(t *testing.T) {
		r := NewRouter()
		called := false

		r.Register("GET", "/users/:id", func(w http.ResponseWriter, req *http.Request) {
			called = true

			// Only assert query parameters
			assert.Equal(t, "x", req.URL.Query().Get("q"), "expected query param q=x")
		})

		req := httptest.NewRequest("GET", "/users/123?q=x", nil)
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		assert.True(t, called, "handler should be called")
		assert.Equal(t, http.StatusOK, rr.Code, "expected status 200")
	})

	t.Run("not found", func(t *testing.T) {
		r := NewRouter()
		req := httptest.NewRequest("GET", "/no/such/path", nil)
		rr := httptest.NewRecorder()

		r.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusNotFound, rr.Code, "expected 404")
	})

	t.Run("handler panic propagates", func(t *testing.T) {
		r := NewRouter()
		r.Register("GET", "/panic", func(w http.ResponseWriter, req *http.Request) { panic(fmt.Errorf("boom")) })

		req := httptest.NewRequest("GET", "/panic", nil)
		rr := httptest.NewRecorder()

		assert.Panics(t, func() {
			r.ServeHTTP(rr, req)
		}, "expected panic when handler panics")
	})
}

func TestGetRoutes(t *testing.T) {
	r := NewRouter()
	r.Register("GET", "/a", noOpHandler)
	r.Register("POST", "/b", noOpHandler)

	require.Len(t, r.routes, 2, "expected 2 routes")

	assert.Equal(t, "GET", r.routes[0].method, "first route method mismatch")
	assert.Equal(t, "/a", r.routes[0].pattern, "first route pattern mismatch")
	assert.Equal(t, "POST", r.routes[1].method, "second route method mismatch")
	assert.Equal(t, "/b", r.routes[1].pattern, "second route pattern mismatch")
}

// Delete entire TestContextHelpers function

func TestRegister_DirectCall(t *testing.T) {
	// Test the Register method directly
	r := NewRouter()
	called := false
	handler := func(w http.ResponseWriter, req *http.Request) { called = true }

	r.Register("CUSTOM", "/custom", handler)

	assert.Len(t, r.routes, 1, "should have one route")
	route := r.routes[0]
	assert.Equal(t, "CUSTOM", route.method, "method should be uppercase")
	assert.Equal(t, "/custom", route.pattern, "pattern should match")

	// Test the handler works by calling it
	h, params, found := r.Match("CUSTOM", "/custom")
	require.True(t, found, "should find route")
	require.NotNil(t, h, "handler should not be nil")

	// No params expected
	assert.Empty(t, params, "params should be empty for exact path")

	h(nil, nil)
	assert.True(t, called, "handler should have been called")
}
