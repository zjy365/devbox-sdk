package file

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/labring/devbox-sdk-server/pkg/config"
)

func TestDownloadFiles(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &config.Config{
		WorkspacePath: tmpDir,
		MaxFileSize:   1024 * 1024,
	}
	handler := NewFileHandler(cfg)

	os.WriteFile(filepath.Join(tmpDir, "file1.txt"), []byte("content1"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "file2.txt"), []byte("content2"), 0644)
	os.Mkdir(filepath.Join(tmpDir, "testdir"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "testdir", "file3.txt"), []byte("content3"), 0644)

	tests := []struct {
		name           string
		request        DownloadFilesRequest
		expectedStatus int
		expectedType   string
		validateFunc   func(t *testing.T, body []byte)
	}{
		{
			name: "download single file",
			request: DownloadFilesRequest{
				Paths: []string{"file1.txt"},
			},
			expectedStatus: http.StatusOK,
			expectedType:   "application/octet-stream",
			validateFunc: func(t *testing.T, body []byte) {
				if string(body) != "content1" {
					t.Errorf("Expected content1, got %s", string(body))
				}
			},
		},
		{
			name: "download multiple files as tar.gz",
			request: DownloadFilesRequest{
				Paths: []string{"file1.txt", "file2.txt"},
			},
			expectedStatus: http.StatusOK,
			expectedType:   "application/gzip",
			validateFunc: func(t *testing.T, body []byte) {
				gzr, err := gzip.NewReader(bytes.NewReader(body))
				if err != nil {
					t.Fatalf("Failed to create gzip reader: %v", err)
				}
				defer gzr.Close()

				tr := tar.NewReader(gzr)
				fileCount := 0
				for {
					header, err := tr.Next()
					if err == io.EOF {
						break
					}
					if err != nil {
						t.Fatalf("Failed to read tar: %v", err)
					}
					fileCount++

					content, err := io.ReadAll(tr)
					if err != nil {
						t.Fatalf("Failed to read file content: %v", err)
					}

					if header.Name == "file1.txt" && string(content) != "content1" {
						t.Errorf("Wrong content for file1.txt")
					}
					if header.Name == "file2.txt" && string(content) != "content2" {
						t.Errorf("Wrong content for file2.txt")
					}
				}

				if fileCount != 2 {
					t.Errorf("Expected 2 files in archive, got %d", fileCount)
				}
			},
		},
		{
			name: "download directory as tar.gz",
			request: DownloadFilesRequest{
				Paths: []string{"testdir"},
			},
			expectedStatus: http.StatusOK,
			expectedType:   "application/gzip",
			validateFunc: func(t *testing.T, body []byte) {
				gzr, err := gzip.NewReader(bytes.NewReader(body))
				if err != nil {
					t.Fatalf("Failed to create gzip reader: %v", err)
				}
				defer gzr.Close()

				tr := tar.NewReader(gzr)
				foundFile := false
				for {
					header, err := tr.Next()
					if err == io.EOF {
						break
					}
					if err != nil {
						t.Fatalf("Failed to read tar: %v", err)
					}

					if filepath.Base(header.Name) == "file3.txt" {
						foundFile = true
						content, _ := io.ReadAll(tr)
						if string(content) != "content3" {
							t.Errorf("Wrong content for file3.txt")
						}
					}
				}

				if !foundFile {
					t.Error("file3.txt not found in archive")
				}
			},
		},
		{
			name: "download non-existent file",
			request: DownloadFilesRequest{
				Paths: []string{"nonexistent.txt"},
			},
			expectedStatus: http.StatusNotFound,
		},
		{
			name: "download with empty paths",
			request: DownloadFilesRequest{
				Paths: []string{},
			},
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reqBody, _ := json.Marshal(tt.request)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/files/download", bytes.NewReader(reqBody))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.DownloadFiles(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.expectedStatus, w.Code, w.Body.String())
			}

			if tt.expectedStatus == http.StatusOK {
				contentType := w.Header().Get("Content-Type")
				if contentType != tt.expectedType {
					t.Errorf("Expected content type %s, got %s", tt.expectedType, contentType)
				}

				if tt.validateFunc != nil {
					tt.validateFunc(t, w.Body.Bytes())
				}
			}
		})
	}
}

func TestDownloadFilesInvalidJSON(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &config.Config{
		WorkspacePath: tmpDir,
		MaxFileSize:   1024 * 1024,
	}
	handler := NewFileHandler(cfg)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/files/download", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.DownloadFiles(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d for invalid JSON, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestDownloadMixedFilesAndDirectories(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &config.Config{
		WorkspacePath: tmpDir,
		MaxFileSize:   1024 * 1024,
	}
	handler := NewFileHandler(cfg)

	os.WriteFile(filepath.Join(tmpDir, "single.txt"), []byte("single content"), 0644)
	os.Mkdir(filepath.Join(tmpDir, "mixdir"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "mixdir", "nested.txt"), []byte("nested content"), 0644)

	req := DownloadFilesRequest{
		Paths: []string{"single.txt", "mixdir"},
	}

	reqBody, _ := json.Marshal(req)
	httpReq := httptest.NewRequest(http.MethodPost, "/api/v1/files/download", bytes.NewReader(reqBody))
	httpReq.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.DownloadFiles(w, httpReq)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	if w.Header().Get("Content-Type") != "application/gzip" {
		t.Errorf("Expected gzip content type for mixed download")
	}

	gzr, err := gzip.NewReader(w.Body)
	if err != nil {
		t.Fatalf("Failed to create gzip reader: %v", err)
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)
	fileCount := 0
	foundSingle := false
	foundNested := false

	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("Failed to read tar: %v", err)
		}
		fileCount++

		if header.Name == "single.txt" {
			foundSingle = true
		}
		if filepath.Base(header.Name) == "nested.txt" {
			foundNested = true
		}
	}

	if !foundSingle {
		t.Error("single.txt not found in archive")
	}
	if !foundNested {
		t.Error("nested.txt not found in archive")
	}
}
