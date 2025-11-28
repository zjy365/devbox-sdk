package monitor

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type PortMonitor struct {
	ports         []int
	mutex         sync.RWMutex
	lastUpdated   time.Time
	cacheTTL      time.Duration
	excludedPorts []int
}

func NewPortMonitor(cacheTTL time.Duration, excludedPorts []int) *PortMonitor {
	if cacheTTL <= 0 {
		cacheTTL = 1 * time.Second
	}

	return &PortMonitor{
		ports:         make([]int, 0),
		cacheTTL:      cacheTTL,
		excludedPorts: excludedPorts,
	}
}

func (pm *PortMonitor) GetPorts() ([]int, time.Time) {
	pm.mutex.RLock()
	cacheAge := time.Since(pm.lastUpdated)
	shouldRefresh := cacheAge > pm.cacheTTL
	pm.mutex.RUnlock()

	// Refresh if cache is stale
	if shouldRefresh {
		pm.Refresh()
	}

	pm.mutex.RLock()
	defer pm.mutex.RUnlock()

	result := make([]int, len(pm.ports))
	copy(result, pm.ports)
	return result, pm.lastUpdated
}

func (pm *PortMonitor) Refresh() {
	ports, err := pm.pollPorts()
	if err != nil {
		slog.Error("Failed to poll ports", slog.String("error", err.Error()))
		return
	}

	pm.mutex.Lock()
	pm.ports = ports
	pm.lastUpdated = time.Now()
	pm.mutex.Unlock()

	slog.Debug("Ports refreshed", slog.Int("count", len(ports)))
}

func (pm *PortMonitor) pollPorts() ([]int, error) {
	var ports []int
	files := []string{"/proc/net/tcp", "/proc/net/tcp6"}

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			continue
		}

		lines := strings.Split(string(content), "\n")
		// Skip header
		if len(lines) > 0 {
			lines = lines[1:]
		}

		for _, line := range lines {
			fields := strings.Fields(line)
			if len(fields) < 2 {
				continue
			}

			// local_address is field[1], format "IP:PORT"
			localAddr := fields[1]
			parts := strings.Split(localAddr, ":")
			if len(parts) != 2 {
				continue
			}

			ipHex := parts[0]
			portHex := parts[1]

			// Check for 0.0.0.0 or ::
			if ipHex == "00000000" || ipHex == "00000000000000000000000000000000" {
				port, err := strconv.ParseInt(portHex, 16, 64)
				if err == nil {
					ports = append(ports, int(port))
				}
			}
		}
	}

	result := make([]int, 0)
	seen := make(map[int]bool)

	for _, port := range ports {
		isExcluded := false
		for _, excluded := range pm.excludedPorts {
			if port == excluded {
				isExcluded = true
				break
			}
		}

		if !isExcluded && !seen[port] {
			result = append(result, port)
			seen[port] = true
		}
	}

	return result, nil
}
