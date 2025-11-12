package file

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
)

type ListFilesRequest struct {
	Path       string `json:"path"`
	ShowHidden bool   `json:"showHidden,omitempty"`
	Limit      int    `json:"limit,omitempty"`
	Offset     int    `json:"offset,omitempty"`
}

type DeleteFileRequest struct {
	Path      string `json:"path"`
	Recursive bool   `json:"recursive,omitempty"`
}

type MoveFileRequest struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Overwrite   bool   `json:"overwrite,omitempty"`
}

type RenameFileRequest struct {
	OldPath string `json:"oldPath"`
	NewPath string `json:"newPath"`
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

// DeleteFile handles file deletion operations
func (h *FileHandler) DeleteFile(w http.ResponseWriter, r *http.Request) {
	var req DeleteFileRequest
	if err := common.ParseJSONBodyReturn(w, r, &req); err != nil {
		return
	}

	// Validate path
	path, err := h.validatePath(req.Path)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusValidationError, "Invalid path: %v", err)
		return
	}

	// Check if file exists
	if _, err = os.Stat(path); err != nil {
		writeFileNotFoundError(w, err, path)
		return
	}

	// Delete file or directory
	if req.Recursive {
		err = os.RemoveAll(path)
	} else {
		err = os.Remove(path)
	}

	if err != nil {
		common.WriteErrorResponse(w, common.StatusInternalError, "Failed to delete: %v", err)
		return
	}

	common.WriteSuccessResponse(w, struct{}{})
}

// ListFiles handles directory listing operations
func (h *FileHandler) ListFiles(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	path := query.Get("path")
	if path == "" {
		path = "." // Default to workspace root
	}

	// Validate path within workspace
	validatedPath, err := h.validatePath(path)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Invalid path: %v", err)
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
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to list directory: %v", err)
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
	common.WriteSuccessResponse(w, response)
}

// MoveFile handles file/directory move operations
func (h *FileHandler) MoveFile(w http.ResponseWriter, r *http.Request) {
	var req MoveFileRequest
	if err := common.ParseJSONBodyReturn(w, r, &req); err != nil {
		return
	}

	if req.Source == "" || req.Destination == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Source and destination paths are required")
		return
	}

	sourcePath, err := h.validatePath(req.Source)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusValidationError, "Invalid source path: %v", err)
		return
	}

	destPath, err := h.validatePath(req.Destination)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusValidationError, "Invalid destination path: %v", err)
		return
	}

	if _, err := os.Stat(sourcePath); err != nil {
		writeFileNotFoundError(w, err, sourcePath)
		return
	}

	if _, err := os.Stat(destPath); err == nil {
		if !req.Overwrite {
			common.WriteErrorResponse(w, common.StatusConflict, "Destination already exists and overwrite is not enabled")
			return
		}
		if err := os.RemoveAll(destPath); err != nil {
			common.WriteErrorResponse(w, common.StatusOperationError, "Failed to remove existing destination: %v", err)
			return
		}
	}

	if err := ensureDirectory(destPath); err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to create destination directory: %v", err)
		return
	}

	if err := os.Rename(sourcePath, destPath); err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to move file: %v", err)
		return
	}

	common.WriteSuccessResponse(w, struct{}{})
}

// RenameFile handles file/directory rename operations
func (h *FileHandler) RenameFile(w http.ResponseWriter, r *http.Request) {
	var req RenameFileRequest
	if err := common.ParseJSONBodyReturn(w, r, &req); err != nil {
		return
	}

	if req.OldPath == "" || req.NewPath == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Old path and new path are required")
		return
	}

	oldPath, err := h.validatePath(req.OldPath)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusValidationError, "Invalid old path: %v", err)
		return
	}

	newPath, err := h.validatePath(req.NewPath)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusValidationError, "Invalid new path: %v", err)
		return
	}

	if _, err := os.Stat(oldPath); err != nil {
		writeFileNotFoundError(w, err, oldPath)
		return
	}

	if _, err := os.Stat(newPath); err == nil {
		common.WriteErrorResponse(w, common.StatusValidationError, "New path already exists")
		return
	}

	if err := ensureDirectory(newPath); err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to create destination directory: %v", err)
		return
	}

	if err := os.Rename(oldPath, newPath); err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to rename file: %v", err)
		return
	}

	common.WriteSuccessResponse(w, struct{}{})
}
