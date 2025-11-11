package file

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/labring/devbox-sdk-server/pkg/config"
)

func TestMoveFile(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &config.Config{
		WorkspacePath: tmpDir,
		MaxFileSize:   1024 * 1024,
	}
	handler := NewFileHandler(cfg)

	tests := []struct {
		name           string
		setup          func() string
		request        MoveFileRequest
		expectedStatus int
		expectSuccess  bool
		cleanup        func()
	}{
		{
			name: "successful file move",
			setup: func() string {
				srcPath := filepath.Join(tmpDir, "source.txt")
				os.WriteFile(srcPath, []byte("test content"), 0644)
				return srcPath
			},
			request: MoveFileRequest{
				Source:      "source.txt",
				Destination: "destination.txt",
			},
			expectedStatus: http.StatusOK,
			expectSuccess:  true,
		},
		{
			name: "move with overwrite",
			setup: func() string {
				srcPath := filepath.Join(tmpDir, "source2.txt")
				dstPath := filepath.Join(tmpDir, "destination2.txt")
				os.WriteFile(srcPath, []byte("source content"), 0644)
				os.WriteFile(dstPath, []byte("dest content"), 0644)
				return srcPath
			},
			request: MoveFileRequest{
				Source:      "source2.txt",
				Destination: "destination2.txt",
				Overwrite:   true,
			},
			expectedStatus: http.StatusOK,
			expectSuccess:  true,
		},
		{
			name: "move without overwrite fails when dest exists",
			setup: func() string {
				srcPath := filepath.Join(tmpDir, "source3.txt")
				dstPath := filepath.Join(tmpDir, "destination3.txt")
				os.WriteFile(srcPath, []byte("source content"), 0644)
				os.WriteFile(dstPath, []byte("dest content"), 0644)
				return srcPath
			},
			request: MoveFileRequest{
				Source:      "source3.txt",
				Destination: "destination3.txt",
				Overwrite:   false,
			},
			expectedStatus: http.StatusBadRequest,
			expectSuccess:  false,
		},
		{
			name: "move non-existent source",
			setup: func() string {
				return ""
			},
			request: MoveFileRequest{
				Source:      "nonexistent.txt",
				Destination: "destination4.txt",
			},
			expectedStatus: http.StatusNotFound,
			expectSuccess:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()

			reqBody, _ := json.Marshal(tt.request)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/files/move", bytes.NewReader(reqBody))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.MoveFile(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.expectedStatus, w.Code, w.Body.String())
			}

			if tt.expectSuccess {
				var resp MoveFileResponse
				json.NewDecoder(w.Body).Decode(&resp)
				if !resp.Success {
					t.Error("Expected success to be true")
				}

				destPath := filepath.Join(tmpDir, tt.request.Destination)
				if _, err := os.Stat(destPath); err != nil {
					t.Errorf("Destination file should exist: %v", err)
				}

				srcPath := filepath.Join(tmpDir, tt.request.Source)
				if _, err := os.Stat(srcPath); err == nil {
					t.Error("Source file should not exist after move")
				}
			}
		})
	}
}

