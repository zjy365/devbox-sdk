package file

import (
	"encoding/json"
	"fmt"
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
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"isDir"`
	ModTime string `json:"modTime"`
}

// WriteFile handles file write operations
func (h *FileHandler) WriteFile(w http.ResponseWriter, r *http.Request) {
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

	// Check file size limit
	content := []byte(req.Content)
	if int64(len(content)) > h.config.MaxFileSize {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(fmt.Sprintf("File size exceeds maximum allowed size of %d bytes", h.config.MaxFileSize)))
		return
	}

	// Ensure directory exists
	if err = h.ensureDirectory(path); err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to create directory: %v", err)))
		return
	}

	// Write file
	if err = os.WriteFile(path, content, 0644); err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to write file: %v", err)))
		return
	}

	// Get file info
	info, err := os.Stat(path)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to get file info: %v", err)))
		return
	}

	common.WriteJSONResponse(w, WriteFileResponse{
		Success:   true,
		Path:      path,
		Size:      info.Size(),
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

		files = append(files, FileInfo{
			Name:    name,
			Path:    filepath.Join(validatedPath, name),
			Size:    info.Size(),
			IsDir:   entry.IsDir(),
			ModTime: info.ModTime().Truncate(time.Second).Format(time.RFC3339),
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
