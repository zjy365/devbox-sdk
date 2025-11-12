package file

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/labring/devbox-sdk-server/pkg/common"
	"github.com/labring/devbox-sdk-server/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Helper function to create test workspace
func createTestWorkspace(t *testing.T) string {
	tempDir := t.TempDir()

	// Ensure temp directory is clean (should already be empty, but let's be sure)
	entries, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatalf("Failed to read temp directory: %v", err)
	}

	if len(entries) > 0 {
		t.Logf("Warning: Temp directory not empty, has %d entries", len(entries))
	}

	return tempDir
}

// Helper function to create test file handler
func createTestFileHandler(t *testing.T) *FileHandler {
	testWorkspace := createTestWorkspace(t)

	cfg := &config.Config{
		WorkspacePath: testWorkspace,
		MaxFileSize:   1024 * 1024, // 1MB
		LogLevel:      slog.LevelError,
	}

	handler := NewFileHandler(cfg)

	// Register cleanup verification to ensure no files are left behind
	t.Cleanup(func() {
		verifyWorkspaceCleanup(t, testWorkspace)
	})

	return handler
}

// Add benchmark-specific helper that uses b.TempDir to avoid residuals
func createBenchmarkFileHandler(b *testing.B) *FileHandler {
	testWorkspace := b.TempDir()
	cfg := &config.Config{
		WorkspacePath: testWorkspace,
		MaxFileSize:   1024 * 1024,
		LogLevel:      slog.LevelError,
	}
	return NewFileHandler(cfg)
}

// Helper function to verify workspace cleanup
func verifyWorkspaceCleanup(t *testing.T, workspacePath string) {
	entries, err := os.ReadDir(workspacePath)
	if err != nil {
		t.Logf("Warning: Could not verify workspace cleanup: %v", err)
		return
	}

	if len(entries) > 0 {
		// Proactively remove any residual files/directories inside workspace
		for _, entry := range entries {
			_ = os.RemoveAll(filepath.Join(workspacePath, entry.Name()))
		}
		t.Logf("Workspace cleanup: removed %d residual entries", len(entries))
	}
}

func TestNewFileHandler(t *testing.T) {
	t.Run("successful handler creation", func(t *testing.T) {
		testWorkspace := createTestWorkspace(t)
		cfg := &config.Config{
			WorkspacePath: testWorkspace,
			MaxFileSize:   1024 * 1024,
		}

		handler := NewFileHandler(cfg)

		assert.NotNil(t, handler, "handler should not be nil")
		assert.Equal(t, cfg, handler.config, "config should be set")
	})
}

