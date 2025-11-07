package process

import (
	"syscall"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseSignal(t *testing.T) {
	handler := createTestProcessHandler(t)

	t.Run("parse valid signals", func(t *testing.T) {
		testCases := []struct {
			input    string
			expected syscall.Signal
		}{
			{"", syscall.SIGTERM},
			{"SIGTERM", syscall.SIGTERM},
			{"TERM", syscall.SIGTERM},
			{"SIGKILL", syscall.SIGKILL},
			{"KILL", syscall.SIGKILL},
			{"SIGINT", syscall.SIGINT},
			{"INT", syscall.SIGINT},
		}

		for _, tc := range testCases {
			signal, err := handler.parseSignal(tc.input)
			assert.NoError(t, err)
			assert.Equal(t, tc.expected, signal)
		}
	})

	t.Run("parse invalid signal", func(t *testing.T) {
		_, err := handler.parseSignal("INVALID")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "Invalid signal")
	})
}

func TestGetProcess(t *testing.T) {
	handler := createTestProcessHandler(t)

	t.Run("get existing process", func(t *testing.T) {
		// Start a test process
		req := ProcessExecRequest{
			Command: "sleep",
			Args:    []string{"1"},
		}
		execResponse, processID := startTestProcess(t, handler, req)

		// Test getProcess
		processInfo, err := handler.getProcess(processID)
		assert.NoError(t, err)
		assert.NotNil(t, processInfo)
		assert.Equal(t, processID, processInfo.ID)
		assert.Equal(t, execResponse.PID, processInfo.Cmd.Process.Pid)
	})

	t.Run("get non-existent process", func(t *testing.T) {
		_, err := handler.getProcess("non-existent")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})
}

func TestFormatLog(t *testing.T) {
	handler := createTestProcessHandler(t)

	t.Run("format log with timestamp", func(t *testing.T) {
		log := handler.formatLog("stdout", "test message")
		assert.Contains(t, log, "[")
		assert.Contains(t, log, "]")
		assert.Contains(t, log, "stdout: test message")
	})
}
