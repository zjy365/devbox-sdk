package router

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

type Route struct {
	method  string
	pattern string
	regex   *regexp.Regexp
	params  []string
	handler http.HandlerFunc
}

// Router handles HTTP routing with pattern matching and parameter extraction
type Router struct {
	routes []Route
}

// NewRouter creates a new router
func NewRouter() *Router {
	return &Router{
		routes: make([]Route, 0),
	}
}

// Register registers a route with the router
func (r *Router) Register(method, pattern string, handler http.HandlerFunc) {
	regex, params := r.compilePattern(pattern)

	route := Route{
		method:  strings.ToUpper(method),
		pattern: pattern,
		regex:   regex,
		params:  params,
		handler: handler,
	}

	r.routes = append(r.routes, route)
}

// Match finds a matching route for the given method and path
func (r *Router) Match(method, path string) (http.HandlerFunc, map[string]string, bool) {
	method = strings.ToUpper(method)

	for _, route := range r.routes {
		if route.method != method {
			continue
		}

		matches := route.regex.FindStringSubmatch(path)
		if matches == nil {
			continue
		}

		params := make(map[string]string)
		for i, param := range route.params {
			if i+1 < len(matches) {
				// URL decode the parameter value
				if decoded, err := url.QueryUnescape(matches[i+1]); err == nil {
					params[param] = decoded
				} else {
					params[param] = matches[i+1]
				}
			}
		}

		return route.handler, params, true
	}

	return nil, nil, false
}

// compilePattern converts a route pattern to a regular expression
func (r *Router) compilePattern(pattern string) (*regexp.Regexp, []string) {
	var params []string
	regexPattern := pattern

	// Find parameter patterns and replace them
	paramRegex := regexp.MustCompile(`:([a-zA-Z_][a-zA-Z0-9_]*)`)
	regexPattern = paramRegex.ReplaceAllStringFunc(regexPattern, func(match string) string {
		param := strings.TrimPrefix(match, ":")
		params = append(params, param)
		return `([^/]+)`
	})

	regexPattern = strings.ReplaceAll(regexPattern, `*`, `(.*)`)

	regexPattern = "^" + regexPattern + "$"

	regex := regexp.MustCompile(regexPattern)
	return regex, params
}

// ServeHTTP implements the http.Handler interface
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	handler, params, found := r.Match(req.Method, req.URL.Path)
	if !found {
		http.NotFound(w, req)
		return
	}

	if len(params) > 0 {
		ctx := context.WithValue(req.Context(), paramsContextKey{}, params)
		req = req.WithContext(ctx)
	}

	handler(w, req)
}

// paramsContextKey is the context key type for route params
type paramsContextKey struct{}

// Param returns the path parameter value from request context
func Param(r *http.Request, name string) string {
	if r == nil {
		return ""
	}
	v := r.Context().Value(paramsContextKey{})
	if v == nil {
		return ""
	}
	m, ok := v.(map[string]string)
	if !ok {
		return ""
	}
	return m[name]
}
