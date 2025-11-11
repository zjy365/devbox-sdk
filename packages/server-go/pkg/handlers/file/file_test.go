package file

import (
	"bytes"
	"encoding/base64"
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

	"github.com/labring/devbox-sdk-server/pkg/config"
	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
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

	t.Run("successful file write", func(t *testing.T) {
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

		var response WriteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, handler.config.WorkspacePath, filepath.Dir(response.Path))
		assert.Equal(t, int64(len("Hello, World!")), response.Size)
		assert.NotEmpty(t, response.Timestamp)

		// Verify file actually exists and has correct content
		content, err := os.ReadFile(response.Path)
		require.NoError(t, err)
		assert.Equal(t, "Hello, World!", string(content))
	})

	t.Run("nested directory creation", func(t *testing.T) {
		req := WriteFileRequest{
			Path:    "subdir/nested/file.txt",
			Content: "Nested content",
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response WriteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Contains(t, response.Path, "subdir/nested/file.txt")
	})

	t.Run("invalid JSON", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", strings.NewReader("invalid json"))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("empty path", func(t *testing.T) {
		req := WriteFileRequest{
			Path:    "",
			Content: "content",
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("write file with base64 encoding", func(t *testing.T) {
		// Create binary data (PNG header)
		binaryData := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
		base64Content := base64.StdEncoding.EncodeToString(binaryData)
		encoding := "base64"

		req := WriteFileRequest{
			Path:     "test_image.png",
			Content:  base64Content,
			Encoding: &encoding,
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response WriteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, int64(len(binaryData)), response.Size)

		// Verify file content is decoded binary data
		content, err := os.ReadFile(response.Path)
		require.NoError(t, err)
		assert.Equal(t, binaryData, content)
	})

	t.Run("write file with invalid base64", func(t *testing.T) {
		encoding := "base64"
		req := WriteFileRequest{
			Path:     "test.txt",
			Content:  "this is not valid base64!!!",
			Encoding: &encoding,
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("file size exceeds limit", func(t *testing.T) {
		// Create a handler with small file size limit
		testWorkspace := createTestWorkspace(t)
		cfg := &config.Config{
			WorkspacePath: testWorkspace,
			MaxFileSize:   10, // 10 bytes limit
		}

		smallHandler := NewFileHandler(cfg)

		req := WriteFileRequest{
			Path:    "large.txt",
			Content: strings.Repeat("x", 20), // 20 bytes > 10 bytes limit
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		smallHandler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("path traversal attempt", func(t *testing.T) {
		req := WriteFileRequest{
			Path:    "../../../etc/passwd",
			Content: "malicious content",
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("binary upload via query parameter", func(t *testing.T) {
		binaryData := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D}

		httpReq := httptest.NewRequest("POST", "/api/v1/files/write?path=binary_image.png", bytes.NewReader(binaryData))
		httpReq.Header.Set("Content-Type", "application/octet-stream")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response WriteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, int64(len(binaryData)), response.Size)

		// Verify file content
		content, err := os.ReadFile(response.Path)
		require.NoError(t, err)
		assert.Equal(t, binaryData, content)
	})

	t.Run("binary upload via header", func(t *testing.T) {
		binaryData := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46}

		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(binaryData))
		httpReq.Header.Set("Content-Type", "image/jpeg")
		httpReq.Header.Set("X-File-Path", "photo.jpg")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response WriteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Contains(t, response.Path, "photo.jpg")

		// Verify file content
		content, err := os.ReadFile(response.Path)
		require.NoError(t, err)
		assert.Equal(t, binaryData, content)
	})

	t.Run("binary upload via base64 path", func(t *testing.T) {
		binaryData := []byte{0x50, 0x4B, 0x03, 0x04}
		path := "/tmp/test.zip"
		pathBase64 := base64.StdEncoding.EncodeToString([]byte(path))

		httpReq := httptest.NewRequest("POST", "/api/v1/files/write?path_base64="+pathBase64, bytes.NewReader(binaryData))
		httpReq.Header.Set("Content-Type", "application/zip")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response WriteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
	})

	t.Run("binary upload missing path", func(t *testing.T) {
		binaryData := []byte{0x01, 0x02, 0x03}

		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", bytes.NewReader(binaryData))
		httpReq.Header.Set("Content-Type", "application/octet-stream")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("binary upload large file", func(t *testing.T) {
		binaryData := make([]byte, 1024*1024) // 1MB

		httpReq := httptest.NewRequest("POST", "/api/v1/files/write?path=large_binary.bin", bytes.NewReader(binaryData))
		httpReq.Header.Set("Content-Type", "application/octet-stream")
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response WriteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, int64(1024*1024), response.Size)
	})

	t.Run("multipart upload with file field", func(t *testing.T) {
		// Create multipart form data
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		// Add file field
		fileContent := []byte("Hello from multipart!")
		part, err := writer.CreateFormFile("file", "multipart_test.txt")
		require.NoError(t, err)
		_, err = part.Write(fileContent)
		require.NoError(t, err)

		// Add path field (optional)
		err = writer.WriteField("path", "uploaded_multipart.txt")
		require.NoError(t, err)

		err = writer.Close()
		require.NoError(t, err)

		// Create request
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", body)
		httpReq.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response WriteFileResponse
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Contains(t, response.Path, "uploaded_multipart.txt")
		assert.Equal(t, int64(len(fileContent)), response.Size)

		// Verify file content
		content, err := os.ReadFile(response.Path)
		require.NoError(t, err)
		assert.Equal(t, fileContent, content)
	})

	t.Run("multipart upload with files field", func(t *testing.T) {
		// Create multipart form data
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		// Add files field (batch upload format)
		fileContent := []byte("Batch upload content")
		part, err := writer.CreateFormFile("files", "batch_test.txt")
		require.NoError(t, err)
		_, err = part.Write(fileContent)
		require.NoError(t, err)

		err = writer.Close()
		require.NoError(t, err)

		// Create request
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", body)
		httpReq.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response WriteFileResponse
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Contains(t, response.Path, "batch_test.txt")
	})

	t.Run("multipart upload without path defaults to filename", func(t *testing.T) {
		// Create multipart form data
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		// Add file field without path
		fileContent := []byte("File content")
		part, err := writer.CreateFormFile("file", "default_name.txt")
		require.NoError(t, err)
		_, err = part.Write(fileContent)
		require.NoError(t, err)

		err = writer.Close()
		require.NoError(t, err)

		// Create request
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", body)
		httpReq.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response WriteFileResponse
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Contains(t, response.Path, "default_name.txt")
	})

	t.Run("multipart upload with binary data", func(t *testing.T) {
		// Create multipart form data
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		// Add binary file (PNG header)
		binaryData := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
		part, err := writer.CreateFormFile("file", "multipart_image.png")
		require.NoError(t, err)
		_, err = part.Write(binaryData)
		require.NoError(t, err)

		err = writer.Close()
		require.NoError(t, err)

		// Create request
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", body)
		httpReq.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response WriteFileResponse
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, int64(len(binaryData)), response.Size)

		// Verify binary content
		content, err := os.ReadFile(response.Path)
		require.NoError(t, err)
		assert.Equal(t, binaryData, content)
	})

	t.Run("multipart upload missing file field", func(t *testing.T) {
		// Create multipart form data without file field
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		// Add only a text field
		err := writer.WriteField("path", "test.txt")
		require.NoError(t, err)

		err = writer.Close()
		require.NoError(t, err)

		// Create request
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", body)
		httpReq.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("multipart upload large file", func(t *testing.T) {
		// Create multipart form data
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		// Add large file (1MB)
		largeData := make([]byte, 1024*1024)
		for i := range largeData {
			largeData[i] = byte(i % 256)
		}

		part, err := writer.CreateFormFile("file", "large_multipart.bin")
		require.NoError(t, err)
		_, err = part.Write(largeData)
		require.NoError(t, err)

		err = writer.Close()
		require.NoError(t, err)

		// Create request
		httpReq := httptest.NewRequest("POST", "/api/v1/files/write", body)
		httpReq.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()

		handler.WriteFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response WriteFileResponse
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, int64(1024*1024), response.Size)
	})
}

func TestReadFile(t *testing.T) {
	handler := createTestFileHandler(t)

	// Setup: Create a test file first
	testFile := filepath.Join(handler.config.WorkspacePath, "readme.txt")
	testContent := "This is test content for reading"
	err := os.WriteFile(testFile, []byte(testContent), 0644)
	require.NoError(t, err)

	t.Run("successful file read via query parameter", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/read?path=readme.txt", nil)
		w := httptest.NewRecorder()

		handler.ReadFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response ReadFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, testContent, response.Content)
		assert.Equal(t, int64(len(testContent)), response.Size)
	})

	t.Run("successful file read via JSON body", func(t *testing.T) {
		body := map[string]string{"path": "readme.txt"}
		reqBody, _ := json.Marshal(body)

		httpReq := httptest.NewRequest("GET", "/api/v1/files/read", bytes.NewReader(reqBody))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.ReadFile(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response ReadFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, testContent, response.Content)
	})

	t.Run("missing path parameter", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/read", nil)
		w := httptest.NewRecorder()

		handler.ReadFile(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("invalid JSON body", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/read", strings.NewReader("invalid json"))
		httpReq.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.ReadFile(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("file not found", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/api/v1/files/read?path=nonexistent.txt", nil)
		w := httptest.NewRecorder()

		handler.ReadFile(w, httpReq)

		assert.Equal(t, http.StatusNotFound, w.Code)

		// Parse error response
		var errorResponse map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &errorResponse)
		require.NoError(t, err)

		message, ok := errorResponse["message"].(string)
		assert.True(t, ok, "message field should be a string")
		assert.Contains(t, message, "not found")
		assert.Equal(t, "not_found", errorResponse["type"])
	})

	t.Run("directory instead of file", func(t *testing.T) {
		// Create a test directory
		testDir := filepath.Join(handler.config.WorkspacePath, "testdir")
		err := os.Mkdir(testDir, 0755)
		require.NoError(t, err)

		httpReq := httptest.NewRequest("GET", "/api/v1/files/read?path=testdir", nil)
		w := httptest.NewRecorder()

		handler.ReadFile(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		// Verify it's an error response with correct content type
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		// Parse error response
		var errorResponse map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &errorResponse)
		require.NoError(t, err)

		message, ok := errorResponse["message"].(string)
		assert.True(t, ok, "message field should be a string")
		assert.Contains(t, message, "directory")
		assert.Equal(t, "invalid_request", errorResponse["type"])
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

		var response DeleteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, testFile, response.Path)
		assert.NotEmpty(t, response.Timestamp)

		// Verify file is actually deleted
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

		var response DeleteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)

		// Verify directory is actually deleted
		_, err = os.Stat(testDir)
		assert.True(t, os.IsNotExist(err))
	})

	t.Run("directory deletion without recursive flag", func(t *testing.T) {
		// Recreate test directory with a file to make it non-empty
		testDir2 := filepath.Join(handler.config.WorkspacePath, "deletedir2")
		err := os.Mkdir(testDir2, 0755)
		require.NoError(t, err)

		// Add a file to make directory non-empty
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

		assert.Equal(t, http.StatusInternalServerError, w.Code)

		// Verify it's an error response with correct content type
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		// Parse error response
		var errorResponse map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &errorResponse)
		require.NoError(t, err)

		message, ok := errorResponse["message"].(string)
		assert.True(t, ok, "message field should be a string")
		assert.Contains(t, message, "Failed to delete")
		assert.Equal(t, "file_operation_error", errorResponse["type"])
	})

	t.Run("file not found", func(t *testing.T) {
		req := DeleteFileRequest{
			Path: "nonexistent.txt",
		}

		reqBody, _ := json.Marshal(req)
		httpReq := httptest.NewRequest("POST", "/api/v1/files/delete", bytes.NewReader(reqBody))
		w := httptest.NewRecorder()

		handler.DeleteFile(w, httpReq)

		assert.Equal(t, http.StatusNotFound, w.Code)

		// Verify it's an error response with correct content type
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		// Parse error response
		var errorResponse map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &errorResponse)
		require.NoError(t, err)

		message, ok := errorResponse["message"].(string)
		assert.True(t, ok, "message field should be a string")
		assert.Contains(t, message, "not found")
		assert.Equal(t, "not_found", errorResponse["type"])
	})

	t.Run("invalid JSON", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/files/delete", strings.NewReader("invalid json"))
		w := httptest.NewRecorder()

		handler.DeleteFile(w, httpReq)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		// Verify it's an error response with correct content type
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		// Parse error response
		var errorResponse map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &errorResponse)
		require.NoError(t, err)

		message, ok := errorResponse["message"].(string)
		assert.True(t, ok, "message field should be a string")
		assert.Contains(t, message, "Invalid JSON")
		assert.Equal(t, "invalid_request", errorResponse["type"])
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

		assert.Equal(t, http.StatusInternalServerError, w.Code)

		// Verify it's an error response with correct content type
		assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

		// Parse error response
		var errorResponse map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &errorResponse)
		require.NoError(t, err)

		message, ok := errorResponse["message"].(string)
		assert.True(t, ok, "message field should be a string")
		assert.Contains(t, message, "Failed to list directory")
		assert.Equal(t, "file_operation_error", errorResponse["type"])
	})
}

func TestBatchUpload(t *testing.T) {
	handler := createTestFileHandler(t)

	t.Run("successful batch upload", func(t *testing.T) {
		// Create multipart form
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)

		// Add files
		file1Content := "Content of file1"
		part1, _ := writer.CreateFormFile("files", "file1.txt")
		part1.Write([]byte(file1Content))

		file2Content := "Content of file2"
		part2, _ := writer.CreateFormFile("files", "file2.txt")
		part2.Write([]byte(file2Content))

		// Add target directory within workspace to avoid repo residuals
		uploadsDir := filepath.Join(handler.config.WorkspacePath, "uploads")
		_ = writer.WriteField("targetDir", uploadsDir)

		err := writer.Close()
		require.NoError(t, err)

		httpReq := httptest.NewRequest("POST", "/api/v1/files/batch-upload", &buf)
		httpReq.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()

		handler.BatchUpload(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response BatchUploadResponse
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response.Success)
		assert.Equal(t, 2, response.TotalFiles)
		assert.Equal(t, 2, response.SuccessCount)
		assert.Equal(t, 2, len(response.Results))

		// Verify files were actually created
		for _, result := range response.Results {
			if result.Success {
				assert.FileExists(t, result.Path)
			}
		}

		// Explicitly cleanup uploads directory (in addition to t.TempDir cleanup)
		t.Cleanup(func() {
			_ = os.RemoveAll(uploadsDir)
		})
	})

	t.Run("missing target directory", func(t *testing.T) {
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)

		// Add file without target directory
		part, _ := writer.CreateFormFile("files", "test.txt")
		part.Write([]byte("content"))

		err := writer.Close()
		require.NoError(t, err)

		httpReq := httptest.NewRequest("POST", "/api/v1/files/batch-upload", &buf)
		httpReq.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()

		handler.BatchUpload(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.False(t, response.Success)
		assert.Contains(t, response.Error, "targetDir parameter is required")
	})

	t.Run("invalid multipart form", func(t *testing.T) {
		httpReq := httptest.NewRequest("POST", "/api/v1/files/batch-upload", strings.NewReader("invalid multipart"))
		w := httptest.NewRecorder()

		handler.BatchUpload(w, httpReq)

		assert.Equal(t, http.StatusOK, w.Code)

		var response common.Response
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.False(t, response.Success)
		assert.Contains(t, response.Error, "Failed to parse multipart form")
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
			{"/file.txt", filepath.Join(handler.config.WorkspacePath, "file.txt")},
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

	t.Run("path traversal attempts", func(t *testing.T) {
		// Use paths that will definitely go outside the temp workspace
		maliciousPaths := []string{
			"../../../../../../../../etc/passwd",
			"../../../../../../../../root/.ssh/id_rsa",
			"../../../../../../../../../../../../etc/hosts",
		}

		for _, path := range maliciousPaths {
			_, err := handler.validatePath(path)
			assert.Error(t, err, "should reject path: %s", path)
			assert.Contains(t, err.Error(), "outside workspace")
		}
	})
}

func TestEnsureDirectory(t *testing.T) {
	handler := createTestFileHandler(t)

	t.Run("create nested directory", func(t *testing.T) {
		testPath := filepath.Join(handler.config.WorkspacePath, "deep", "nested", "path", "file.txt")

		err := handler.ensureDirectory(testPath)
		assert.NoError(t, err)

		// Verify directory was created
		dir := filepath.Dir(testPath)
		info, err := os.Stat(dir)
		assert.NoError(t, err)
		assert.True(t, info.IsDir())
	})
}

func TestCheckFileExists(t *testing.T) {
	handler := createTestFileHandler(t)

	t.Run("existing file", func(t *testing.T) {
		testFile := filepath.Join(handler.config.WorkspacePath, "existing.txt")
		err := os.WriteFile(testFile, []byte("content"), 0644)
		require.NoError(t, err)

		info, err := handler.checkFileExists(testFile)
		assert.NoError(t, err)
		assert.NotNil(t, info)
		assert.Equal(t, "existing.txt", info.Name())
	})

	t.Run("nonexistent file", func(t *testing.T) {
		nonexistentFile := filepath.Join(handler.config.WorkspacePath, "nonexistent.txt")

		_, err := handler.checkFileExists(nonexistentFile)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})
}

func TestFileHandlerIntegration(t *testing.T) {
	handler := createTestFileHandler(t)

	t.Run("complete file lifecycle", func(t *testing.T) {
		// 1. Write file
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

		var writeResponse WriteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &writeResponse)
		require.NoError(t, err)
		assert.True(t, writeResponse.Success)

		// 2. Read file
		readReq := httptest.NewRequest("GET", "/api/v1/files/read?path=lifecycle.txt", nil)
		w2 := httptest.NewRecorder()

		handler.ReadFile(w2, readReq)
		assert.Equal(t, http.StatusOK, w2.Code)

		var readResponse ReadFileResponse
		err = json.Unmarshal(w2.Body.Bytes(), &readResponse)
		require.NoError(t, err)
		assert.True(t, readResponse.Success)
		assert.Equal(t, "Initial content", readResponse.Content)

		// 3. List files (should include our file)
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

		// 4. Delete file
		deleteReq := DeleteFileRequest{
			Path: "lifecycle.txt",
		}

		deleteBody, _ := json.Marshal(deleteReq)
		httpDeleteReq := httptest.NewRequest("POST", "/api/v1/files/delete", bytes.NewReader(deleteBody))
		w4 := httptest.NewRecorder()

		handler.DeleteFile(w4, httpDeleteReq)
		assert.Equal(t, http.StatusOK, w4.Code)

		var deleteResponse DeleteFileResponse
		err = json.Unmarshal(w4.Body.Bytes(), &deleteResponse)
		require.NoError(t, err)
		assert.True(t, deleteResponse.Success)

		// 5. Verify file is gone
		readReq2 := httptest.NewRequest("GET", "/api/v1/files/read?path=lifecycle.txt", nil)
		w5 := httptest.NewRecorder()

		handler.ReadFile(w5, readReq2)
		assert.Equal(t, http.StatusNotFound, w5.Code)

		// Parse error response
		var finalResponse map[string]interface{}
		err = json.Unmarshal(w5.Body.Bytes(), &finalResponse)
		require.NoError(t, err)
		assert.Equal(t, "not_found", finalResponse["type"])
	})
}

func TestEdgeCases(t *testing.T) {
	handler := createTestFileHandler(t)

	t.Run("large file content", func(t *testing.T) {
		largeContent := strings.Repeat("x", 1000) // 1KB content
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

		var response WriteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, int64(len(largeContent)), response.Size)
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

		var response WriteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.True(t, response.Success)
		assert.Contains(t, response.Path, specialName)
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

		var response WriteFileResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.True(t, response.Success)

		// Read back and verify unicode content
		readReq := httptest.NewRequest("GET", "/api/v1/files/read?path=unicode.txt", nil)
		w2 := httptest.NewRecorder()

		handler.ReadFile(w2, readReq)
		assert.Equal(t, http.StatusOK, w2.Code)

		var readResponse ReadFileResponse
		err = json.Unmarshal(w2.Body.Bytes(), &readResponse)
		require.NoError(t, err)
		assert.Equal(t, unicodeContent, readResponse.Content)
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
