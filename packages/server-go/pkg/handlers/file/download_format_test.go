package file

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/labring/devbox-sdk-server/pkg/config"
)

func TestDownloadFormats(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &config.Config{
		WorkspacePath: tmpDir,
		MaxFileSize:   1024 * 1024,
	}
	handler := NewFileHandler(cfg)

	os.WriteFile(filepath.Join(tmpDir, "file1.txt"), []byte("content1"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "file2.txt"), []byte("content2"), 0644)

	tests := []struct {
		name         string
		request      DownloadFilesRequest
		acceptHeader string
		expectedType string
		validateFunc func(t *testing.T, contentType string, body []byte)
	}{
		{
			name: "explicit tar.gz format",
			request: DownloadFilesRequest{
				Paths: []string{"file1.txt", "file2.txt"},
			},
			expectedType: "application/gzip",
			validateFunc: func(t *testing.T, contentType string, body []byte) {
				gzr, err := gzip.NewReader(bytes.NewReader(body))
				if err != nil {
					t.Fatalf("Failed to create gzip reader: %v", err)
				}
				defer gzr.Close()

				tr := tar.NewReader(gzr)
				fileCount := 0
				for {
					_, err := tr.Next()
					if err == io.EOF {
						break
					}
					if err != nil {
						t.Fatalf("Failed to read tar: %v", err)
					}
					fileCount++
				}

				if fileCount != 2 {
					t.Errorf("Expected 2 files, got %d", fileCount)
				}
			},
		},
		{
			name: "explicit tar format (no compression)",
			request: DownloadFilesRequest{
				Paths: []string{"file1.txt", "file2.txt"},
			},
			expectedType: "application/x-tar",
			validateFunc: func(t *testing.T, contentType string, body []byte) {
				tr := tar.NewReader(bytes.NewReader(body))
				fileCount := 0
				for {
					_, err := tr.Next()
					if err == io.EOF {
						break
					}
					if err != nil {
						t.Fatalf("Failed to read tar: %v", err)
					}
					fileCount++
				}

				if fileCount != 2 {
					t.Errorf("Expected 2 files, got %d", fileCount)
				}
			},
		},
		{
			name: "explicit multipart format",
			request: DownloadFilesRequest{
				Paths: []string{"file1.txt", "file2.txt"},
			},
			expectedType: "multipart/mixed",
			validateFunc: func(t *testing.T, contentType string, body []byte) {
				validateMultipartResponse(t, contentType, body, 2)
			},
		},
		{
			name: "auto-detect tar.gz from Accept header",
			request: DownloadFilesRequest{
				Paths: []string{"file1.txt", "file2.txt"},
			},
			acceptHeader: "application/gzip",
			expectedType: "application/gzip",
			validateFunc: func(t *testing.T, contentType string, body []byte) {
				gzr, err := gzip.NewReader(bytes.NewReader(body))
				if err != nil {
					t.Fatalf("Failed to create gzip reader: %v", err)
				}
				defer gzr.Close()
			},
		},
		{
			name: "auto-detect tar from Accept header",
			request: DownloadFilesRequest{
				Paths: []string{"file1.txt", "file2.txt"},
			},
			acceptHeader: "application/x-tar",
			expectedType: "application/x-tar",
			validateFunc: func(t *testing.T, contentType string, body []byte) {
				tr := tar.NewReader(bytes.NewReader(body))
				_, err := tr.Next()
				if err != nil {
					t.Fatalf("Failed to read tar: %v", err)
				}
			},
		},
		{
			name: "auto-detect multipart from Accept header",
			request: DownloadFilesRequest{
				Paths: []string{"file1.txt", "file2.txt"},
			},
			acceptHeader: "multipart/mixed",
			expectedType: "multipart/mixed",
			validateFunc: func(t *testing.T, contentType string, body []byte) {
				validateMultipartResponse(t, contentType, body, 2)
			},
		},
		{
			name: "default to tar.gz when no format specified",
			request: DownloadFilesRequest{
				Paths: []string{"file1.txt", "file2.txt"},
			},
			expectedType: "application/gzip",
			validateFunc: func(t *testing.T, contentType string, body []byte) {
				gzr, err := gzip.NewReader(bytes.NewReader(body))
				if err != nil {
					t.Fatalf("Failed to create gzip reader: %v", err)
				}
				defer gzr.Close()
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reqBody, _ := json.Marshal(tt.request)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/files/download", bytes.NewReader(reqBody))
			req.Header.Set("Content-Type", "application/json")
			if tt.acceptHeader != "" {
				req.Header.Set("Accept", tt.acceptHeader)
			}
			w := httptest.NewRecorder()

			handler.DownloadFiles(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
			}

			contentType := w.Header().Get("Content-Type")
			if !strings.HasPrefix(contentType, tt.expectedType) {
				t.Errorf("Expected content type %s, got %s", tt.expectedType, contentType)
			}

			if tt.validateFunc != nil {
				tt.validateFunc(t, contentType, w.Body.Bytes())
			}
		})
	}
}

