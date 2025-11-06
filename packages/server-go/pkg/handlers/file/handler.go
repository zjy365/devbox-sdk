package file

import (
	"github.com/labring/devbox-sdk-server/pkg/config"
)

// FileHandler handles file operations
type FileHandler struct {
	config *config.Config
}

// NewFileHandler creates a new file handler
func NewFileHandler(cfg *config.Config) *FileHandler {
	return &FileHandler{
		config: cfg,
	}
}
