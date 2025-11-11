package file

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
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

type MoveFileRequest struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Overwrite   bool   `json:"overwrite,omitempty"`
}

type RenameFileRequest struct {
	OldPath string `json:"oldPath"`
	NewPath string `json:"newPath"`
}

type DownloadFilesRequest struct {
	Paths []string `json:"paths"`
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

type MoveFileResponse struct {
	Success     bool   `json:"success"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Timestamp   string `json:"timestamp"`
}

type RenameFileResponse struct {
	Success   bool   `json:"success"`
	OldPath   string `json:"oldPath"`
	NewPath   string `json:"newPath"`
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

// MoveFile handles file/directory move operations
func (h *FileHandler) MoveFile(w http.ResponseWriter, r *http.Request) {
	var req MoveFileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Invalid JSON body"))
		return
	}

	if req.Source == "" || req.Destination == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Source and destination paths are required"))
		return
	}

	sourcePath, err := h.validatePath(req.Source)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(fmt.Sprintf("Invalid source path: %v", err)))
		return
	}

	destPath, err := h.validatePath(req.Destination)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(fmt.Sprintf("Invalid destination path: %v", err)))
		return
	}

	if _, err := h.checkFileExists(sourcePath); err != nil {
		if apiErr, ok := err.(*errors.APIError); ok {
			errors.WriteErrorResponse(w, apiErr)
		} else {
			errors.WriteErrorResponse(w, errors.NewFileOperationError(err.Error()))
		}
		return
	}

	if _, err := os.Stat(destPath); err == nil {
		if !req.Overwrite {
			errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Destination already exists and overwrite is not enabled"))
			return
		}
		if err := os.RemoveAll(destPath); err != nil {
			errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to remove existing destination: %v", err)))
			return
		}
	}

	if err := h.ensureDirectory(destPath); err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to create destination directory: %v", err)))
		return
	}

	if err := os.Rename(sourcePath, destPath); err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to move file: %v", err)))
		return
	}

	common.WriteJSONResponse(w, MoveFileResponse{
		Success:     true,
		Source:      sourcePath,
		Destination: destPath,
		Timestamp:   time.Now().Truncate(time.Second).Format(time.RFC3339),
	})
}

// RenameFile handles file/directory rename operations
func (h *FileHandler) RenameFile(w http.ResponseWriter, r *http.Request) {
	var req RenameFileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Invalid JSON body"))
		return
	}

	if req.OldPath == "" || req.NewPath == "" {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Old path and new path are required"))
		return
	}

	oldPath, err := h.validatePath(req.OldPath)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(fmt.Sprintf("Invalid old path: %v", err)))
		return
	}

	newPath, err := h.validatePath(req.NewPath)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError(fmt.Sprintf("Invalid new path: %v", err)))
		return
	}

	if _, err := h.checkFileExists(oldPath); err != nil {
		if apiErr, ok := err.(*errors.APIError); ok {
			errors.WriteErrorResponse(w, apiErr)
		} else {
			errors.WriteErrorResponse(w, errors.NewFileOperationError(err.Error()))
		}
		return
	}

	if _, err := os.Stat(newPath); err == nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("New path already exists"))
		return
	}

	if err := h.ensureDirectory(newPath); err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to create parent directory: %v", err)))
		return
	}

	if err := os.Rename(oldPath, newPath); err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to rename file: %v", err)))
		return
	}

	common.WriteJSONResponse(w, RenameFileResponse{
		Success:   true,
		OldPath:   oldPath,
		NewPath:   newPath,
		Timestamp: time.Now().Truncate(time.Second).Format(time.RFC3339),
	})
}

// DownloadFiles handles downloading one or multiple files with smart format detection
// Supports: single file direct download, tar, tar.gz, and multipart/mixed
func (h *FileHandler) DownloadFiles(w http.ResponseWriter, r *http.Request) {
	var req DownloadFilesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("Invalid JSON body"))
		return
	}

	if len(req.Paths) == 0 {
		errors.WriteErrorResponse(w, errors.NewInvalidRequestError("At least one file path is required"))
		return
	}

	validatedPaths := make([]string, 0, len(req.Paths))
	for _, path := range req.Paths {
		validPath, err := h.validatePath(path)
		if err != nil {
			errors.WriteErrorResponse(w, errors.NewInvalidRequestError(fmt.Sprintf("Invalid path %q: %v", path, err)))
			return
		}

		if _, err := h.checkFileExists(validPath); err != nil {
			if apiErr, ok := err.(*errors.APIError); ok {
				errors.WriteErrorResponse(w, apiErr)
			} else {
				errors.WriteErrorResponse(w, errors.NewFileOperationError(err.Error()))
			}
			return
		}

		validatedPaths = append(validatedPaths, validPath)
	}

	// Determine format based on request parameter or Accept header
	format := h.determineDownloadFormat(r)

	// Single non-directory file can be downloaded directly if no specific format requested
	if len(validatedPaths) == 1 {
		info, _ := os.Stat(validatedPaths[0])
		if !info.IsDir() {
			// Only check Accept header to avoid tar/multipart for single file
			accept := r.Header.Get("Accept")
			if !strings.Contains(accept, "multipart") && !strings.Contains(accept, "tar") {
				h.downloadSingleFile(w, validatedPaths[0])
				return
			}
		}
	}

	// Route to appropriate handler based on format
	switch format {
	case "multipart":
		h.downloadMultipleFilesMultipart(w, validatedPaths)
	case "tar":
		h.downloadMultipleFilesTar(w, validatedPaths, false)
	case "tar.gz":
		h.downloadMultipleFilesTar(w, validatedPaths, true)
	default:
		// Default to tar.gz for backward compatibility
		h.downloadMultipleFilesTar(w, validatedPaths, true)
	}
}

// determineDownloadFormat determines the download format based on request and Accept header
func (h *FileHandler) determineDownloadFormat(r *http.Request) string {
	// Check Accept header for format hints
	accept := r.Header.Get("Accept")

	// If client explicitly accepts multipart
	if strings.Contains(accept, "multipart/mixed") {
		return "multipart"
	}

	// If client explicitly accepts tar without gzip
	if strings.Contains(accept, "application/x-tar") && !strings.Contains(accept, "gzip") {
		return "tar"
	}

	// If client accepts gzip or generic binary
	if strings.Contains(accept, "gzip") || strings.Contains(accept, "application/gzip") {
		return "tar.gz"
	}

	// Default to tar.gz (most compatible)
	return "tar.gz"
}

// downloadSingleFile sends a single file directly
func (h *FileHandler) downloadSingleFile(w http.ResponseWriter, filePath string) {
	info, err := os.Stat(filePath)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to stat file: %v", err)))
		return
	}

	file, err := os.Open(filePath)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to open file: %v", err)))
		return
	}
	defer file.Close()

	fileName := filepath.Base(filePath)
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))

	io.Copy(w, file)
}

// downloadMultipleFilesTar creates a tar or tar.gz archive of multiple files
func (h *FileHandler) downloadMultipleFilesTar(w http.ResponseWriter, filePaths []string, compress bool) {
	if compress {
		w.Header().Set("Content-Type", "application/gzip")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", "download.tar.gz"))
	} else {
		w.Header().Set("Content-Type", "application/x-tar")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", "download.tar"))
	}

	var tarWriter *tar.Writer
	if compress {
		gzipWriter := gzip.NewWriter(w)
		defer gzipWriter.Close()
		tarWriter = tar.NewWriter(gzipWriter)
	} else {
		tarWriter = tar.NewWriter(w)
	}
	defer tarWriter.Close()

	absWorkspace, err := filepath.Abs(h.config.WorkspacePath)
	if err != nil {
		errors.WriteErrorResponse(w, errors.NewFileOperationError(fmt.Sprintf("Failed to get workspace path: %v", err)))
		return
	}

	for _, filePath := range filePaths {
		if err := h.addToTar(tarWriter, filePath, absWorkspace); err != nil {
			return
		}
	}
}

// downloadMultipleFilesMultipart sends multiple files using multipart/mixed format
// This is HTTP-native and doesn't require compression tools on client side
func (h *FileHandler) downloadMultipleFilesMultipart(w http.ResponseWriter, filePaths []string) {
	boundary := fmt.Sprintf("boundary_%d", time.Now().UnixNano())

	w.Header().Set("Content-Type", fmt.Sprintf("multipart/mixed; boundary=%s", boundary))
	w.WriteHeader(http.StatusOK)

	absWorkspace, err := filepath.Abs(h.config.WorkspacePath)
	if err != nil {
		return
	}

	for _, filePath := range filePaths {
		if err := h.writeMultipartFile(w, filePath, absWorkspace, boundary); err != nil {
			return
		}
	}

	// Write final boundary
	fmt.Fprintf(w, "\r\n--%s--\r\n", boundary)
}

// writeMultipartFile writes a single file or directory recursively in multipart format
func (h *FileHandler) writeMultipartFile(w http.ResponseWriter, filePath string, baseDir string, boundary string) error {
	info, err := os.Stat(filePath)
	if err != nil {
		return err
	}

	if info.IsDir() {
		entries, err := os.ReadDir(filePath)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			entryPath := filepath.Join(filePath, entry.Name())
			if err := h.writeMultipartFile(w, entryPath, baseDir, boundary); err != nil {
				return err
			}
		}
		return nil
	}

	// Write multipart boundary and headers
	relPath, _ := filepath.Rel(baseDir, filePath)
	fmt.Fprintf(w, "\r\n--%s\r\n", boundary)
	fmt.Fprintf(w, "Content-Type: application/octet-stream\r\n")
	fmt.Fprintf(w, "Content-Disposition: attachment; filename=%q\r\n", relPath)
	fmt.Fprintf(w, "Content-Length: %d\r\n\r\n", info.Size())

	// Write file content
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(w, file)
	return err
}

// addToTar recursively adds files/directories to tar archive
func (h *FileHandler) addToTar(tw *tar.Writer, filePath string, baseDir string) error {
	info, err := os.Stat(filePath)
	if err != nil {
		return fmt.Errorf("failed to stat file: %v", err)
	}

	relPath, err := filepath.Rel(baseDir, filePath)
	if err != nil {
		return fmt.Errorf("failed to get relative path: %v", err)
	}

	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return fmt.Errorf("failed to create tar header: %v", err)
	}
	header.Name = relPath

	if err := tw.WriteHeader(header); err != nil {
		return fmt.Errorf("failed to write tar header: %v", err)
	}

	if info.IsDir() {
		entries, err := os.ReadDir(filePath)
		if err != nil {
			return fmt.Errorf("failed to read directory: %v", err)
		}

		for _, entry := range entries {
			entryPath := filepath.Join(filePath, entry.Name())
			if err := h.addToTar(tw, entryPath, baseDir); err != nil {
				return err
			}
		}
	} else {
		file, err := os.Open(filePath)
		if err != nil {
			return fmt.Errorf("failed to open file: %v", err)
		}
		defer file.Close()

		if _, err := io.Copy(tw, file); err != nil {
			return fmt.Errorf("failed to write file to tar: %v", err)
		}
	}

	return nil
}
