# Test Fixtures

This directory contains pre-generated large files for testing file upload functionality.

## Usage

### First Time Setup

Before running tests that require large files, generate the fixture files:

```bash
cd packages/sdk/tests/fixtures
node generate-test-files.js
```

This will create:
- `file-10mb.txt` (10MB)
- `file-50mb.txt` (50MB)
- `file-100mb.txt` (100MB)

### Why Use Pre-generated Files?

Using pre-generated files instead of creating them dynamically with `String.repeat()` provides:

1. **Faster Tests**: Reading a file from disk is much faster than creating a 50MB string in memory
2. **Less Memory Usage**: Avoids allocating huge strings every test run
3. **Realistic Testing**: Tests with actual file I/O rather than synthetic data

### Files

The generated files are:
- Not committed to git (see `.gitignore`)
- Automatically created when needed
- Can be regenerated anytime by running the script

## CI/CD Integration

Add this to your CI setup to generate fixtures before running tests:

```yaml
- name: Generate test fixtures
  run: |
    cd packages/sdk/tests/fixtures
    node generate-test-files.js
```