func TestWriteFile(t *testing.T) {
	handler := createTestFileHandler(t)

	t.Run("successful JSON write", func(t *testing.T) {
		req := WriteFileRequest{
			Path:    "test.txt",
			Content: "Hello, World!",
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[WriteFileResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Contains(t, response.Data.Path, "test.txt")
		assert.Equal(t, int64(len("Hello, World!")), response.Data.Size)

		content, err := os.ReadFile(response.Data.Path)
		require.NoError(t, err)
		assert.Equal(t, "Hello, World!", string(content))
	})

	t.Run("successful binary write", func(t *testing.T) {
		binaryData := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}

		httpReq := httptest.NewRequest("POST", "/api/v1/files/write?path=test.png", bytes.NewReader(binaryData))
		httpReq.Header.Set("Content-Type", "application/octet-stream")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[WriteFileResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, int64(len(binaryData)), response.Data.Size)

		content, err := os.ReadFile(response.Data.Path)
		require.NoError(t, err)
		assert.Equal(t, binaryData, content)
	})

	t.Run("successful multipart write", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		fileContent := []byte("Multipart content")
		part, err := writer.CreateFormFile("file", "test_multipart.txt")
		require.NoError(t, err)
		_, err = part.Write(fileContent)
		require.NoError(t, err)

		err = writer.WriteField("path", "multipart.txt")
		require.NoError(t, err)

		err = writer.Close()
		require.NoError(t, err)

		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", body)
		httpReq.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[WriteFileResponse]
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Contains(t, response.Data.Path, "multipart.txt")
		assert.Equal(t, int64(len(fileContent)), response.Data.Size)
	})

	t.Run("path traversal blocked", func(t *testing.T) {
		req := WriteFileRequest{
			Path:    "../../../etc/passwd",
			Content: "malicious",
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[WriteFileResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotEqual(t, common.StatusSuccess, response.Status)
	})

	t.Run("file size limit enforced", func(t *testing.T) {
		testWorkspace := createTestWorkspace(t)
		cfg := &config.Config{
			WorkspacePath: testWorkspace,
			MaxFileSize:   10,
		}
		smallHandler := NewFileHandler(cfg)

		req := WriteFileRequest{
			Path:    "large.txt",
			Content: strings.Repeat("x", 20),
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		smallHandler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[WriteFileResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotEqual(t, common.StatusSuccess, response.Status)
	})

	t.Run("invalid JSON request", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", strings.NewReader("invalid json"))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[WriteFileResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusInvalidRequest, response.Status)
		assert.Contains(t, response.Message, "Invalid JSON body")
	})
}

func TestReadFile(t *testing.T) {
	handler := createTestFileHandler(t)

	testFile := filepath.Join(handler.config.WorkspacePath, "readme.txt")
	testContent := "This is test content for reading"
	err := os.WriteFile(testFile, []byte(testContent), 0644)
	require.NoError(t, err)

	t.Run("successful file read via query parameter", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/read?path=readme.txt", nil)
		w := httptest.NewRecorder()

		handler.ReadFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, testContent, w.Body.String())
		assert.Equal(t, "text/plain; charset=utf-8", w.Header().Get("Content-Type"))
		assert.Equal(t, fmt.Sprintf("%d", len(testContent)), w.Header().Get("Content-Length"))
	})

	t.Run("missing path parameter", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/read", nil)
		w := httptest.NewRecorder()

		handler.ReadFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.NotEqual(t, common.StatusSuccess, response.Status)
	})

	t.Run("file not found", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/read?path=nonexistent.txt", nil)
		w := httptest.NewRecorder()

		handler.ReadFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusNotFound, response.Status)
		assert.Contains(t, response.Message, "not found")
	})

	t.Run("directory instead of file", func(t *testing.T) {
		testDir := filepath.Join(handler.config.WorkspacePath, "testdir")
		err := os.Mkdir(testDir, 0755)
		require.NoError(t, err)

		httpReq := httptest.NewRequest("GET", "/api/v1/files/read?path=testdir", nil)
		w := httptest.NewRecorder()

		handler.ReadFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response common.Response[struct{}]
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusInvalidRequest, response.Status)
		assert.Contains(t, response.Message, "directory")
	})
}

