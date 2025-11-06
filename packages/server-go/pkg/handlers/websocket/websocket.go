package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
	"github.com/labring/devbox-sdk-server/pkg/handlers/process"
	"github.com/labring/devbox-sdk-server/pkg/handlers/session"
)

// WebSocketHandler handles WebSocket connections
type WebSocketHandler struct {
	upgrader       websocket.Upgrader
	clients        map[*websocket.Conn]*ClientInfo
	subscriptions  map[string]*SubscriptionInfo // key: "clientID:type:targetID"
	mutex          sync.RWMutex
	processHandler *process.ProcessHandler
	sessionHandler *session.SessionHandler
	config         *WebSocketConfig
	ctx            context.Context
	cancel         context.CancelFunc
}

// ClientInfo holds client connection information
type ClientInfo struct {
	ID            string
	Connected     time.Time
	LastActive    time.Time
	Timeout       time.Duration
	Subscriptions []string // list of subscription IDs
}

// SubscriptionInfo holds subscription information
type SubscriptionInfo struct {
	ID        string
	Type      string // "process" or "session"
	TargetID  string // process ID or session ID
	Client    *ClientInfo
	Conn      *websocket.Conn
	LogLevels []string // subscribed log levels
	CreatedAt time.Time
	Active    bool
}

// NewWebSocketHandlerWithDeps creates a new WebSocket handler with process and session handlers
func NewWebSocketHandlerWithDeps(ph *process.ProcessHandler, sh *session.SessionHandler, config *WebSocketConfig) *WebSocketHandler {
	ctx, cancel := context.WithCancel(context.Background())

	if config == nil {
		config = NewDefaultWebSocketConfig()
	}

	ws := &WebSocketHandler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		clients:        make(map[*websocket.Conn]*ClientInfo),
		subscriptions:  make(map[string]*SubscriptionInfo),
		processHandler: ph,
		sessionHandler: sh,
		config:         config,
		ctx:            ctx,
		cancel:         cancel,
	}

	// Set WebSocket handlers for process and session handlers
	if ph != nil {
		ph.SetWebSocketHandler(ws)
	}
	if sh != nil {
		sh.SetWebSocketHandler(ws)
	}

	// Start background tasks
	go ws.startConnectionHealthChecker()
	go ws.startLogBufferManager()

	return ws
}

// HandleWebSocket handles WebSocket connections
func (h *WebSocketHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("WebSocket upgrade failed", slog.String("error", err.Error()))
		return
	}

	client := &ClientInfo{
		ID:            r.RemoteAddr,
		Connected:     time.Now(),
		LastActive:    time.Now(),
		Timeout:       h.config.ReadTimeout,
		Subscriptions: []string{},
	}

	h.mutex.Lock()
	h.clients[conn] = client
	h.mutex.Unlock()

	go h.handleClient(conn, client)
}

// handleClient manages a client connection
func (h *WebSocketHandler) handleClient(conn *websocket.Conn, client *ClientInfo) {
	defer func() {
		h.cleanupClientConnection(conn)
	}()

	conn.SetReadLimit(h.config.MaxMessageSize)
	conn.SetReadDeadline(time.Now().Add(client.Timeout))
	conn.SetPongHandler(func(string) error {
		client.LastActive = time.Now()
		conn.SetReadDeadline(time.Now().Add(client.Timeout))
		return nil
	})

	// Start ping loop
	go h.startPingLoop(conn, client)

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				slog.Error("WebSocket error", slog.String("error", err.Error()))
			}
			return
		}
		client.LastActive = time.Now()

		// Parse subscription-based request
		var req common.SubscriptionRequest
		if err := json.Unmarshal(message, &req); err != nil {
			h.sendError(conn, "Invalid request format", "INVALID_FORMAT")
			continue
		}

		switch req.Action {
		case "subscribe":
			if err := h.handleSubscribe(conn, client, &req); err != nil {
				h.sendError(conn, err.Error(), "SUBSCRIBE_FAILED")
			}
		case "unsubscribe":
			if err := h.handleUnsubscribe(conn, client, &req); err != nil {
				h.sendError(conn, err.Error(), "UNSUBSCRIBE_FAILED")
			}
		case "list":
			if err := h.handleList(conn, client); err != nil {
				h.sendError(conn, err.Error(), "LIST_FAILED")
			}
		default:
			h.sendError(conn, "Unknown action", "UNKNOWN_ACTION")
		}
	}
}

