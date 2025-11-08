package utils

import (
	"crypto/rand"
)

// defaultAlphabet is the alphabet used for ID characters by default. ( must be 63 characters)
var defaultAlphabet = []byte("_-0123456789abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz")

const (
	defaultLength = 8
)

func NewNanoID() string {
	bytes := make([]byte, defaultLength)

	// no need to check resp, and error crash never return
	rand.Read(bytes)

	id := make([]byte, defaultLength)
	for i := range defaultLength {
		id[i] = defaultAlphabet[bytes[i]&63]
	}
	return string(id[:defaultLength])
}
