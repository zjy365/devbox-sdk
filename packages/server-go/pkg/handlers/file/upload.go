package file

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/labring/devbox-sdk-server/pkg/common"
)

// File operation request types
type WriteFileRequest struct {
	Path        string  `json:"path"`
	Content     string  `json:"content"`
	Encoding    *string `json:"encoding,omitempty"`
	Permissions *string `json:"permissions,omitempty"`
}

type WriteFileResponse struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// Batch upload types
type BatchUploadResult struct {
	Path    string  `json:"path"`
	Success bool    `json:"success"`
	Size    *int64  `json:"size,omitempty"`
	Error   *string `json:"error,omitempty"`
}

type BatchUploadResponse struct {
	Results      []BatchUploadResult `json:"results"`
	TotalFiles   int                 `json:"totalFiles"`
	SuccessCount int                 `json:"successCount"`
}

type UploadedFile struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// WriteFile handles file write operations with smart routing based on Content-Type
func (h *FileHandler) WriteFile(w http.ResponseWriter, r *http.Request) {
	contentType := r.Header.Get("Content-Type")

	// Route based on Content-Type
	if strings.HasPrefix(contentType, "application/json") {
		h.writeFileJSON(w, r)
	} else if strings.HasPrefix(contentType, "multipart/form-data") {
		h.writeFileMultipart(w, r)
	} else {
		h.writeFileBinary(w, r)
	}
}

// writeFileJSON handles JSON-based file write (with optional base64 encoding)
func (h *FileHandler) writeFileJSON(w http.ResponseWriter, r *http.Request) {
	var req WriteFileRequest
	if err := common.ParseJSONBodyReturn(w, r, &req); err != nil {
		return
	}

	// Validate path
	path, err := h.validatePath(req.Path)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusValidationError, "Invalid path: %v", err)
		return
	}

	// Handle content encoding
	var reader io.Reader
	var size int64
	if req.Encoding != nil && *req.Encoding == "base64" {
		decoded, err := base64.StdEncoding.DecodeString(req.Content)
		if err != nil {
			common.WriteErrorResponse(w, common.StatusInvalidRequest, "Failed to decode base64 content: %v", err)
			return
		}
		reader = bytes.NewReader(decoded)
		size = int64(len(decoded))
	} else {
		reader = strings.NewReader(req.Content)
		size = int64(len(req.Content))
	}

	h.writeFileCommon(w, path, reader, size)
}

// writeFileBinary handles binary file write (direct upload)
func (h *FileHandler) writeFileBinary(w http.ResponseWriter, r *http.Request) {
	// Get path from multiple sources (priority order)
	path := r.URL.Query().Get("path")
	if path == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Path parameter is required (use ?path=...)")
		return
	}

	// Validate path
	validatedPath, err := h.validatePath(path)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusValidationError, "Invalid path: %v", err)
		return
	}

	size := max(r.ContentLength, 0)

	h.writeFileCommon(w, validatedPath, r.Body, size)
}

// writeFileMultipart handles multipart/form-data file upload
func (h *FileHandler) writeFileMultipart(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Failed to parse multipart form: %v", err)
		return
	}

	targetPath := r.FormValue("path")

	var fileHeader *multipart.FileHeader
	var fileName string

	if files := r.MultipartForm.File["file"]; len(files) > 0 {
		fileHeader = files[0]
		fileName = fileHeader.Filename
	} else if files := r.MultipartForm.File["files"]; len(files) > 0 {
		fileHeader = files[0]
		fileName = fileHeader.Filename
	} else {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "No file found in multipart form (expected 'file' or 'files' field)")
		return
	}

	if targetPath == "" {
		targetPath = filepath.Join(h.config.WorkspacePath, fileName)
	}

	validatedPath, err := h.validatePath(targetPath)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusValidationError, "Invalid path: %v", err)
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to open uploaded file: %v", err)
		return
	}
	defer file.Close()

	h.writeFileCommon(w, validatedPath, file, fileHeader.Size)
}