// handleSubscribe handles subscription requests
func (h *WebSocketHandler) handleSubscribe(conn *websocket.Conn, client *ClientInfo, req *common.SubscriptionRequest) error {
	if req.Type == "" || req.TargetID == "" {
		return fmt.Errorf("type and targetId are required")
	}

	subscriptionID := fmt.Sprintf("%s:%s:%s", client.ID, req.Type, req.TargetID)

	h.mutex.Lock()
	defer h.mutex.Unlock()

	// Check if subscription already exists
	if _, exists := h.subscriptions[subscriptionID]; exists {
		return fmt.Errorf("subscription already exists")
	}

	// Create subscription
	subscription := &SubscriptionInfo{
		ID:        subscriptionID,
		Type:      req.Type,
		TargetID:  req.TargetID,
		Client:    client,
		Conn:      conn,
		LogLevels: req.Options.Levels,
		CreatedAt: time.Now(),
		Active:    true,
	}

	h.subscriptions[subscriptionID] = subscription
	client.Subscriptions = append(client.Subscriptions, subscriptionID)

	// Send historical logs if requested
	if req.Options.Tail > 0 {
		go h.sendHistoricalLogs(conn, req.Type, req.TargetID, req.Options.Levels)
	}

	// Send confirmation
	response := common.SubscriptionResult{
		Action:    "subscribed",
		Type:      req.Type,
		TargetID:  req.TargetID,
		Levels:    make(map[string]bool),
		Timestamp: time.Now().Unix(),
	}

	// Convert log levels to map
	for _, level := range req.Options.Levels {
		response.Levels[level] = true
	}

	return h.sendJSON(conn, response)
}

// handleUnsubscribe handles unsubscription requests
func (h *WebSocketHandler) handleUnsubscribe(conn *websocket.Conn, client *ClientInfo, req *common.SubscriptionRequest) error {
	if req.Type == "" || req.TargetID == "" {
		return fmt.Errorf("type and targetId are required")
	}

	subscriptionID := fmt.Sprintf("%s:%s:%s", client.ID, req.Type, req.TargetID)

	h.mutex.Lock()
	defer h.mutex.Unlock()

	subscription, exists := h.subscriptions[subscriptionID]
	if !exists {
		return fmt.Errorf("subscription not found")
	}

	// Remove subscription
	delete(h.subscriptions, subscriptionID)
	subscription.Active = false

	// Remove from client's subscriptions
	for i, subID := range client.Subscriptions {
		if subID == subscriptionID {
			client.Subscriptions = append(client.Subscriptions[:i], client.Subscriptions[i+1:]...)
			break
		}
	}

	// Send confirmation
	response := common.SubscriptionResult{
		Action:    "unsubscribed",
		Type:      req.Type,
		TargetID:  req.TargetID,
		Timestamp: time.Now().Unix(),
	}

	return h.sendJSON(conn, response)
}

// handleList handles list requests
func (h *WebSocketHandler) handleList(conn *websocket.Conn, client *ClientInfo) error {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	subscriptions := make([]map[string]any, 0)
	for _, subID := range client.Subscriptions {
		if sub, exists := h.subscriptions[subID]; exists {
			logLevels := make([]string, 0, len(sub.LogLevels))
			for _, lvl := range sub.LogLevels {
				logLevels = append(logLevels, lvl)
			}
			subscriptions = append(subscriptions, map[string]any{
				"id":        sub.ID,
				"type":      sub.Type,
				"targetId":  sub.TargetID,
				"logLevels": logLevels,
				"createdAt": sub.CreatedAt.Unix(),
				"active":    sub.Active,
			})
		}
	}

	result := map[string]any{
		"type":          "list",
		"subscriptions": subscriptions,
	}

	return h.sendJSON(conn, result)
}

