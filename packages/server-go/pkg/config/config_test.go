package config

import (
	"encoding/hex"
	"flag"
	"log/slog"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetLogLevel(t *testing.T) {
	testCases := []struct {
		name     string
		input    string
		expected slog.Level
	}{
		{"debug lower", "debug", slog.LevelDebug},
		{"debug upper", "DEBUG", slog.LevelDebug},
		{"info lower", "info", slog.LevelInfo},
		{"info upper", "INFO", slog.LevelInfo},
		{"warn lower", "warn", slog.LevelWarn},
		{"warn upper", "WARN", slog.LevelWarn},
		{"warning lower", "warning", slog.LevelWarn},
		{"warning upper", "WARNING", slog.LevelWarn},
		{"error lower", "error", slog.LevelError},
		{"error upper", "ERROR", slog.LevelError},
		{"invalid", "invalid", slog.LevelInfo},
		{"empty", "", slog.LevelInfo},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			level := getLogLevel(tc.input)
			assert.Equal(t, tc.expected, level)
		})
	}
}

func TestGenerateRandomToken(t *testing.T) {
	cases := []struct {
		name   string
		bytes  int
		length int
	}{
		{"zero length", 0, 0},
		{"one byte", 1, 2},
		{"eight bytes", 8, 16},
		{"sixteen bytes", 16, 32},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			token := generateRandomToken(c.bytes)
			assert.Equal(t, c.length, len(token))
			_, err := hex.DecodeString(token)
			assert.NoError(t, err, "token should be valid hex")
		})
	}

	t.Run("generates different tokens", func(t *testing.T) {
		t1 := generateRandomToken(16)
		t2 := generateRandomToken(16)
		assert.NotEqual(t, t1, t2)
	})
}