// writeFileCommon handles the common file writing logic with streaming
func (h *FileHandler) writeFileCommon(w http.ResponseWriter, path string, reader io.Reader, size int64) {
	if size > 0 && size > h.config.MaxFileSize {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "File size exceeds maximum allowed size of %d bytes", h.config.MaxFileSize)
		return
	}

	if err := ensureDirectory(path); err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to create directory: %v", err)
		return
	}

	outFile, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to create file: %v", err)
		return
	}
	defer outFile.Close()

	var limitedReader io.Reader = reader
	if h.config.MaxFileSize > 0 {
		limitedReader = io.LimitReader(reader, h.config.MaxFileSize+1)
	}

	written, err := io.Copy(outFile, limitedReader)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to write file: %v", err)
		return
	}

	if h.config.MaxFileSize > 0 && written > h.config.MaxFileSize {
		outFile.Close()
		os.Remove(path)
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "File size exceeds maximum allowed size of %d bytes", h.config.MaxFileSize)
		return
	}

	resp := WriteFileResponse{
		Path: path,
		Size: written,
	}
	common.WriteSuccessResponse(w, resp)
}

// extractFullFilename extracts the full filename (with path) from multipart.FileHeader
// Go's standard library uses filepath.Base() which strips directory parts for security,
// but we want to preserve the path for batch uploads to different directories
func extractFullFilename(fileHeader *multipart.FileHeader) string {
	cd := fileHeader.Header.Get("Content-Disposition")
	if cd == "" {
		return fileHeader.Filename
	}

	// Parse Content-Disposition header to extract filename parameter
	// Format: form-data; name="files"; filename="path/to/file.txt"
	for _, part := range strings.Split(cd, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "filename=") {
			filename := strings.TrimPrefix(part, "filename=")
			filename = strings.Trim(filename, `"`)
			if filename != "" {
				return filename
			}
		}
	}

	return fileHeader.Filename
}

// BatchUpload handles batch file upload operations
func (h *FileHandler) BatchUpload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Failed to parse multipart form: %v", err)
		return
	}

	var results []BatchUploadResult
	totalFiles := 0
	successCount := 0

	if files := r.MultipartForm.File["files"]; len(files) > 0 {
		for _, fileHeader := range files {
			totalFiles++

			// Extract full filename including directory path from Content-Disposition header
			fullFilename := extractFullFilename(fileHeader)
			name := filepath.Clean(fullFilename)

			if name == "" || name == "." {
				errMsg := fmt.Sprintf("Invalid filename for upload: %q", fullFilename)
				results = append(results, BatchUploadResult{Path: fullFilename, Success: false, Error: &errMsg})
				continue
			}

			var dest string
			if filepath.IsAbs(name) {
				dest = name
			} else {
				dest = filepath.Join(h.config.WorkspacePath, name)
				absDest, err := filepath.Abs(dest)
				if err != nil {
					errMsg := fmt.Sprintf("Failed to resolve destination path for %s: %v", fullFilename, err)
					results = append(results, BatchUploadResult{Path: fullFilename, Success: false, Error: &errMsg})
					continue
				}
				dest = absDest
			}

			uploadedFile, err := h.handleSingleUpload(fileHeader, dest)
			if err != nil {
				errMsg := fmt.Sprintf("Failed to upload %s: %v", fullFilename, err)
				results = append(results, BatchUploadResult{Path: fullFilename, Success: false, Error: &errMsg})
				continue
			}
			successCount++
			results = append(results, BatchUploadResult{Path: uploadedFile.Path, Success: true, Size: &uploadedFile.Size})
		}
	}

	resp := BatchUploadResponse{
		Results:      results,
		TotalFiles:   totalFiles,
		SuccessCount: successCount,
	}

	common.WriteSuccessResponse(w, resp)
}

// handleSingleUpload processes a single file upload
func (h *FileHandler) handleSingleUpload(fileHeader *multipart.FileHeader, dest string) (UploadedFile, error) {
	file, err := fileHeader.Open()
	if err != nil {
		return UploadedFile{}, err
	}
	defer file.Close()

	// Destination path is precomputed per file
	targetPath := filepath.Clean(dest)

	// Ensure directory exists
	dir := filepath.Dir(targetPath)
	if errm := os.MkdirAll(dir, 0755); errm != nil {
		return UploadedFile{}, errm
	}

	// Create target file
	outFile, err := os.Create(targetPath)
	if err != nil {
		return UploadedFile{}, err
	}
	defer outFile.Close()

	// Copy file contents
	if _, erru := io.Copy(outFile, file); erru != nil {
		return UploadedFile{}, erru
	}

	// Get file info
	info, err := outFile.Stat()
	if err != nil {
		return UploadedFile{}, err
	}

	return UploadedFile{
		Name: fileHeader.Filename,
		Path: targetPath,
		Size: info.Size(),
	}, nil
}