func TestDeleteFile(t *testing.T) {
	handler := createTestFileHandler(t)

	// Setup: Create test files
	testFile := filepath.Join(handler.config.WorkspacePath, "delete.txt")
	err := os.WriteFile(testFile, []byte("delete me"), 0644)
	require.NoError(t, err)

	testDir := filepath.Join(handler.config.WorkspacePath, "deletedir")
	err = os.Mkdir(testDir, 0755)
	require.NoError(t, err)

	subFile := filepath.Join(testDir, "sub.txt")
	err = os.WriteFile(subFile, []byte("sub file"), 0644)
	require.NoError(t, err)

	t.Run("successful file deletion", func(t *testing.T) {
		req := DeleteFileRequest{
			Path: "delete.txt",
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/delete", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.DeleteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)

		_, err = os.Stat(testFile)
		assert.True(t, os.IsNotExist(err))
	})

	t.Run("successful directory deletion (recursive)", func(t *testing.T) {
		req := DeleteFileRequest{
			Path:      "deletedir",
			Recursive: true,
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/delete", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.DeleteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)

		_, err = os.Stat(testDir)
		assert.True(t, os.IsNotExist(err))
	})

	t.Run("directory deletion without recursive flag", func(t *testing.T) {
		testDir2 := filepath.Join(handler.config.WorkspacePath, "deletedir2")
		err := os.Mkdir(testDir2, 0755)
		require.NoError(t, err)

		subFile := filepath.Join(testDir2, "sub.txt")
		err = os.WriteFile(subFile, []byte("content"), 0644)
		require.NoError(t, err)

		req := DeleteFileRequest{
			Path:      "deletedir2",
			Recursive: false,
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/delete", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.DeleteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response common.Response[struct{}]
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotEqual(t, common.StatusSuccess, response.Status)
		assert.Contains(t, response.Message, "Failed to delete")
	})

	t.Run("file not found", func(t *testing.T) {
		req := DeleteFileRequest{
			Path: "nonexistent.txt",
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/delete", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.DeleteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response common.Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusNotFound, response.Status)
		assert.Contains(t, response.Message, "not found")
	})

	t.Run("invalid JSON", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/files/delete", strings.NewReader("invalid json"))
		w := httptest.NewRecorder()

		handler.DeleteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response common.Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusInvalidRequest, response.Status)
		assert.Contains(t, response.Message, "Invalid JSON")
	})
}

func TestListFiles(t *testing.T) {
	handler := createTestFileHandler(t)

	// Setup: Create test files and directories
	testFiles := []string{"file1.txt", "file2.txt", ".hidden", "subdir/nested.txt"}
	for _, file := range testFiles {
		fullPath := filepath.Join(handler.config.WorkspacePath, file)
		dir := filepath.Dir(fullPath)
		err := os.MkdirAll(dir, 0755)
		require.NoError(t, err)

		if !strings.HasSuffix(file, "/") {
			err := os.WriteFile(fullPath, []byte("content of "+file), 0644)
			require.NoError(t, err)
		}
	}

	t.Run("list all files including hidden", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/list?path=.&showHidden=true", nil)
		w := httptest.NewRecorder()

		handler.ListFiles(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		files, ok := response["files"].([]any)
		require.True(t, ok)
		assert.GreaterOrEqual(t, len(files), 4) // At least file1.txt, file2.txt, .hidden, subdir
	})

	t.Run("list files excluding hidden", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/list?path=.&showHidden=false", nil)
		w := httptest.NewRecorder()

		handler.ListFiles(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		files, ok := response["files"].([]any)
		require.True(t, ok)

		// Should not include .hidden
		for _, fileInterface := range files {
			file, ok := fileInterface.(map[string]any)
			require.True(t, ok)
			name := file["name"].(string)
			assert.NotEqual(t, ".hidden", name)
		}
	})

	t.Run("list with pagination", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/list?path=.&limit=2&offset=1", nil)
		w := httptest.NewRecorder()

		handler.ListFiles(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		files, ok := response["files"].([]any)
		require.True(t, ok)
		assert.LessOrEqual(t, len(files), 2) // Should be limited to 2 files
	})

	t.Run("list specific directory", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/list?path=subdir", nil)
		w := httptest.NewRecorder()

		handler.ListFiles(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]any
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		files, ok := response["files"].([]any)
		require.True(t, ok)
		assert.GreaterOrEqual(t, len(files), 1) // Should find nested.txt
	})

	t.Run("invalid directory", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/list?path=nonexistent", nil)
		w := httptest.NewRecorder()

		handler.ListFiles(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		var response common.Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotEqual(t, common.StatusSuccess, response.Status)
		assert.Contains(t, response.Message, "Failed to list directory")
	})
}

func TestBatchUpload(t *testing.T) {
	handler := createTestFileHandler(t)

	t.Run("successful batch upload", func(t *testing.T) {
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)

		file1Content := "Content of file1"
		part1, _ := writer.CreateFormFile("files", "tmp/file1.txt")
		part1.Write([]byte(file1Content))

		file2Content := "Content of file2"
		part2, _ := writer.CreateFormFile("files", "/tmp/data/file2.txt")
		part2.Write([]byte(file2Content))

		err := writer.Close()
		require.NoError(t, err)

		httpReq := httptest.NewRequest("POST", "/api/v1/files/batch-upload", &buf)
		httpReq.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()

		handler.BatchUpload(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[BatchUploadResponse]
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Equal(t, 2, response.Data.TotalFiles)
		assert.Equal(t, 2, response.Data.SuccessCount)
		assert.Equal(t, 2, len(response.Data.Results))

		for _, result := range response.Data.Results {
			if result.Success {
				assert.FileExists(t, result.Path)
			}
		}

		// cleanup created files
		for _, result := range response.Data.Results {
			if result.Success {
				_ = os.RemoveAll(filepath.Dir(result.Path))
			}
		}
	})

	t.Run("invalid multipart form", func(t *testing.T) {
		var buf bytes.Buffer
		// send invalid body
		writer := multipart.NewWriter(&buf)
		_ = writer.Close()

		httpReq := httptest.NewRequest("POST", "/api/v1/files/batch-upload", strings.NewReader("invalid multipart"))
		httpReq.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()

		handler.BatchUpload(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[struct{}]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, common.StatusInvalidRequest, response.Status)
		assert.Contains(t, response.Message, "Failed to parse multipart form")
	})
}

func TestValidatePath(t *testing.T) {
	handler := createTestFileHandler(t)

	t.Run("valid paths", func(t *testing.T) {
		testCases := []struct {
			input    string
			expected string
		}{
			{"file.txt", filepath.Join(handler.config.WorkspacePath, "file.txt")},
			{"subdir/file.txt", filepath.Join(handler.config.WorkspacePath, "subdir/file.txt")},
			{"./file.txt", filepath.Join(handler.config.WorkspacePath, "file.txt")},
			{"/file.txt", "/file.txt"},
		}

		for _, tc := range testCases {
			result, err := handler.validatePath(tc.input)
			assert.NoError(t, err)
			assert.Equal(t, tc.expected, result)
		}
	})

	t.Run("empty path", func(t *testing.T) {
		_, err := handler.validatePath("")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "path is required")
	})
}

