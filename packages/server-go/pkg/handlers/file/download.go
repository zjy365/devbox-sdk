package file

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/labring/devbox-sdk-server/pkg/common"
)

type DownloadFilesRequest struct {
	Paths  []string `json:"paths"`
	Format string   `json:"format,omitempty"` // Optional: "tar", "tar.gz", "mixed"
}

// ReadFile handles file read operations with binary output only
func (h *FileHandler) ReadFile(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Path parameter is required (use ?path=...)")
		return
	}

	validatedPath, err := h.validatePath(path)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Invalid path: %v", err)
		return
	}

	info, err := os.Stat(validatedPath)
	if err != nil {
		writeFileNotFoundError(w, err, validatedPath)
		return
	}

	if info.IsDir() {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Path is a directory, not a file")
		return
	}

	file, err := os.Open(validatedPath)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to open file: %v", err)
		return
	}
	defer file.Close()

	ext := filepath.Ext(validatedPath)
	mt := mimeFromExt(ext)
	fileName := filepath.Base(validatedPath)

	w.Header().Set("Content-Type", mt)
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	io.Copy(w, file)
}

// DownloadFile handles file read operations with binary output only
func (h *FileHandler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Path parameter is required (use ?path=...)")
		return
	}

	validatedPath, err := h.validatePath(path)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Invalid path: %v", err)
		return
	}

	info, err := os.Stat(validatedPath)
	if err != nil {
		writeFileNotFoundError(w, err, validatedPath)
		return
	}

	if info.IsDir() {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "Path is a directory, not a file")
		return
	}

	file, err := os.Open(validatedPath)
	if err != nil {
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to open file: %v", err)
		return
	}
	defer file.Close()

	ext := filepath.Ext(validatedPath)
	mt := mimeFromExt(ext)
	fileName := filepath.Base(validatedPath)

	w.Header().Set("Content-Type", mt)
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	io.Copy(w, file)
}

// DownloadFiles handles downloading one or multiple files in archive format only
// Supports: tar, tar.gz, and multipart/mixed (no direct single file download)
// Format can be specified via JSON body "format" field or Accept header
func (h *FileHandler) DownloadFiles(w http.ResponseWriter, r *http.Request) {
	var req DownloadFilesRequest
	if err := common.ParseJSONBodyReturn(w, r, &req); err != nil {
		return
	}

	if len(req.Paths) == 0 {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "At least one file path is required")
		return
	}

	validatedPaths := make([]string, 0, len(req.Paths))
	for _, path := range req.Paths {
		validPath, err := h.validatePath(path)
		if err != nil {
			common.WriteErrorResponse(w, common.StatusInvalidRequest, "Invalid path %q: %v", path, err)
			return
		}

		if _, err := os.Stat(validPath); err != nil {
			writeFileNotFoundError(w, err, validPath)
			return
		}

		validatedPaths = append(validatedPaths, validPath)
	}

	if len(validatedPaths) == 0 {
		common.WriteErrorResponse(w, common.StatusInvalidRequest, "At least one valid file path is required")
		return
	}

	// Determine format: prioritize JSON body format, fallback to Accept header
	format := req.Format
	if format == "" {
		format = h.determineDownloadFormat(r)
	}

	switch format {
	case "mixed", "multipart":
		h.downloadMultipleFilesMultipart(w, validatedPaths)
	case "tar":
		h.downloadMultipleFilesTar(w, validatedPaths, false)
	case "tar.gz":
		h.downloadMultipleFilesTar(w, validatedPaths, true)
	default:
		h.downloadMultipleFilesTar(w, validatedPaths, true)
	}
}

// determineDownloadFormat determines the download format based on Accept header
func (h *FileHandler) determineDownloadFormat(r *http.Request) string {
	accept := r.Header.Get("Accept")

	if strings.Contains(accept, "multipart/mixed") {
		return "mixed"
	}

	if strings.Contains(accept, "application/x-tar") && !strings.Contains(accept, "gzip") {
		return "tar"
	}

	if strings.Contains(accept, "gzip") || strings.Contains(accept, "application/gzip") {
		return "tar.gz"
	}

	return "tar.gz"
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
		common.WriteErrorResponse(w, common.StatusOperationError, "Failed to get workspace path: %v", err)
		return
	}

	for _, filePath := range filePaths {
		if err := h.addToTar(tarWriter, filePath, absWorkspace); err != nil {
			return
		}
	}
}

// downloadMultipleFilesMultipart sends multiple files using multipart/mixed format
func (h *FileHandler) downloadMultipleFilesMultipart(w http.ResponseWriter, filePaths []string) {
	boundary := fmt.Sprintf("boundary_%d", time.Now().UnixNano())
	w.Header().Set("Content-Type", fmt.Sprintf("multipart/mixed; boundary=%s", boundary))

	writer := multipart.NewWriter(w)
	_ = writer.SetBoundary(boundary)

	for _, filePath := range filePaths {
		if err := h.writeMultipartFilePart(writer, filePath); err != nil {
			writer.Close()
			return
		}
	}

	writer.Close()
}

// writeMultipartFile writes a single file or directory recursively in multipart format
func (h *FileHandler) writeMultipartFilePart(mw *multipart.Writer, filePath string) error {
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
			if err := h.writeMultipartFilePart(mw, entryPath); err != nil {
				return err
			}
		}
		return nil
	}

	cleanPath := filepath.Clean(filePath)
	header := textproto.MIMEHeader{}
	header.Set("Content-Type", "application/octet-stream")
	header.Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", cleanPath))
	header.Set("Content-Length", strconv.FormatInt(info.Size(), 10))

	part, err := mw.CreatePart(header)
	if err != nil {
		return err
	}

	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(part, file)
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
