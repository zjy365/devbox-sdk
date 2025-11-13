package process

import (
	"net/http"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/labring/devbox-sdk-server/pkg/router"
)

// Process operation response types
type GetProcessStatusResponse struct {
	ProcessID     string `json:"processId"`
	PID           int    `json:"pid"`
	ProcessStatus string `json:"processStatus"`
	StartedAt     int64  `json:"startedAt"`
}

type ListProcessesResponse struct {
	Processes []ProcessInfoResponse `json:"processes"`
}

type GetProcessLogsResponse struct {
	ProcessID string   `json:"processId"`
	Logs      []string `json:"logs"`
}

type ProcessInfoResponse struct {
	ID        string `json:"id"`
	PID       int    `json:"pid"`
	Command   string `json:"command"`
	Status    string `json:"Status"`
	StartTime int64  `json:"startTime"`
	EndTime   *int64 `json:"endTime,omitempty"`
	ExitCode  *int   `json:"exitCode,omitempty"`
}

// GetProcessStatus handles process status queries
func (h *ProcessHandler) GetProcessStatus(w http.ResponseWriter, r *http.Request) {
	processID := router.Param(r, "id")
	if processID == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Process ID is required")
		return
	}

	processInfo, err := h.getProcess(processID)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusNotFound, "Process not found: %s", processID)
		return
	}

	response := GetProcessStatusResponse{
		ProcessID:     processID,
		PID:           processInfo.Cmd.Process.Pid,
		ProcessStatus: processInfo.Status,
		StartedAt:     processInfo.StartAt.Unix(),
	}

	common.WriteSuccessResponse(w, response)
}

// KillProcess handles process termination
func (h *ProcessHandler) KillProcess(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	processID := router.Param(r, "id")
	if processID == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Process ID is required")
		return
	}

	signalStr := query.Get("signal")
	signal, err := h.parseSignal(signalStr)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "%s", err.Error())
		return
	}

	processInfo, err := h.getProcess(processID)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusNotFound, "Process not found: %s", processID)
		return
	}

	if processInfo.Status != "running" {
		common.WriteErrorResponse(w, common.StatusConflict, "Process is not running")
		return
	}

	if err := processInfo.Cmd.Process.Signal(signal); err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to send signal: %v", err)
		return
	}

	common.WriteSuccessResponse(w, struct{}{})
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

	response := ListProcessesResponse{
		Processes: processes,
	}

	common.WriteSuccessResponse(w, response)
}

// GetProcessLogs handles process log retrieval
func (h *ProcessHandler) GetProcessLogs(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	processID := router.Param(r, "id")
	if processID == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Process ID is required")
		return
	}

	processInfo, err := h.getProcess(processID)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusNotFound, "Process not found: %s", processID)
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

	response := GetProcessLogsResponse{
		ProcessID: processID,
		Logs:      logs,
	}

	common.WriteSuccessResponse(w, response)
}
