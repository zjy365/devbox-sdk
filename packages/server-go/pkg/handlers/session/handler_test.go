package session

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestNewSessionHandler(t *testing.T) {
	t.Run("successful handler creation", func(t *testing.T) {
		handler := NewSessionHandler()

		assert.NotNil(t, handler, "handler should not be nil")
		assert.NotNil(t, handler.sessions, "sessions map should be initialized")
		assert.Empty(t, handler.sessions, "sessions map should be empty initially")
	})

	t.Run("multiple handlers are independent", func(t *testing.T) {
		h1 := NewSessionHandler()
		h2 := NewSessionHandler()

		// Verify sessions maps are independent
		h1.sessions["test"] = &SessionInfo{ID: "test"}
		assert.Empty(t, h2.sessions, "second handler's sessions map should remain empty")
		delete(h1.sessions, "test")
	})
}

func TestSessionHandler_ConcurrentAccess(t *testing.T) {
	handler := createTestSessionHandler(t)

	t.Run("concurrent session creation", func(t *testing.T) {
		const numSessions = 10
		sessionIDs := make([]string, 0, numSessions)
		var mutex sync.Mutex

		var wg sync.WaitGroup
		for i := 0; i < numSessions; i++ {
			wg.Add(1)
			go func(index int) {
				defer wg.Done()

				req := CreateSessionRequest{
					Shell: &[]string{"/bin/bash"}[0],
				}

				response, _ := createTestSession(t, handler, req)

				mutex.Lock()
				sessionIDs = append(sessionIDs, response.SessionID)
				mutex.Unlock()
			}(i)
		}

		wg.Wait()

		// Verify all sessions were created
		assert.Len(t, sessionIDs, numSessions, "all sessions should be created")

		// Verify all session IDs are unique
		seenIDs := make(map[string]bool)
		for _, id := range sessionIDs {
			assert.False(t, seenIDs[id], "session ID should be unique: %s", id)
			seenIDs[id] = true
		}
	})

	t.Run("concurrent session access", func(t *testing.T) {
		// Create a session first
		req := CreateSessionRequest{}
		_, sessionID := createTestSession(t, handler, req)

		// Wait for session to be ready
		waitForSessionReady(t, handler, sessionID, 2*time.Second)

		var wg sync.WaitGroup
		const numReaders = 5

		// Start multiple goroutines reading the session
		for i := 0; i < numReaders; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()

				handler.mutex.RLock()
				sessionInfo, exists := handler.sessions[sessionID]
				handler.mutex.RUnlock()

				assert.True(t, exists, "session should exist")
				assert.NotNil(t, sessionInfo, "session info should not be nil")
				assert.Equal(t, sessionID, sessionInfo.ID, "session ID should match")
			}()
		}

		wg.Wait()
	})
}

func TestSessionHandler_TypeAliases(t *testing.T) {
	t.Run("type aliases should work correctly", func(t *testing.T) {
		// Test Handler alias
		handler := NewSessionHandler()
		assert.NotNil(t, handler, "Handler alias should work")

		// Test NewHandler alias
		handler2 := NewHandler()
		assert.NotNil(t, handler2, "NewHandler alias should work")
		assert.IsType(t, &SessionHandler{}, handler2, "NewHandler should return SessionHandler")
	})

	t.Run("SessionInfo structure is valid", func(t *testing.T) {
		// Test that SessionInfo can be properly initialized with all fields
		sessionInfo := &SessionInfo{
			ID:     "test-session",
			Shell:  "/bin/bash",
			Cwd:    "/tmp",
			Env:    map[string]string{"TEST": "value"},
			Status: "active",
			Active: true,
			Logs:   []string{},
		}

		assert.Equal(t, "test-session", sessionInfo.ID)
		assert.Equal(t, "/bin/bash", sessionInfo.Shell)
		assert.Equal(t, "/tmp", sessionInfo.Cwd)
		assert.Equal(t, "value", sessionInfo.Env["TEST"])
		assert.Equal(t, "active", sessionInfo.Status)
		assert.True(t, sessionInfo.Active)
		assert.Empty(t, sessionInfo.Logs)
	})
}