func TestEnsureDirectory(t *testing.T) {
	handler := createTestFileHandler(t)

	t.Run("create nested directory", func(t *testing.T) {
		testPath := filepath.Join(handler.config.WorkspacePath, "deep", "nested", "path", "file.txt")

		err := ensureDirectory(testPath)
		assert.NoError(t, err)

		// Verify directory was created
		dir := filepath.Dir(testPath)
		info, err := os.Stat(dir)
		assert.NoError(t, err)
		assert.True(t, info.IsDir())
	})
}

func TestFileHandlerIntegration(t *testing.T) {
	handler := createTestFileHandler(t)

	t.Run("complete file lifecycle", func(t *testing.T) {
		writeReq := WriteFileRequest{
			Path:    "lifecycle.txt",
			Content: "Initial content",
		}

		reqBody, _ := json.Marshal(writeReq)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		var writeResponse common.Response[WriteFileResponse]
		err := json.Unmarshal(w.Body.Bytes(), &writeResponse)
		require.NoError(t, err)
		assert.Equal(t, common.StatusSuccess, writeResponse.Status)

		readReq := httptest.NewRequest("GET", "/api/v1/files/read?path=lifecycle.txt", nil)
		w2 := httptest.NewRecorder()

		handler.ReadFile(w2, readReq)
		assert.Equal(t, http.StatusOK, w2.Code)
		assert.Equal(t, "Initial content", w2.Body.String())

		listReq := httptest.NewRequest("GET", "/api/v1/files/list?path=.", nil)
		w3 := httptest.NewRecorder()

		handler.ListFiles(w3, listReq)
		assert.Equal(t, http.StatusOK, w3.Code)

		var listResponse map[string]any
		err = json.Unmarshal(w3.Body.Bytes(), &listResponse)
		require.NoError(t, err)

		files, ok := listResponse["files"].([]any)
		require.True(t, ok)
		assert.Greater(t, len(files), 0)

		deleteReq := DeleteFileRequest{
			Path: "lifecycle.txt",
		}

		deleteBody, _ := json.Marshal(deleteReq)
		httpDeleteReq := httptest.NewRequest("POST", "/api/v1/files/delete", bytes.NewReader(deleteBody))
		w4 := httptest.NewRecorder()

		handler.DeleteFile(w4, httpDeleteReq)
		assert.Equal(t, http.StatusOK, w4.Code)

		var deleteResponse common.Response[struct{}]
		err = json.Unmarshal(w4.Body.Bytes(), &deleteResponse)
		require.NoError(t, err)
		assert.Equal(t, common.StatusSuccess, deleteResponse.Status)

		readReq2 := httptest.NewRequest("GET", "/api/v1/files/read?path=lifecycle.txt", nil)
		w5 := httptest.NewRecorder()

		handler.ReadFile(w5, readReq2)
		assert.Equal(t, http.StatusOK, w5.Code)

		var finalResponse common.Response[struct{}]
		err = json.Unmarshal(w5.Body.Bytes(), &finalResponse)
		require.NoError(t, err)
		assert.Equal(t, common.StatusNotFound, finalResponse.Status)
	})
}

