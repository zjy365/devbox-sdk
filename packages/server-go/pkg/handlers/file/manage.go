package file

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/errors"
	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
)

// File operation request types
type WriteFileRequest struct {
	Path        string  `json:"path"`
	Content     string  `json:"content"`
	Encoding    *string `json:"encoding,omitempty"`
	Permissions *string `json:"permissions,omitempty"`
}

type DeleteFileRequest struct {
	Path      string `json:"path"`
	Recursive bool   `json:"recursive,omitempty"`
}

// File operation response types
type WriteFileResponse struct {
	Success   bool   `json:"success"`
	Path      string `json:"path"`
	Size      int64  `json:"size"`
	Timestamp string `json:"timestamp"`
}

type ReadFileResponse struct {
	Success bool   `json:"success"`
	Path    string `json:"path"`
	Content string `json:"content"`
	Size    int64  `json:"size"`
}

type DeleteFileResponse struct {
	Success   bool   `json:"success"`
	Path      string `json:"path"`
	Timestamp string `json:"timestamp"`
}

type FileInfo struct {
	Name        string  `json:"name"`
	Path        string  `json:"path"`
	Size        int64   `json:"size"`
	IsDir       bool    `json:"isDir"`
	MimeType    *string `json:"mimeType,omitempty"`
	Permissions *string `json:"permissions,omitempty"`
	Modified    *string `json:"modified,omitempty"`
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Invalid JSON body"))
		return
	}

	// Validate path
	path, err := h.validatePath(req.Path)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(err.Error()))
		return
	}

	// Handle content encoding
	var reader io.Reader
	var size int64
	if req.Encoding != nil && *req.Encoding == "base64" {
		decoded, err := base64.StdEncoding.DecodeString(req.Content)
		if err != nil {
			errors.WriteErrorResponse(w, errors.NewInvalidRequestError(fmt.Sprintf("Failed to decode base64 content: %v", err)))
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
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Path parameter is required (use ?path=... or X-File-Path header)"))
		return
	}

	// Validate path
	validatedPath, err := h.validatePath(path)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(err.Error()))
		return
	}

	size := max(r.ContentLength, 0)

	h.writeFileCommon(w, validatedPath, r.Body, size)
}

// writeFileMultipart handles multipart/form-data file upload
func (h *FileHandler) writeFileMultipart(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(fmt.Sprintf("Failed to parse multipart form: %v", err)))
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
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("No file found in multipart form (expected 'file' or 'files' field)"))
		return
	}

	if targetPath == "" {
		targetPath = filepath.Join(h.config.WorkspacePath, fileName)
	}

	validatedPath, err := h.validatePath(targetPath)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(err.Error()))
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to open uploaded file: %v", err)))
		return
	}
	defer file.Close()

	h.writeFileCommon(w, validatedPath, file, fileHeader.Size)
}

// writeFileCommon handles the common file writing logic with streaming
func (h *FileHandler) writeFileCommon(w http.ResponseWriter, path string, reader io.Reader, size int64) {
	if size == 0 {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("File size is zero"))
		return
	}
	if size > h.config.MaxFileSize {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(fmt.Sprintf("File size exceeds maximum allowed size of %d bytes", h.config.MaxFileSize)))
		return
	}

	if err := h.ensureDirectory(path); err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to create directory: %v", err)))
		return
	}

	outFile, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to create file: %v", err)))
		return
	}
	defer outFile.Close()

	var limitedReader io.Reader = reader
	if h.config.MaxFileSize > 0 {
		limitedReader = io.LimitReader(reader, h.config.MaxFileSize+1)
	}

	written, err := io.Copy(outFile, limitedReader)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to write file: %v", err)))
		return
	}

	if h.config.MaxFileSize > 0 && written > h.config.MaxFileSize {
		outFile.Close()
		os.Remove(path)
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(fmt.Sprintf("File size exceeds maximum allowed size of %d bytes", h.config.MaxFileSize)))
		return
	}

	common.WriteJSONResponse(w, WriteFileResponse{
		Success:   true,
		Path:      path,
		Size:      written,
		Timestamp: time.Now().Truncate(time.Second).Format(time.RFC3339),
	})
}

