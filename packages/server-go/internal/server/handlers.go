package server

import (
	"log/slog"
	"net/http"

	"github.com/labring/devbox-sdk-server/pkg/handlers"
	"github.com/labring/devbox-sdk-server/pkg/handlers/file"
	"github.com/labring/devbox-sdk-server/pkg/handlers/port"
	"github.com/labring/devbox-sdk-server/pkg/handlers/process"
	"github.com/labring/devbox-sdk-server/pkg/handlers/session"
	"github.com/labring/devbox-sdk-server/pkg/handlers/websocket"
	"github.com/labring/devbox-sdk-server/pkg/router"
)

// routeConfig defines route configuration
type routeConfig struct {
	Method   string
	Pattern  string
	Function http.HandlerFunc
}

// RegisterRoutes registers all routes using configuration
func (s *Server) registerRoutes(r *router.Router, middlewareChain func(http.Handler) http.Handler) {
	// Register all handlers
	fileHandler := file.NewFileHandler(s.config)
	processHandler := process.NewProcessHandler()
	sessionHandler := session.NewSessionHandler()
	healthHandler := handlers.NewHealthHandler()
	portHandler := port.NewPortHandler()
	websocketHandler := websocket.NewWebSocketHandlerWithDeps(processHandler, sessionHandler, nil)

	routes := []routeConfig{
		// Health endpoints
		{"GET", "/health", healthHandler.HealthCheck},
		{"GET", "/health/ready", healthHandler.ReadinessCheck},

		// File operations
		{"POST", "/api/v1/files/write", fileHandler.WriteFile},
		{"POST", "/api/v1/files/read", fileHandler.ReadFile},
		{"POST", "/api/v1/files/delete", fileHandler.DeleteFile},
		{"POST", "/api/v1/files/move", fileHandler.MoveFile},
		{"POST", "/api/v1/files/rename", fileHandler.RenameFile},
		{"POST", "/api/v1/files/download", fileHandler.DownloadFiles},
		{"POST", "/api/v1/files/batch-upload", fileHandler.BatchUpload},
		{"GET", "/api/v1/files/list", fileHandler.ListFiles},

		// Process operations
		{"GET", "/api/v1/process/list", processHandler.ListProcesses},
		{"POST", "/api/v1/process/exec", processHandler.ExecProcess},
		{"POST", "/api/v1/process/exec-sync", processHandler.ExecProcessSync},
		{"POST", "/api/v1/process/sync-stream", processHandler.ExecProcessSyncStream},
		{"GET", "/api/v1/process/:id/status", processHandler.GetProcessStatus},
		{"POST", "/api/v1/process/:id/kill", processHandler.KillProcess},
		{"GET", "/api/v1/process/:id/logs", processHandler.GetProcessLogs},

		// Session operations
		{"GET", "/api/v1/sessions", sessionHandler.GetAllSessions},
		{"POST", "/api/v1/sessions/create", sessionHandler.CreateSession},
		{"GET", "/api/v1/sessions/:id", sessionHandler.GetSession},
		{"POST", "/api/v1/sessions/:id/env", sessionHandler.UpdateSessionEnv},
		{"POST", "/api/v1/sessions/:id/exec", sessionHandler.SessionExec},
		{"POST", "/api/v1/sessions/:id/cd", sessionHandler.SessionCd},
		{"POST", "/api/v1/sessions/:id/terminate", sessionHandler.TerminateSession},
		{"GET", "/api/v1/sessions/:id/logs", sessionHandler.GetSessionLogsWithParams},

		// Port monitoring
		{"GET", "/api/v1/ports", portHandler.GetPorts},

		// WebSocket endpoint
		{"GET", "/ws", websocketHandler.HandleWebSocket},
	}

	for _, route := range routes {
		// Print route registration information
		slog.Info("Registering route",
			slog.String("method", route.Method),
			slog.String("pattern", route.Pattern),
		)

		// Use unified route registration
		r.Register(route.Method, route.Pattern, middlewareChain(route.Function).ServeHTTP)
	}
}
