package file

import (
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strings"

	"github.com/labring/devbox-sdk-server/pkg/errors"
)

// validatePath validates and sanitizes a file path to prevent path traversal attacks
func (h *FileHandler) validatePath(path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("path is required")
	}

	// Clean the path and remove leading slashes
	cleanPath := filepath.Clean(path)
	cleanPath = strings.TrimPrefix(cleanPath, "/")
	cleanPath = strings.TrimPrefix(cleanPath, "./")

	// Join with workspace and resolve to absolute path
	fullPath := filepath.Join(h.config.WorkspacePath, cleanPath)
	absPath, err := filepath.Abs(fullPath)
	if err != nil {
		return "", err
	}

	absWorkspace, err := filepath.Abs(h.config.WorkspacePath)
	if err != nil {
		return "", err
	}

	// Ensure path stays within workspace
	if !strings.HasPrefix(absPath, absWorkspace) {
		return "", fmt.Errorf("path %q is outside workspace", path)
	}

	return absPath, nil
}

// ensureDirectory creates directory if it doesn't exist
func (h *FileHandler) ensureDirectory(path string) error {
	return os.MkdirAll(filepath.Dir(path), 0755)
}

// checkFileExists checks if file exists and returns file info
func (h *FileHandler) checkFileExists(path string) (os.FileInfo, error) {
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return nil, errors.NewFileNotFoundError(path)
	}
	return info, err
}

// mimeFromExt returns a best-effort MIME type by file extension
// Falls back to application/octet-stream when unknown
func mimeFromExt(ext string) string {
	if ext == "" {
		return "application/octet-stream"
	}
	if !strings.HasPrefix(ext, ".") {
		ext = "." + ext
	}
	if mt := mime.TypeByExtension(ext); mt != "" {
		return mt
	}
	return "application/octet-stream"
}
