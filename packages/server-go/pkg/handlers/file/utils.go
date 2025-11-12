package file

import (
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/labring/devbox-sdk-server/pkg/common"
)

func writeFileNotFoundError(w http.ResponseWriter, err error, path string) {
	if os.IsNotExist(err) {
		common.WriteErrorResponse(w, common.StatusNotFound, "File not found: %s", path)
		return
	}
	common.WriteErrorResponse(w, common.StatusInternalError, "File operation error: %v", err)
}

func (h *FileHandler) validatePath(path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("path is required")
	}

	cleanPath := filepath.Clean(path)

	if filepath.IsAbs(cleanPath) {
		return cleanPath, nil
	}

	fullPath := filepath.Join(h.config.WorkspacePath, cleanPath)
	absPath, err := filepath.Abs(fullPath)
	if err != nil {
		return "", err
	}

	return absPath, nil
}

// ensureDirectory creates directory if it doesn't exist
func ensureDirectory(path string) error {
	return os.MkdirAll(filepath.Dir(path), 0755)
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
