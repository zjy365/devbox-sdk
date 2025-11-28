package port

import (
	"net/http"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/labring/devbox-sdk-server/pkg/monitor"
)

type PortHandler struct {
	monitor *monitor.PortMonitor
}

func NewPortHandler(excludedPorts []int) *PortHandler {
	return &PortHandler{
		monitor: monitor.NewPortMonitor(1*time.Second, excludedPorts),
	}
}

type PortsResponse struct {
	Ports         []int `json:"ports"`
	LastUpdatedAt int64 `json:"lastUpdatedAt"`
}

func (h *PortHandler) GetPorts(w http.ResponseWriter, r *http.Request) {
	ports, lastUpdated := h.monitor.GetPorts()

	resp := &PortsResponse{
		Ports:         ports,
		LastUpdatedAt: lastUpdated.Unix(),
	}

	common.WriteSuccessResponse(w, resp)
}
