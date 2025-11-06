package server

import (
	"fmt"
	"log/slog"
	"net/http"

	"github.com/labring/devbox-sdk-server/pkg/config"
	"github.com/labring/devbox-sdk-server/pkg/middleware"
	"github.com/labring/devbox-sdk-server/pkg/router"
)

// Server represents the main application server
type Server struct {
	router *router.Router
	config *config.Config
}

// New creates a new server instance
func New(cfg *config.Config) (*Server, error) {
	// Initialize logging via slog (default is set in main.go)
	slog.Info("Initializing server...")

	// Create router
	r := router.NewRouter()

	// Create server instance first
	srv := &Server{
		router: r,
		config: cfg,
	}

	// Setup routes
	if err := srv.setupRoutes(r); err != nil {
		return nil, fmt.Errorf("failed to setup routes: %w", err)
	}

	slog.Info("Server initialized successfully")

	return srv, nil
}

// ServeHTTP implements the http.Handler interface
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

// Cleanup performs cleanup operations
func (s *Server) Cleanup() error {
	slog.Info("Performing server cleanup...")

	// Add any cleanup operations here
	// For example: closing database connections, stopping background workers, etc.

	return nil
}

// setupRoutes configures the router and registers routes
func (s *Server) setupRoutes(r *router.Router) error {
	// Build a middleware chain with container injection
	chain := middleware.Chain(
		middleware.Logger(),
		middleware.Recovery(),
		middleware.TokenAuth(s.config.Token, nil),
	)

	// Register all routes using configuration (middleware now handles container injection)
	s.registerRoutes(r, chain)

	return nil
}