// BroadcastLogEntry broadcasts a log entry to all subscribed clients
func (h *WebSocketHandler) BroadcastLogEntry(logEntry *common.LogEntry) {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	message := common.LogMessage{
		Type:      "log",
		DataType:  logEntry.TargetType,
		TargetID:  logEntry.TargetID,
		Log:       *logEntry,
		Sequence:  0,
		IsHistory: false,
	}

	for _, subscription := range h.subscriptions {
		if !subscription.Active {
			continue
		}

		// Check if subscription matches the log entry
		if subscription.Type != logEntry.TargetType || subscription.TargetID != logEntry.TargetID {
			continue
		}

		// Check log level filter
		if len(subscription.LogLevels) > 0 {
			found := false
			for _, lvl := range subscription.LogLevels {
				if lvl == logEntry.Level {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}

		// Send message to client
		if err := h.sendJSON(subscription.Conn, message); err != nil {
			slog.Error("Failed to send log message", slog.String("error", err.Error()), slog.String("subscription", subscription.ID))
		}
	}
}

// cleanupClientConnection cleans up a client connection
func (h *WebSocketHandler) cleanupClientConnection(conn *websocket.Conn) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	client, exists := h.clients[conn]
	if !exists {
		return
	}

	// Remove all client subscriptions
	for _, subID := range client.Subscriptions {
		if sub, exists := h.subscriptions[subID]; exists {
			sub.Active = false
			delete(h.subscriptions, subID)
		}
	}

	delete(h.clients, conn)
	conn.Close()
}

// startPingLoop starts a ping loop for a client connection
func (h *WebSocketHandler) startPingLoop(conn *websocket.Conn, client *ClientInfo) {
	ticker := time.NewTicker(h.config.PingPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(h.config.WriteWait)); err != nil {
				return
			}
		case <-h.ctx.Done():
			return
		}
	}
}

// startConnectionHealthChecker starts a background task to check connection health
func (h *WebSocketHandler) startConnectionHealthChecker() {
	ticker := time.NewTicker(h.config.HealthCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			h.checkConnectionHealth()
		case <-h.ctx.Done():
			return
		}
	}
}

// startLogBufferManager starts a background task to manage log buffers
func (h *WebSocketHandler) startLogBufferManager() {
	ticker := time.NewTicker(h.config.BufferCleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			h.cleanupLogBuffers()
		case <-h.ctx.Done():
			return
		}
	}
}

// checkConnectionHealth checks and cleans up unhealthy connections
func (h *WebSocketHandler) checkConnectionHealth() {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	now := time.Now()
	for conn, client := range h.clients {
		if now.Sub(client.LastActive) > client.Timeout {
			slog.Info("Connection timeout, closing", slog.String("client", client.ID))
			go h.cleanupClientConnection(conn)
		}
	}
}

// cleanupLogBuffers cleans up old log buffers
func (h *WebSocketHandler) cleanupLogBuffers() {
	// This method would be implemented if we had log buffer storage
	// For now, it's a placeholder
	slog.Debug("Log buffer cleanup completed")
}

// sendHistoricalLogs sends historical logs to a client
func (h *WebSocketHandler) sendHistoricalLogs(conn *websocket.Conn, targetType, targetID string, logLevels []string) {
	var logs []common.LogEntry

	// Get historical logs based on target type
	switch targetType {
	case "process":
		if h.processHandler != nil {
			logs = h.processHandler.GetHistoricalLogs(targetID, logLevels)
		}
	case "session":
		if h.sessionHandler != nil {
			logs = h.sessionHandler.GetHistoricalLogs(targetID, logLevels)
		}
	}

	// Send logs in batches to avoid overwhelming the client
	batchSize := 100
	for i := 0; i < len(logs); i += batchSize {
		end := i + batchSize
		if end > len(logs) {
			end = len(logs)
		}

		batch := logs[i:end]
		for _, log := range batch {
			message := common.LogMessage{
				Type:      "log",
				DataType:  targetType,
				TargetID:  targetID,
				Log:       log,
				Sequence:  0,
				IsHistory: true,
			}

			if err := h.sendJSON(conn, message); err != nil {
				slog.Error("Failed to send historical log", slog.String("error", err.Error()))
				return
			}
		}

		// Small delay between batches
		time.Sleep(10 * time.Millisecond)
	}
}

// sendError sends an error message over WebSocket
func (h *WebSocketHandler) sendError(conn *websocket.Conn, message string, code string) error {
	errorMsg := common.ErrorResponse{
		Error:     message,
		Code:      code,
		Timestamp: time.Now().Unix(),
	}
	return h.sendJSON(conn, errorMsg)
}

// sendJSON sends a JSON response over WebSocket
func (h *WebSocketHandler) sendJSON(conn *websocket.Conn, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, data)
}
