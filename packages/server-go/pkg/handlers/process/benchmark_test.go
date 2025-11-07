package process

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"
)

// Benchmark tests
func BenchmarkProcessHandler_ExecProcess(b *testing.B) {
	handler := NewProcessHandler()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := ProcessExecRequest{
			Command: "echo",
			Args:    []string{fmt.Sprintf("bench_%d", i)},
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.ExecProcess(w, httpReq)

		// Clean up the process immediately for benchmark
		var response ProcessExecResponse
		if err := json.Unmarshal(w.Body.Bytes(), &response); err == nil {
			handler.mutex.Lock()
			for id, info := range handler.processes {
				if info.Cmd.Process.Pid == response.PID {
					if info.Cmd.Process != nil {
						info.Cmd.Process.Kill()
					}
					delete(handler.processes, id)
					break
				}
			}
			handler.mutex.Unlock()
		}
	}
}

func BenchmarkProcessHandler_ListProcesses(b *testing.B) {
	handler := NewProcessHandler()

	// Start some processes for listing
	var pids []int
	for range 10 {
		req := ProcessExecRequest{
			Command: "sleep",
			Args:    []string{"10"}, // Long-running process
		}
		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/processes/exec", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()
		handler.ExecProcess(w, httpReq)

		var response ProcessExecResponse
		if err := json.Unmarshal(w.Body.Bytes(), &response); err == nil {
			pids = append(pids, response.PID)
		}
	}

	if len(pids) != 10 {
		b.Fatalf("Expected 10 processes, got %d", len(pids))
	}

	b.Cleanup(func() {
		// Clean up processes
		handler.mutex.Lock()
		for id, info := range handler.processes {
			if info.Cmd.Process != nil {
				info.Cmd.Process.Kill()
			}
			delete(handler.processes, id)
		}
		handler.mutex.Unlock()
	})

	for b.Loop() {
		httpReq := httptest.NewRequest("GET", "/api/v1/processes", nil)
		w := httptest.NewRecorder()
		handler.ListProcesses(w, httpReq)
	}
}