func TestEdgeCases(t *testing.T) {
	handler := createTestFileHandler(t)

	t.Run("large file content", func(t *testing.T) {
		largeContent := strings.Repeat("x", 1000)
		req := WriteFileRequest{
			Path:    "large.txt",
			Content: largeContent,
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[WriteFileResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, int64(len(largeContent)), response.Data.Size)
	})

	t.Run("special characters in filename", func(t *testing.T) {
		specialName := "file with spaces & symbols.txt"
		req := WriteFileRequest{
			Path:    specialName,
			Content: "content",
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[WriteFileResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, common.StatusSuccess, response.Status)
		assert.Contains(t, response.Data.Path, specialName)
	})

	t.Run("unicode content", func(t *testing.T) {
		unicodeContent := "Hello world 🌍"
		req := WriteFileRequest{
			Path:    "unicode.txt",
			Content: unicodeContent,
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)
		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response[WriteFileResponse]
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, common.StatusSuccess, response.Status)

		readReq := httptest.NewRequest("GET", "/api/v1/files/read?path=unicode.txt", nil)
		w2 := httptest.NewRecorder()

		handler.ReadFile(w2, readReq)
		assert.Equal(t, http.StatusOK, w2.Code)
		assert.Equal(t, unicodeContent, w2.Body.String())
	})
}

// Benchmark tests
func BenchmarkFileHandler_WriteFile(b *testing.B) {
	// Use benchmark-specific handler with b.TempDir
	handler := createBenchmarkFileHandler(b)
	content := strings.Repeat("x", 100) // 100 bytes

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := WriteFileRequest{
			Path:    fmt.Sprintf("bench_%d.txt", i),
			Content: content,
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)
	}
}

func BenchmarkFileHandler_ReadFile(b *testing.B) {
	// Use benchmark-specific handler with b.TempDir
	handler := createBenchmarkFileHandler(b)

	// Create test file inside the benchmark workspace
	testFile := filepath.Join(handler.config.WorkspacePath, "bench_read.txt")
	content := strings.Repeat("x", 1000)
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		b.Fatal(err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/read?path=bench_read.txt", nil)
		w := httptest.NewRecorder()

		handler.ReadFile(w, httpReq)
	}
}
