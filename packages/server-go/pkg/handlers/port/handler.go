package port

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/monitor"
)

type PortHandler struct {
	monitor *monitor.PortMonitor
}

type PortsResponse struct {
	Success       bool  `json:"success"`
	Ports         []int `json:"ports"`
	LastUpdatedAt int64 `json:"lastUpdatedAt"`
}

func NewPortHandler() *PortHandler {
	return &PortHandler{
		monitor: monitor.NewPortMonitor(1 * time.Second),
	}
}

func (h *PortHandler) GetPorts(w http.ResponseWriter, r *http.Request) {
	ports, lastUpdated := h.monitor.GetPorts()

	response := PortsResponse{
		Success:       true,
		Ports:         ports,
		LastUpdatedAt: lastUpdated.Unix(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
