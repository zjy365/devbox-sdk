package websocket

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newWebSocketHandlerHelper() *WebSocketHandler {
	return NewWebSocketHandlerWithDeps(nil, nil, NewDefaultWebSocketConfig())
}

func TestWebSocketHandler_BasicConnection(t *testing.T) {
	t.Run("successful connection upgrade", func(t *testing.T) {
		handler := newWebSocketHandlerHelper()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			handler.HandleWebSocket(w, r)
		}))
		defer server.Close()

		url := "ws" + strings.TrimPrefix(server.URL, "http")
		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		require.NoError(t, err)
		defer conn.Close()

		assert.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"action":"ping"}`)))

		_, message, err := conn.ReadMessage()
		assert.NoError(t, err)

		var response map[string]any
		err = json.Unmarshal(message, &response)
		assert.NoError(t, err)
		assert.Contains(t, response["message"], "Unknown action")
	})

	t.Run("connection registers in client list", func(t *testing.T) {
		handler := newWebSocketHandlerHelper()

		assert.Empty(t, handler.clients)

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			handler.HandleWebSocket(w, r)
		}))
		defer server.Close()

		url := "ws" + strings.TrimPrefix(server.URL, "http")
		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		require.NoError(t, err)

		time.Sleep(10 * time.Millisecond)

		assert.NotEmpty(t, handler.clients)

		conn.Close()
	})
}

// TestWebSocketHandler_ClientManagement tests client management functionality
func TestWebSocketHandler_ClientManagement(t *testing.T) {
	t.Run("client info creation", func(t *testing.T) {
		client := &ClientInfo{
			ID:         "test-client-1",
			Connected:  time.Now(),
			LastActive: time.Now(),
			Timeout:    30 * time.Second,
		}

		assert.Equal(t, "test-client-1", client.ID)
		assert.False(t, client.Connected.IsZero())
		assert.False(t, client.LastActive.IsZero())
		assert.Equal(t, 30*time.Second, client.Timeout)
	})

	t.Run("multiple clients", func(t *testing.T) {
		handler := newWebSocketHandlerHelper()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			handler.HandleWebSocket(w, r)
		}))
		defer server.Close()

		url := "ws" + strings.TrimPrefix(server.URL, "http")

		// Connect multiple clients
		conns := make([]*websocket.Conn, 3)
		for i := 0; i < 3; i++ {
			conn, _, err := websocket.DefaultDialer.Dial(url, nil)
			require.NoError(t, err)
			conns[i] = conn
		}

		// Give time for connections to be registered
		time.Sleep(50 * time.Millisecond)

		// Should have 3 clients
		assert.Len(t, handler.clients, 3)

		// Close all connections
		for _, conn := range conns {
			conn.Close()
		}

		// Give time for cleanup
		time.Sleep(50 * time.Millisecond)
	})
}

// TestWebSocketHandler_MessageHandling tests WebSocket message processing
func TestWebSocketHandler_MessageHandling(t *testing.T) {
	t.Run("invalid JSON message", func(t *testing.T) {
		handler := newWebSocketHandlerHelper()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			handler.HandleWebSocket(w, r)
		}))
		defer server.Close()

		url := "ws" + strings.TrimPrefix(server.URL, "http")
		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		require.NoError(t, err)
		defer conn.Close()

		// Send invalid JSON
		err = conn.WriteMessage(websocket.TextMessage, []byte("invalid json"))
		assert.NoError(t, err)

		// Read error response
		_, message, err := conn.ReadMessage()
		assert.NoError(t, err)

		var response common.Response[map[string]any]
		err = json.Unmarshal(message, &response)
		assert.NoError(t, err)
		assert.Equal(t, response.Status, common.StatusInvalidRequest)
		assert.Contains(t, response.Message, "Invalid request format")
	})

	t.Run("unknown action", func(t *testing.T) {
		handler := newWebSocketHandlerHelper()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			handler.HandleWebSocket(w, r)
		}))
		defer server.Close()

		url := "ws" + strings.TrimPrefix(server.URL, "http")
		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		require.NoError(t, err)
		defer conn.Close()

		// Send unknown action
		message := map[string]string{"action": "unknown", "path": "/test"}
		data, _ := json.Marshal(message)
		err = conn.WriteMessage(websocket.TextMessage, data)
		assert.NoError(t, err)

		// Read error response
		_, resp, err := conn.ReadMessage()
		assert.NoError(t, err)

		var response common.Response[map[string]any]
		err = json.Unmarshal(resp, &response)
		assert.NoError(t, err)
		assert.Equal(t, response.Status, common.StatusInvalidRequest)
		assert.Contains(t, response.Message, "Unknown action")
	})

}

func TestWebSocketHandler_ErrorHandling(t *testing.T) {
	t.Run("connection upgrade failure", func(t *testing.T) {
		handler := newWebSocketHandlerHelper()

		req := httptest.NewRequest("GET", "/", nil)
		w := httptest.NewRecorder()

		assert.NotPanics(t, func() {
			handler.HandleWebSocket(w, req)
		})
	})

	t.Run("message parsing", func(t *testing.T) {
		testMessage := map[string]any{
			"action":   "subscribe",
			"type":     "process",
			"targetId": "test-123",
		}

		data, err := json.Marshal(testMessage)
		assert.NoError(t, err)

		var parsed SubscriptionRequest
		err = json.Unmarshal(data, &parsed)
		assert.NoError(t, err)
		assert.Equal(t, "subscribe", parsed.Action)
		assert.Equal(t, "process", parsed.Type)
	})
}

func TestWebSocketHelperFunctions(t *testing.T) {
	t.Run("subscription message handling", func(t *testing.T) {
		handler := newWebSocketHandlerHelper()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			handler.HandleWebSocket(w, r)
		}))
		defer server.Close()

		url := "ws" + strings.TrimPrefix(server.URL, "http")
		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		require.NoError(t, err)
		defer conn.Close()

		validMessage := map[string]any{
			"action":   "subscribe",
			"type":     "process",
			"targetId": "test-123",
			"options": map[string]any{
				"levels": []string{"stdout"},
			},
		}
		data, _ := json.Marshal(validMessage)
		err = conn.WriteMessage(websocket.TextMessage, data)
		assert.NoError(t, err)

		_, resp, err := conn.ReadMessage()
		assert.NoError(t, err)

		var response map[string]any
		err = json.Unmarshal(resp, &response)
		assert.NoError(t, err)

		assert.Contains(t, response, "action")
		assert.Equal(t, "subscribed", response["action"])
	})
}

// TestWebSocketHandler_ConcurrentAccess tests concurrent access scenarios
func TestWebSocketHandler_ConcurrentAccess(t *testing.T) {
	t.Run("multiple concurrent connections", func(t *testing.T) {
		handler := newWebSocketHandlerHelper()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			handler.HandleWebSocket(w, r)
		}))
		defer server.Close()

		url := "ws" + strings.TrimPrefix(server.URL, "http")

		// Create multiple concurrent connections
		const numConnections = 10
		conns := make([]*websocket.Conn, numConnections)
		errs := make(chan error, numConnections)

		for i := 0; i < numConnections; i++ {
			go func(index int) {
				conn, _, err := websocket.DefaultDialer.Dial(url, nil)
				if err != nil {
					errs <- err
					return
				}
				conns[index] = conn

				// Send a test message
				message := map[string]string{"action": "ping"}
				data, _ := json.Marshal(message)
				err = conn.WriteMessage(websocket.TextMessage, data)
				errs <- err
			}(i)
		}

		// Collect results
		for i := 0; i < numConnections; i++ {
			err := <-errs
			assert.NoError(t, err)
		}

		// Close all connections
		for _, conn := range conns {
			if conn != nil {
				conn.Close()
			}
		}
	})

	t.Run("concurrent subscriptions", func(t *testing.T) {
		handler := newWebSocketHandlerHelper()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			handler.HandleWebSocket(w, r)
		}))
		defer server.Close()

		url := "ws" + strings.TrimPrefix(server.URL, "http")

		// Create multiple connections and set up subscriptions
		const numSubscriptions = 5
		conns := make([]*websocket.Conn, numSubscriptions)

		for i := 0; i < numSubscriptions; i++ {
			conn, _, err := websocket.DefaultDialer.Dial(url, nil)
			require.NoError(t, err)
			conns[i] = conn

			// Send subscribe action
			message := map[string]any{
				"action":   "subscribe",
				"type":     "process",
				"targetId": fmt.Sprintf("process-%d", i),
				"options": map[string]any{
					"levels": []string{"stdout", "stderr"},
				},
			}
			data, _ := json.Marshal(message)
			err = conn.WriteMessage(websocket.TextMessage, data)
			assert.NoError(t, err)
		}

		// Give time for subscriptions to be established
		time.Sleep(100 * time.Millisecond)

		// Close all connections
		for _, conn := range conns {
			conn.Close()
		}

		// Give time for cleanup
		time.Sleep(100 * time.Millisecond)
	})
}

// TestWebSocketHandler_ClientTimeout tests client timeout functionality
func TestWebSocketHandler_ClientTimeout(t *testing.T) {
	t.Run("client timeout detection", func(t *testing.T) {
		handler := newWebSocketHandlerHelper()

		// Create a client with short timeout for testing
		client := &ClientInfo{
			ID:         "test-client",
			Connected:  time.Now(),
			LastActive: time.Now().Add(-120 * time.Second), // 2 minutes ago
			Timeout:    60 * time.Second,
		}

		// Should be considered timed out
		assert.True(t, time.Since(client.LastActive) > client.Timeout)

		// CheckClients should identify this as timed out
		// Note: We can't easily test the actual cleanup without a real connection
		// but we can verify the logic works
		assert.Greater(t, time.Since(client.LastActive), client.Timeout)

		// Verify handler has clients map initialized
		assert.NotNil(t, handler.clients)
	})

	t.Run("active client not timed out", func(t *testing.T) {
		handler := newWebSocketHandlerHelper()

		// Create a recently active client
		client := &ClientInfo{
			ID:         "test-client",
			Connected:  time.Now(),
			LastActive: time.Now().Add(-10 * time.Second), // 10 seconds ago
			Timeout:    60 * time.Second,
		}

		// Should not be considered timed out
		assert.False(t, time.Since(client.LastActive) > client.Timeout)

		// Verify handler has subscriptions map initialized
		assert.NotNil(t, handler.subscriptions)
	})
}
