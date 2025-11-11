package monitor

import (
	"bytes"
	"log/slog"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

type PortMonitor struct {
	ports       []int
	mutex       sync.RWMutex
	lastUpdated time.Time
	cacheTTL    time.Duration
}

func NewPortMonitor(cacheTTL time.Duration) *PortMonitor {
	if cacheTTL <= 0 {
		cacheTTL = 1 * time.Second
	}

	return &PortMonitor{
		ports:    make([]int, 0),
		cacheTTL: cacheTTL,
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
	cmd := exec.Command("sh", "-c", `awk 'NR>1{split($2,a,":");ip=a[1];port=strtonum("0x"a[2]);if(ip=="00000000"||ip=="00000000000000000000000000000000")print port}' /proc/net/tcp /proc/net/tcp6`)

	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	if err := cmd.Run(); err != nil {
		return nil, err
	}

	ports := make([]int, 0)
	seen := make(map[int]bool)

	lines := strings.Split(stdout.String(), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		port, err := strconv.Atoi(line)
		if err != nil {
			slog.Warn("Failed to parse port", slog.String("line", line), slog.String("error", err.Error()))
			continue
		}

		if !seen[port] && port >= 3000 && port <= 9999 {
			ports = append(ports, port)
			seen[port] = true
		}
	}

	return ports, nil
}
