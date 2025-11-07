package process

import (
	"fmt"
	"net/http"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/errors"
	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
)

// Process operation response types
type GetProcessStatusResponse struct {
	common.Response
	ProcessID string `json:"processId"`
	PID       int    `json:"pid"`
	Status    string `json:"status"`
	StartAt   string `json:"startAt"`
}

type ListProcessesResponse struct {
	common.Response
	Processes []ProcessInfoResponse `json:"processes"`
}

type GetProcessLogsResponse struct {
	common.Response
	ProcessID string   `json:"processId"`
	Logs      []string `json:"logs"`
}

type ProcessInfoResponse struct {
	ID        string `json:"id"`
	PID       int    `json:"pid"`
	Command   string `json:"command"`
	Status    string `json:"status"`
	StartTime int64  `json:"startTime"`
	EndTime   *int64 `json:"endTime,omitempty"`
	ExitCode  *int   `json:"exitCode,omitempty"`
}

// GetProcessStatus handles process status queries
func (h *ProcessHandler) GetProcessStatus(w http.ResponseWriter, r *http.Request) {
	processID := r.URL.Query().Get("id")
	if processID == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Process ID is required"))
		return
	}

	processInfo, err := h.getProcess(processID)
	if err != nil {
		if apiErr, ok := err.(*errors.APIError); ok {
			errors.WriteErrorResponse(w, apiErr)
		} else {
			errors.WriteErrorResponse(w, errors.NewInternalError(err.Error()))
		}
		return
	}

	common.WriteJSONResponse(w, GetProcessStatusResponse{
		Response:  common.Response{Success: true},
		ProcessID: processID,
		PID:       processInfo.Cmd.Process.Pid,
		Status:    processInfo.Status,
		StartAt:   processInfo.StartAt.Truncate(time.Second).Format(time.RFC3339),
	})
}

// KillProcess handles process termination
func (h *ProcessHandler) KillProcess(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	processID := query.Get("id")
	if processID == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Process ID is required"))
		return
	}

	signalStr := query.Get("signal")
	signal, err := h.parseSignal(signalStr)
	if err != nil {
		if apiErr, ok := err.(*errors.APIError); ok {
			errors.WriteErrorResponse(w, apiErr)
		} else {
			errors.WriteErrorResponse(w, errors.NewInvalidRequestError(err.Error()))
		}
		return
	}

	processInfo, err := h.getProcess(processID)
	if err != nil {
		if apiErr, ok := err.(*errors.APIError); ok {
			errors.WriteErrorResponse(w, apiErr)
		} else {
			errors.WriteErrorResponse(w, errors.NewInternalError(err.Error()))
		}
		return
	}

	if processInfo.Status != "running" {
		errors.WriteErrorResponse(w, errors.NewAPIError(errors.ErrorTypeConflict, "Process is not running", http.StatusConflict))
		return
	}

	if err := processInfo.Cmd.Process.Signal(signal); err != nil {
		errors.WriteErrorResponse(w, errors.NewInternalError(fmt.Sprintf("Failed to send signal: %v", err)))
		return
	}

	common.WriteJSONResponse(w, common.Response{
		Success: true,
	})
}

// ListProcesses handles process listing
func (h *ProcessHandler) ListProcesses(w http.ResponseWriter, r *http.Request) {
	h.mutex.RLock()
	processes := make([]ProcessInfoResponse, 0, len(h.processes))
	for id, info := range h.processes {
		processes = append(processes, ProcessInfoResponse{
			ID:        id,
			PID:       info.Cmd.Process.Pid,
			Command:   info.Cmd.Path,
			Status:    info.Status,
			StartTime: info.StartAt.Unix(),
		})
	}
	h.mutex.RUnlock()

	common.WriteJSONResponse(w, ListProcessesResponse{
		Response:  common.Response{Success: true},
		Processes: processes,
	})
}

// GetProcessLogs handles process log retrieval
func (h *ProcessHandler) GetProcessLogs(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	processID := query.Get("id")
	if processID == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Process ID is required"))
		return
	}

	processInfo, err := h.getProcess(processID)
	if err != nil {
		if apiErr, ok := err.(*errors.APIError); ok {
			errors.WriteErrorResponse(w, apiErr)
		} else {
			errors.WriteErrorResponse(w, errors.NewInternalError(err.Error()))
		}
		return
	}

	// Check if streaming is requested
	stream := query.Get("stream") == "true"
	if stream {
		h.streamLogs(w, processID)
		return
	}

	// Return static logs
	processInfo.LogMux.RLock()
	logs := make([]string, len(processInfo.Logs))
	copy(logs, processInfo.Logs)
	processInfo.LogMux.RUnlock()

	common.WriteJSONResponse(w, GetProcessLogsResponse{
		Response: common.Response{
			Success: true,
		},
		ProcessID: processID,
		Logs:      logs,
	})
}
