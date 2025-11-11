package file

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"

	"github.com/labring/devbox-sdk-server/pkg/handlers/common"
)

// Batch upload types
type BatchUploadResult struct {
	Path    string  `json:"path"`
	Success bool    `json:"success"`
	Size    *int64  `json:"size,omitempty"`
	Error   *string `json:"error,omitempty"`
}

type BatchUploadResponse struct {
	Success      bool                `json:"success"`
	Results      []BatchUploadResult `json:"results"`
	TotalFiles   int                 `json:"totalFiles"`
	SuccessCount int                 `json:"successCount"`
}

type UploadedFile struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// BatchUpload handles batch file upload operations
func (h *FileHandler) BatchUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		common.WriteJSONResponse(w, common.Response{Success: false, Error: "Method not allowed"})
		return
	}

	// Parse multipart form
	if err := r.ParseMultipartForm(32 << 20); err != nil { // 32MB max memory
		common.WriteJSONResponse(w, common.Response{
			Success: false,
			Error:   fmt.Sprintf("Failed to parse multipart form: %v", err),
		})
		return
	}

	targetDir := r.FormValue("targetDir")
	if targetDir == "" {
		common.WriteJSONResponse(w, common.Response{
			Success: false,
			Error:   "targetDir parameter is required",
		})
		return
	}

	// Ensure target directory exists
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		common.WriteJSONResponse(w, common.Response{
			Success: false,
			Error:   fmt.Sprintf("Failed to create target directory: %v", err),
		})
		return
	}

	var uploadedFiles []UploadedFile
	var uploadErrors []string

	// Handle file uploads
	if files := r.MultipartForm.File["files"]; len(files) > 0 {
		for _, fileHeader := range files {
			uploadedFile, err := h.handleSingleUpload(fileHeader, targetDir)
			if err != nil {
				uploadErrors = append(uploadErrors, fmt.Sprintf("Failed to upload %s: %v", fileHeader.Filename, err))
				continue
			}
			uploadedFiles = append(uploadedFiles, uploadedFile)
		}
	}

	// Build response
	resp := BatchUploadResponse{
		Success:      len(uploadErrors) == 0,
		TotalFiles:   len(uploadedFiles),
		SuccessCount: len(uploadedFiles),
	}

	// Convert uploaded files to results
	for _, f := range uploadedFiles {
		resp.Results = append(resp.Results, BatchUploadResult{
			Path:    f.Path,
			Success: true,
			Size:    &f.Size,
		})
	}

	// Add error results
	for _, e := range uploadErrors {
		msg := e
		resp.Results = append(resp.Results, BatchUploadResult{
			Path:    "",
			Success: false,
			Error:   &msg,
		})
	}

	common.WriteJSONResponse(w, resp)
}

// handleSingleUpload processes a single file upload
func (h *FileHandler) handleSingleUpload(fileHeader *multipart.FileHeader, targetDir string) (UploadedFile, error) {
	file, err := fileHeader.Open()
	if err != nil {
		return UploadedFile{}, err
	}
	defer file.Close()

	// Create target file path
	targetPath := filepath.Join(targetDir, fileHeader.Filename)

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