func TestRenameFile(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &config.Config{
		WorkspacePath: tmpDir,
		MaxFileSize:   1024 * 1024,
	}
	handler := NewFileHandler(cfg)

	tests := []struct {
		name           string
		setup          func()
		request        RenameFileRequest
		expectedStatus int
		expectSuccess  bool
	}{
		{
			name: "successful file rename",
			setup: func() {
				os.WriteFile(filepath.Join(tmpDir, "oldname.txt"), []byte("content"), 0644)
			},
			request: RenameFileRequest{
				OldPath: "oldname.txt",
				NewPath: "newname.txt",
			},
			expectedStatus: http.StatusOK,
			expectSuccess:  true,
		},
		{
			name: "rename to existing path fails",
			setup: func() {
				os.WriteFile(filepath.Join(tmpDir, "file1.txt"), []byte("content1"), 0644)
				os.WriteFile(filepath.Join(tmpDir, "file2.txt"), []byte("content2"), 0644)
			},
			request: RenameFileRequest{
				OldPath: "file1.txt",
				NewPath: "file2.txt",
			},
			expectedStatus: http.StatusBadRequest,
			expectSuccess:  false,
		},
		{
			name: "rename non-existent file",
			setup: func() {
			},
			request: RenameFileRequest{
				OldPath: "nonexistent.txt",
				NewPath: "newfile.txt",
			},
			expectedStatus: http.StatusNotFound,
			expectSuccess:  false,
		},
		{
			name: "rename directory",
			setup: func() {
				os.Mkdir(filepath.Join(tmpDir, "olddir"), 0755)
				os.WriteFile(filepath.Join(tmpDir, "olddir", "file.txt"), []byte("content"), 0644)
			},
			request: RenameFileRequest{
				OldPath: "olddir",
				NewPath: "newdir",
			},
			expectedStatus: http.StatusOK,
			expectSuccess:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()

			reqBody, _ := json.Marshal(tt.request)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/files/rename", bytes.NewReader(reqBody))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.RenameFile(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.expectedStatus, w.Code, w.Body.String())
			}

			if tt.expectSuccess {
				var resp RenameFileResponse
				json.NewDecoder(w.Body).Decode(&resp)
				if !resp.Success {
					t.Error("Expected success to be true")
				}

				newPath := filepath.Join(tmpDir, tt.request.NewPath)
				if _, err := os.Stat(newPath); err != nil {
					t.Errorf("New path should exist: %v", err)
				}

				oldPath := filepath.Join(tmpDir, tt.request.OldPath)
				if _, err := os.Stat(oldPath); err == nil {
					t.Error("Old path should not exist after rename")
				}
			}
		})
	}
}

func TestMoveFileInvalidJSON(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &config.Config{
		WorkspacePath: tmpDir,
		MaxFileSize:   1024 * 1024,
	}
	handler := NewFileHandler(cfg)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/files/move", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.MoveFile(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d for invalid JSON, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestRenameFileInvalidJSON(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &config.Config{
		WorkspacePath: tmpDir,
		MaxFileSize:   1024 * 1024,
	}
	handler := NewFileHandler(cfg)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/files/rename", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.RenameFile(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d for invalid JSON, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestMoveFileMissingPaths(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &config.Config{
		WorkspacePath: tmpDir,
		MaxFileSize:   1024 * 1024,
	}
	handler := NewFileHandler(cfg)

	tests := []struct {
		name    string
		request MoveFileRequest
	}{
		{
			name: "missing source",
			request: MoveFileRequest{
				Destination: "dest.txt",
			},
		},
		{
			name: "missing destination",
			request: MoveFileRequest{
				Source: "source.txt",
			},
		},
		{
			name:    "missing both",
			request: MoveFileRequest{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reqBody, _ := json.Marshal(tt.request)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/files/move", bytes.NewReader(reqBody))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.MoveFile(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("Expected status %d for missing paths, got %d", http.StatusBadRequest, w.Code)
			}
		})
	}
}

func TestRenameFileMissingPaths(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &config.Config{
		WorkspacePath: tmpDir,
		MaxFileSize:   1024 * 1024,
	}
	handler := NewFileHandler(cfg)

	tests := []struct {
		name    string
		request RenameFileRequest
	}{
		{
			name: "missing old path",
			request: RenameFileRequest{
				NewPath: "new.txt",
			},
		},
		{
			name: "missing new path",
			request: RenameFileRequest{
				OldPath: "old.txt",
			},
		},
		{
			name:    "missing both",
			request: RenameFileRequest{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reqBody, _ := json.Marshal(tt.request)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/files/rename", bytes.NewReader(reqBody))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.RenameFile(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("Expected status %d for missing paths, got %d", http.StatusBadRequest, w.Code)
			}
		})
	}
}

func init() {
	// Silence logger output during tests
	_ = io.Discard
}