// ReadFile handles file read operations
func (h *FileHandler) ReadFile(w http.ResponseWriter, r *http.Request) {
	// First try query parameter
	path := r.URL.Query().Get("path")

	// If not provided, try JSON body
	if path == "" {
		var body struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
			path = body.Path
		} else {
			errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Path parameter is required"))
			return
		}
	}

	if path == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Path parameter is required"))
		return
	}

	// Validate path
	validatedPath, err := h.validatePath(path)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(err.Error()))
		return
	}

	// Validate and check file existence
	info, err := h.checkFileExists(validatedPath)
	if err != nil {
		if apiErr, ok := err.(*errors.APIError); ok {
			errors.WriteErrorResponse(w, apiErr)
		} else {
			errors.WriteErrorResponse(w, errors.NewFileOperationError(err.Error()))
		}
		return
	}

	// Check if it's a directory
	if info.IsDir() {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Path is a directory, not a file"))
		return
	}

	// Read file content
	content, err := os.ReadFile(validatedPath)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to read file: %v", err)))
		return
	}

	common.WriteJSONResponse(w, ReadFileResponse{
		Success: true,
		Path:    validatedPath,
		Content: string(content),
		Size:    info.Size(),
	})
}

// DeleteFile handles file deletion operations
func (h *FileHandler) DeleteFile(w http.ResponseWriter, r *http.Request) {
	var req DeleteFileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Invalid JSON body"))
		return
	}

	// Validate path
	path, err := h.validatePath(req.Path)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(err.Error()))
		return
	}

	// Check if file exists
	if _, err = h.checkFileExists(path); err != nil {
		if apiErr, ok := err.(*errors.APIError); ok {
			errors.WriteErrorResponse(w, apiErr)
		} else {
			errors.WriteErrorResponse(w, errors.NewFileOperationError(err.Error()))
		}
		return
	}

	// Delete file or directory
	if req.Recursive {
		err = os.RemoveAll(path)
	} else {
		err = os.Remove(path)
	}

	if err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to delete: %v", err)))
		return
	}

	common.WriteJSONResponse(w, DeleteFileResponse{
		Success:   true,
		Path:      path,
		Timestamp: time.Now().Truncate(time.Second).Format(time.RFC3339),
	})
}

// ListFiles handles directory listing operations
func (h *FileHandler) ListFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		errors.WriteErrorResponse(w, errors.NewAPIError(errors.ErrorTypeInvalidRequest, "Method not allowed", http.StatusMethodNotAllowed))
		return
	}

	query := r.URL.Query()
	path := query.Get("path")
	if path == "" {
		path = "." // Default to workspace root
	}

	// Validate path within workspace
	validatedPath, err := h.validatePath(path)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(fmt.Sprintf("Invalid path: %v", err)))
		return
	}

	// Parse query parameters with defaults
	showHidden := query.Get("showHidden") == "true"
	limit := 100 // Default limit
	if v, errl := strconv.Atoi(query.Get("limit")); errl == nil && v > 0 {
		limit = v
	}

	offset := 0
	if v, erro := strconv.Atoi(query.Get("offset")); erro == nil && v >= 0 {
		offset = v
	}

	// Read directory
	entries, err := os.ReadDir(validatedPath)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to list directory: %v", err)))
		return
	}

	// Filter and apply options
	var files []FileInfo
	for _, entry := range entries {
		name := entry.Name()
		if !showHidden && strings.HasPrefix(name, ".") {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			// Skip entries we can't read info for
			continue
		}

		// Optional fields
		var mimeType *string
		// Best-effort MIME detection based on extension
		if !entry.IsDir() {
			ext := filepath.Ext(name)
			if ext != "" {
				mt := mimeFromExt(ext)
				if mt != "" {
					mimeType = &mt
				}
			}
		}

		var permissions *string
		if sys := info.Mode().Perm(); sys != 0 {
			perm := fmt.Sprintf("%#o", sys)
			permissions = &perm
		}

		modifiedStr := info.ModTime().Truncate(time.Second).Format(time.RFC3339)
		ms := modifiedStr

		files = append(files, FileInfo{
			Name:        name,
			Path:        filepath.Join(validatedPath, name),
			Size:        info.Size(),
			IsDir:       entry.IsDir(),
			MimeType:    mimeType,
			Permissions: permissions,
			Modified:    &ms,
		})
	}

	// Apply pagination
	if offset > len(files) {
		offset = len(files)
	}

	end := offset + limit
	if end > len(files) {
		end = len(files)
	}

	pagedFiles := files[offset:end]

	// Response format compatible with previous version
	response := map[string]any{
		"success": true,
		"files":   pagedFiles,
		"count":   len(pagedFiles),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