func TestParseCfg_TableDriven(t *testing.T) {
	// Known env keys used by ParseCfg
	knownEnv := []string{"ADDR", "LOG_LEVEL", "WORKSPACE_PATH", "MAX_FILE_SIZE", "TOKEN"}

	type expectations struct {
		addr          string
		logLevel      slog.Level
		workspacePath string
		maxFileSize   int64
		token         string
		autoGen       bool
	}

	cases := []struct {
		name   string
		setEnv map[string]string
		args   []string
		exp    expectations
	}{
		{
			name:   "defaults without flags or env",
			setEnv: nil,
			args:   []string{"test"},
			exp: expectations{
				addr:          ":9757",
				logLevel:      slog.LevelInfo,
				workspacePath: "/workspace",
				maxFileSize:   100 * 1024 * 1024,
				token:         "non-empty",
				autoGen:       true,
			},
		},
		{
			name:   "env token only",
			setEnv: map[string]string{"TOKEN": "env-token"},
			args:   []string{"test"},
			exp: expectations{
				addr:          ":9757",
				logLevel:      slog.LevelInfo,
				workspacePath: "/workspace",
				maxFileSize:   100 * 1024 * 1024,
				token:         "env-token",
				autoGen:       false,
			},
		},
		{
			name:   "flags override defaults",
			setEnv: nil,
			args:   []string{"test", "-addr=:8081", "-log_level=WARN", "-workspace_path=/flag/workspace", "-max_file_size=26214400", "-token=flag-token"},
			exp: expectations{
				addr:          ":8081",
				logLevel:      slog.LevelWarn,
				workspacePath: "/flag/workspace",
				maxFileSize:   26214400,
				token:         "flag-token",
				autoGen:       false,
			},
		},
		{
			name:   "flags override env (priority)",
			setEnv: map[string]string{"ADDR": ":9090", "LOG_LEVEL": "DEBUG", "TOKEN": "env-token"},
			args:   []string{"test", "-addr=:8081", "-log_level=ERROR", "-token=flag-token"},
			exp: expectations{
				addr:          ":8081",
				logLevel:      slog.LevelError,
				workspacePath: "/workspace",
				maxFileSize:   100 * 1024 * 1024,
				token:         "flag-token",
				autoGen:       false,
			},
		},
		{
			name:   "env-only branches with flag defaults (documented behavior)",
			setEnv: map[string]string{"ADDR": ":9090", "LOG_LEVEL": "WARN", "WORKSPACE_PATH": "/env/workspace", "MAX_FILE_SIZE": "52428800", "TOKEN": "env-token"},
			args:   []string{"test"},
			exp: expectations{
				addr:          ":9757",
				logLevel:      slog.LevelInfo,
				workspacePath: "/workspace",
				maxFileSize:   100 * 1024 * 1024,
				token:         "env-token",
				autoGen:       false,
			},
		},
		{
			name:   "invalid max file size from env uses default",
			setEnv: map[string]string{"MAX_FILE_SIZE": "invalid"},
			args:   []string{"test"},
			exp: expectations{
				addr:          ":9757",
				logLevel:      slog.LevelInfo,
				workspacePath: "/workspace",
				maxFileSize:   100 * 1024 * 1024,
				token:         "non-empty",
				autoGen:       true,
			},
		},
		{
			name:   "invalid max file size flag uses default",
			setEnv: nil,
			args:   []string{"test", "-max_file_size=invalid"},
			exp: expectations{
				addr:          ":9757",
				logLevel:      slog.LevelInfo,
				workspacePath: "/workspace",
				maxFileSize:   100 * 1024 * 1024,
				token:         "non-empty",
				autoGen:       true,
			},
		},
		{
			name:   "partial flags mixed with defaults",
			setEnv: nil,
			args:   []string{"test", "-workspace_path=/flag/workspace", "-token=flag-token"},
			exp: expectations{
				addr:          ":9757",
				logLevel:      slog.LevelInfo,
				workspacePath: "/flag/workspace",
				maxFileSize:   100 * 1024 * 1024,
				token:         "flag-token",
				autoGen:       false,
			},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// Reset flags and env for clean state
			resetFlags := func() { flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ExitOnError) }
			clearEnv := func() {
				for _, k := range knownEnv {
					os.Unsetenv(k)
				}
			}

			defer func(oldArgs []string) { os.Args = oldArgs }(os.Args)
			resetFlags()
			clearEnv()

			// Apply env
			for k, v := range c.setEnv {
				os.Setenv(k, v)
			}

			// Apply args
			os.Args = c.args

			cfg := ParseCfg()

			assert.Equal(t, c.exp.addr, cfg.Addr, "addr")
			assert.Equal(t, c.exp.logLevel, cfg.LogLevel, "log level")
			assert.Equal(t, c.exp.workspacePath, cfg.WorkspacePath, "workspace path")
			assert.Equal(t, c.exp.maxFileSize, cfg.MaxFileSize, "max file size")

			if c.exp.token == "non-empty" {
				assert.NotEmpty(t, cfg.Token)
				assert.Equal(t, 32, len(cfg.Token))
				_, err := hex.DecodeString(cfg.Token)
				assert.NoError(t, err)
			} else {
				assert.Equal(t, c.exp.token, cfg.Token)
			}

			assert.Equal(t, c.exp.autoGen, cfg.TokenAutoGenerated, "token auto-generation flag")
		})
	}

	// Additional check: two parses without token should yield different tokens
	t.Run("auto-generated tokens differ across parses", func(t *testing.T) {
		defer func(oldArgs []string) { os.Args = oldArgs }(os.Args)
		flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ExitOnError)
		for _, k := range knownEnv {
			os.Unsetenv(k)
		}
		os.Args = []string{"test"}
		cfg1 := ParseCfg()

		flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ExitOnError)
		for _, k := range knownEnv {
			os.Unsetenv(k)
		}
		os.Args = []string{"test"}
		cfg2 := ParseCfg()

		require.NotEmpty(t, cfg1.Token)
		require.NotEmpty(t, cfg2.Token)
		assert.True(t, cfg1.TokenAutoGenerated)
		assert.True(t, cfg2.TokenAutoGenerated)
		assert.NotEqual(t, cfg1.Token, cfg2.Token)
	})
}
