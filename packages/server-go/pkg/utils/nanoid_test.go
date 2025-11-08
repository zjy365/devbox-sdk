package utils

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNew(t *testing.T) {
	t.Run("negative ID length", func(t *testing.T) {
		nanoID := NewNanoID()
		assert.Equal(t, len(nanoID), 8, "nanoID length is invalid")
	})
}

func BenchmarkNanoid(b *testing.B) {
	for b.Loop() {
		_ = NewNanoID()
	}
}
