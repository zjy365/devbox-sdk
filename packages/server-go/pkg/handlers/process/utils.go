package process

import (
	"fmt"
	"strings"
	"syscall"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/errors"
)

// getProcess retrieves process info by ID
func (h *ProcessHandler) getProcess(processID string) (*ProcessInfo, error) {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	processInfo, exists := h.processes[processID]
	if !exists {
		return nil, errors.NewProcessNotFoundError(processID)
	}
	return processInfo, nil
}

// parseSignal parses signal string to syscall.Signal
func (h *ProcessHandler) parseSignal(signalStr string) (syscall.Signal, error) {
	if signalStr == "" {
		return syscall.SIGTERM, nil
	}

	switch strings.ToUpper(signalStr) {
	case "SIGKILL", "KILL":
		return syscall.SIGKILL, nil
	case "SIGINT", "INT":
		return syscall.SIGINT, nil
	case "SIGTERM", "TERM":
		return syscall.SIGTERM, nil
	default:
		return 0, errors.NewInvalidRequestError(fmt.Sprintf("Invalid signal: %s", signalStr))
	}
}

// formatLog formats a log entry with timestamp
func (h *ProcessHandler) formatLog(source, message string) string {
	return fmt.Sprintf("[%s] %s: %s", time.Now().Format("2006-01-02 15:04:05"), source, message)
}
