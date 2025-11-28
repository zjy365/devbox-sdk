package monitor

import (
	"testing"
	"time"
)

func TestNewPortMonitor(t *testing.T) {
	tests := []struct {
		name     string
		cacheTTL time.Duration
		expected time.Duration
	}{
		{
			name:     "valid cache TTL",
			cacheTTL: 1 * time.Second,
			expected: 1 * time.Second,
		},
		{
			name:     "zero TTL defaults to 1s",
			cacheTTL: 0,
			expected: 1 * time.Second,
		},
		{
			name:     "negative TTL defaults to 1s",
			cacheTTL: -5 * time.Second,
			expected: 1 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pm := NewPortMonitor(tt.cacheTTL, nil)

			if pm.cacheTTL != tt.expected {
				t.Errorf("expected cache TTL %v, got %v", tt.expected, pm.cacheTTL)
			}

			if pm.ports == nil {
				t.Error("ports slice should be initialized")
			}
		})
	}
}

func TestPortMonitor_GetPorts_CacheBehavior(t *testing.T) {
	pm := NewPortMonitor(200*time.Millisecond, nil)

	// First call should refresh
	ports1, time1 := pm.GetPorts()
	if time1.IsZero() {
		t.Error("first call should set lastUpdated")
	}

	// Immediate second call should use cache
	ports2, time2 := pm.GetPorts()
	if !time2.Equal(time1) {
		t.Error("second call within TTL should use cached timestamp")
	}

	// Wait for cache to expire
	time.Sleep(250 * time.Millisecond)

	// Third call should refresh
	ports3, time3 := pm.GetPorts()
	if !time3.After(time2) {
		t.Error("call after TTL should refresh and update timestamp")
	}

	_ = ports1
	_ = ports2
	_ = ports3
}

func TestPortMonitor_GetPorts_DataIntegrity(t *testing.T) {
	pm := NewPortMonitor(1*time.Second, nil)

	ports, lastUpdated := pm.GetPorts()

	if ports == nil {
		t.Error("ports should not be nil")
	}

	if lastUpdated.IsZero() {
		t.Error("lastUpdated should not be zero after first call")
	}

	// Verify returned slice is a copy
	if len(ports) > 0 {
		originalFirst := ports[0]
		ports[0] = 99999
		ports2, _ := pm.GetPorts()
		if len(ports2) > 0 && ports2[0] == 99999 {
			t.Error("GetPorts should return a copy, not the original slice")
		}
		_ = originalFirst
	}
}

func TestPortMonitor_Refresh(t *testing.T) {
	pm := NewPortMonitor(1*time.Second, nil)

	// Manual refresh
	pm.Refresh()

	ports, lastUpdated := pm.GetPorts()

	if lastUpdated.IsZero() {
		t.Error("lastUpdated should be set after refresh")
	}

	if ports == nil {
		t.Error("ports should be initialized after refresh")
	}
}

func TestPortMonitor_PollPorts(t *testing.T) {
	pm := NewPortMonitor(1*time.Second, nil)

	ports, err := pm.pollPorts()

	if err != nil {
		t.Skipf("ss command not available or failed: %v", err)
	}

	if ports == nil {
		t.Error("ports should not be nil")
	}

	seen := make(map[int]bool)
	for _, port := range ports {
		if seen[port] {
			t.Errorf("duplicate port in results: %d", port)
		}
		seen[port] = true
	}
}

func TestPortMonitor_ConcurrentAccess(t *testing.T) {
	pm := NewPortMonitor(100*time.Millisecond, nil)

	done := make(chan bool)

	// Multiple goroutines reading
	for i := 0; i < 10; i++ {
		go func() {
			for j := 0; j < 50; j++ {
				pm.GetPorts()
			}
			done <- true
		}()
	}

	// Some goroutines refreshing
	for i := 0; i < 3; i++ {
		go func() {
			for j := 0; j < 20; j++ {
				pm.Refresh()
				time.Sleep(10 * time.Millisecond)
			}
			done <- true
		}()
	}

	for i := 0; i < 13; i++ {
		<-done
	}
}

func TestPortMonitor_ExcludedPorts(t *testing.T) {
	// First, get all ports to find one to exclude
	pm := NewPortMonitor(1*time.Second, nil)
	ports, _ := pm.GetPorts()

	if len(ports) == 0 {
		t.Skip("No ports found to test exclusion")
	}

	portToExclude := ports[0]

	// Create new monitor with exclusion
	pmExcluded := NewPortMonitor(1*time.Second, []int{portToExclude})

	// Force refresh
	pmExcluded.Refresh()

	portsExcluded, _ := pmExcluded.GetPorts()

	for _, p := range portsExcluded {
		if p == portToExclude {
			t.Errorf("Port %d should have been excluded", portToExclude)
		}
	}
}