func TestMultipartDownloadWithDirectories(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &config.Config{
		WorkspacePath: tmpDir,
		MaxFileSize:   1024 * 1024,
	}
	handler := NewFileHandler(cfg)

	os.Mkdir(filepath.Join(tmpDir, "dir1"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "dir1", "nested.txt"), []byte("nested content"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "single.txt"), []byte("single content"), 0644)

	req := DownloadFilesRequest{
		Paths: []string{"dir1", "single.txt"},
	}

	reqBody, _ := json.Marshal(req)
	httpReq := httptest.NewRequest(http.MethodPost, "/api/v1/files/download", bytes.NewReader(reqBody))
	httpReq.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.DownloadFiles(w, httpReq)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", w.Code)
	}

	contentType := w.Header().Get("Content-Type")
	if !strings.HasPrefix(contentType, "multipart/mixed") {
		t.Fatalf("Expected multipart/mixed content type, got %s", contentType)
	}

	// Should have 2 files: dir1/nested.txt and single.txt
	validateMultipartResponse(t, contentType, w.Body.Bytes(), 2)
}

func TestFormatPriorityExplicitOverAccept(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &config.Config{
		WorkspacePath: tmpDir,
		MaxFileSize:   1024 * 1024,
	}
	handler := NewFileHandler(cfg)

	os.WriteFile(filepath.Join(tmpDir, "file1.txt"), []byte("content1"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "file2.txt"), []byte("content2"), 0644)

	// Request tar format explicitly, but Accept header says multipart
	req := DownloadFilesRequest{
		Paths: []string{"file1.txt", "file2.txt"},
	}

	reqBody, _ := json.Marshal(req)
	httpReq := httptest.NewRequest(http.MethodPost, "/api/v1/files/download", bytes.NewReader(reqBody))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "multipart/mixed")
	w := httptest.NewRecorder()

	handler.DownloadFiles(w, httpReq)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", w.Code)
	}

	// Should use explicit format (tar) not Accept header (multipart)
	contentType := w.Header().Get("Content-Type")
	if !strings.HasPrefix(contentType, "application/x-tar") {
		t.Errorf("Expected tar format to take priority, got %s", contentType)
	}
}

// validateMultipartResponse parses and validates a multipart/mixed response
func validateMultipartResponse(t *testing.T, contentType string, body []byte, expectedFiles int) {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		t.Fatalf("Failed to parse content type: %v", err)
	}

	boundary := params["boundary"]
	if boundary == "" {
		t.Fatal("No boundary found in content type")
	}

	reader := multipart.NewReader(bytes.NewReader(body), boundary)
	fileCount := 0

	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("Failed to read multipart part: %v", err)
		}

		fileCount++

		// Read part content to verify it's valid
		_, err = io.ReadAll(part)
		if err != nil {
			t.Fatalf("Failed to read part content: %v", err)
		}
	}

	if fileCount != expectedFiles {
		t.Errorf("Expected %d files in multipart, got %d", expectedFiles, fileCount)
	}
}
