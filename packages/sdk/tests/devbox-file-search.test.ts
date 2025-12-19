/**
 * Devbox SDK File Search and Replace Tests
 *
 * Test Purpose:
 * This test file validates Devbox SDK file search and replace functionality, including:
 * 1. File search by filename (case-insensitive substring match)
 * 2. File find by content (searching inside text files)
 * 3. File replace operations (replacing text in multiple files)
 *
 * Test Coverage:
 * - Search files by filename pattern
 * - Find files by content keyword
 * - Replace text in single and multiple files
 * - Error handling and edge cases
 * - Binary file detection and skipping
 * - UTF-8 encoding support
 *
 * Notes:
 * - All tests require a real Devbox instance (created via Kubernetes API)
 * - Tests use shared devbox to reduce overhead
 * - Tests create test files and directories, ensure cleanup between tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG, getOrCreateSharedDevbox, cleanupTestFiles } from './setup'

describe('Devbox SDK File Search and Replace Tests', () => {
  let sdk: DevboxSDK
  let devboxInstance: DevboxInstance

  beforeEach(async () => {
    sdk = new DevboxSDK(TEST_CONFIG)

    // Use shared devbox instead of creating a new one
    devboxInstance = await getOrCreateSharedDevbox(sdk)

    // Clean up files from previous tests
    await cleanupTestFiles(devboxInstance, [
      './test',
      './test-directory',
      './search',
      './find',
      './replace',
    ])
  }, 30000)

  afterEach(async () => {
    // Clean up test directories
    try {
      await devboxInstance.execSync({
        command: 'rm',
        args: ['-rf', './search', './find', './replace'],
      })
    } catch {
      // Ignore cleanup errors
    }

    // Don't delete the shared devbox, just close the SDK connection
    if (sdk) {
      await sdk.close()
    }
  }, 10000)

  describe('File Search by Filename', () => {
    beforeEach(async () => {
      // Create test files with various names
      await devboxInstance.writeFile('./search/config.json', '{"key": "value"}')
      await devboxInstance.writeFile('./search/src/config.ts', 'export const config = {}')
      await devboxInstance.writeFile('./search/nginx.config', 'server { }')
      await devboxInstance.writeFile('./search/README.md', '# Project')
      await devboxInstance.writeFile('./search/package.json', '{"name": "test"}')
      await devboxInstance.writeFile('./search/CONFIG_BACKUP.txt', 'backup')
    })

    it('should search files by pattern (case-insensitive)', async () => {
      const result = await devboxInstance.searchFiles({
        dir: './search',
        pattern: 'config',
      })

      expect(result.files).toBeDefined()
      expect(Array.isArray(result.files)).toBe(true)
      expect(result.files.length).toBeGreaterThan(0)

      // Should find files containing "config" in their name
      const fileNames = result.files.map(f => f.split('/').pop() || '')
      expect(fileNames.some(name => name.includes('config'))).toBe(true)
    }, 10000)

    it('should search files in current directory when dir is not specified', async () => {
      // Create a file in current directory
      await devboxInstance.writeFile('./search-test.txt', 'test content')

      const result = await devboxInstance.searchFiles({
        pattern: 'search-test',
      })

      expect(result.files).toBeDefined()
      expect(Array.isArray(result.files)).toBe(true)

      // Clean up
      await devboxInstance.deleteFile('./search-test.txt')
    }, 10000)

    it('should return empty array when no files match', async () => {
      const result = await devboxInstance.searchFiles({
        dir: './search',
        pattern: 'nonexistent-file-xyz-123',
      })

      expect(result.files).toBeDefined()
      expect(Array.isArray(result.files)).toBe(true)
      expect(result.files.length).toBe(0)
    }, 10000)

    it('should throw error when pattern is empty', async () => {
      await expect(
        devboxInstance.searchFiles({
          dir: './search',
          pattern: '',
        })
      ).rejects.toThrow('Pattern cannot be empty')
    })

    it('should throw error when pattern is only whitespace', async () => {
      await expect(
        devboxInstance.searchFiles({
          dir: './search',
          pattern: '   ',
        })
      ).rejects.toThrow('Pattern cannot be empty')
    })

    it('should handle nested directory search', async () => {
      await devboxInstance.writeFile('./search/nested/deep/config.yaml', 'key: value')

      const result = await devboxInstance.searchFiles({
        dir: './search',
        pattern: 'config',
      })

      expect(result.files).toBeDefined()
      expect(Array.isArray(result.files)).toBe(true)
      // Should find files in nested directories
      const hasNested = result.files.some(f => f.includes('nested'))
      expect(hasNested).toBe(true)
    }, 10000)
  })

  describe('File Find by Content', () => {
    beforeEach(async () => {
      // Create test files with various content
      await devboxInstance.writeFile('./find/app.ts', '// TODO: implement feature')
      await devboxInstance.writeFile('./find/main.js', 'console.log("TODO: fix bug")')
      await devboxInstance.writeFile('./find/utils.py', 'def helper():  # TODO: optimize')
      await devboxInstance.writeFile('./find/README.md', '# Project Documentation')
      await devboxInstance.writeFile('./find/empty.txt', '')
    })

    it('should find files containing keyword', async () => {
      const result = await devboxInstance.findInFiles({
        dir: './find',
        keyword: 'TODO',
      })

      expect(result.files).toBeDefined()
      expect(Array.isArray(result.files)).toBe(true)
      expect(result.files.length).toBeGreaterThan(0)

      // Verify files contain the keyword
      for (const filePath of result.files) {
        const content = await devboxInstance.readFile(filePath)
        expect(content.toString().includes('TODO')).toBe(true)
      }
    }, 15000)

    it('should find files with case-sensitive keyword', async () => {
      const result = await devboxInstance.findInFiles({
        dir: './find',
        keyword: 'console',
      })

      expect(result.files).toBeDefined()
      expect(Array.isArray(result.files)).toBe(true)
      expect(result.files.length).toBeGreaterThan(0)

      // Should find main.js
      const hasMainJs = result.files.some(f => f.includes('main.js'))
      expect(hasMainJs).toBe(true)
    }, 10000)

    it('should search in current directory when dir is not specified', async () => {
      await devboxInstance.writeFile('./find-current.txt', 'Search keyword here')

      const result = await devboxInstance.findInFiles({
        keyword: 'keyword',
      })

      expect(result.files).toBeDefined()
      expect(Array.isArray(result.files)).toBe(true)

      // Clean up
      await devboxInstance.deleteFile('./find-current.txt')
    }, 10000)

    it('should return empty array when keyword not found', async () => {
      const result = await devboxInstance.findInFiles({
        dir: './find',
        keyword: 'NONEXISTENT_KEYWORD_XYZ_123',
      })

      expect(result.files).toBeDefined()
      expect(Array.isArray(result.files)).toBe(true)
      expect(result.files.length).toBe(0)
    }, 10000)

    it('should throw error when keyword is empty', async () => {
      await expect(
        devboxInstance.findInFiles({
          dir: './find',
          keyword: '',
        })
      ).rejects.toThrow('Keyword cannot be empty')
    })

    it('should throw error when keyword is only whitespace', async () => {
      await expect(
        devboxInstance.findInFiles({
          dir: './find',
          keyword: '   ',
        })
      ).rejects.toThrow('Keyword cannot be empty')
    })

    it('should handle nested directory search', async () => {
      await devboxInstance.writeFile('./find/nested/deep/file.ts', 'const TODO = "task"')

      const result = await devboxInstance.findInFiles({
        dir: './find',
        keyword: 'TODO',
      })

      expect(result.files).toBeDefined()
      expect(Array.isArray(result.files)).toBe(true)
      // Should find files in nested directories
      const hasNested = result.files.some(f => f.includes('nested'))
      expect(hasNested).toBe(true)
    }, 15000)

    it('should skip binary files', async () => {
      // Create a binary file (PNG header)
      const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      await devboxInstance.writeFile('./find/image.png', binaryContent)

      // Create a text file with the same keyword
      await devboxInstance.writeFile('./find/text.txt', 'TODO: process image')

      const result = await devboxInstance.findInFiles({
        dir: './find',
        keyword: 'TODO',
      })

      // Should find text.txt but not image.png
      const hasText = result.files.some(f => f.includes('text.txt'))
      const hasImage = result.files.some(f => f.includes('image.png'))

      expect(hasText).toBe(true)
      expect(hasImage).toBe(false)
    }, 10000)
  })

  describe('File Replace Operations', () => {
    beforeEach(async () => {
      // Create test files with content to replace
      await devboxInstance.writeFile('./replace/file1.txt', 'old_value and old_value again')
      await devboxInstance.writeFile('./replace/file2.txt', 'old_value here')
      await devboxInstance.writeFile('./replace/file3.txt', 'no match here')
    })

    it('should replace text in single file', async () => {
      const result = await devboxInstance.replaceInFiles({
        files: ['./replace/file1.txt'],
        from: 'old_value',
        to: 'new_value',
      })

      expect(result.results).toBeDefined()
      expect(Array.isArray(result.results)).toBe(true)
      expect(result.results.length).toBe(1)

      const fileResult = result.results[0]!
      expect(fileResult.file).toBe('./replace/file1.txt')
      expect(fileResult.status).toBe('success')
      expect(fileResult.replacements).toBe(2) // Should replace 2 occurrences

      // Verify content was replaced
      const content = await devboxInstance.readFile('./replace/file1.txt')
      expect(content.toString()).toBe('new_value and new_value again')
      expect(content.toString()).not.toContain('old_value')
    }, 10000)

    it('should replace text in multiple files', async () => {
      const result = await devboxInstance.replaceInFiles({
        files: ['./replace/file1.txt', './replace/file2.txt'],
        from: 'old_value',
        to: 'new_value',
      })

      expect(result.results).toBeDefined()
      expect(Array.isArray(result.results)).toBe(true)
      expect(result.results.length).toBe(2)

      // Check first file
      const result1 = result.results.find(r => r.file === './replace/file1.txt')
      expect(result1).toBeDefined()
      expect(result1?.status).toBe('success')
      expect(result1?.replacements).toBe(2)

      // Check second file
      const result2 = result.results.find(r => r.file === './replace/file2.txt')
      expect(result2).toBeDefined()
      expect(result2?.status).toBe('success')
      expect(result2?.replacements).toBe(1)

      // Verify content was replaced in both files
      const content1 = await devboxInstance.readFile('./replace/file1.txt')
      const content2 = await devboxInstance.readFile('./replace/file2.txt')
      expect(content1.toString()).not.toContain('old_value')
      expect(content2.toString()).not.toContain('old_value')
    }, 10000)

    it('should handle files with no matches', async () => {
      const result = await devboxInstance.replaceInFiles({
        files: ['./replace/file3.txt'],
        from: 'old_value',
        to: 'new_value',
      })

      expect(result.results).toBeDefined()
      expect(result.results.length).toBe(1)

      const fileResult = result.results[0]!
      expect(fileResult.status).toBe('skipped')
      expect(fileResult.replacements).toBe(0)
      expect(fileResult.error).toBeUndefined()

      // Verify content was not changed
      const content = await devboxInstance.readFile('./replace/file3.txt')
      expect(content.toString()).toBe('no match here')
    }, 10000)

    it('should replace with empty string', async () => {
      await devboxInstance.writeFile('./replace/empty-test.txt', 'remove_this_text')

      const result = await devboxInstance.replaceInFiles({
        files: ['./replace/empty-test.txt'],
        from: 'remove_this_',
        to: '',
      })

      expect(result.results.length).toBe(1)
      expect(result.results[0]!.status).toBe('success')
      expect(result.results[0]!.replacements).toBe(1)

      // Verify content was replaced
      const content = await devboxInstance.readFile('./replace/empty-test.txt')
      expect(content.toString()).toBe('text')
    }, 10000)

    it('should throw error when from string is empty', async () => {
      await expect(
        devboxInstance.replaceInFiles({
          files: ['./replace/file1.txt'],
          from: '',
          to: 'new_value',
        })
      ).rejects.toThrow("'from' string cannot be empty")
    })

    it('should throw error when from string is only whitespace', async () => {
      await expect(
        devboxInstance.replaceInFiles({
          files: ['./replace/file1.txt'],
          from: '   ',
          to: 'new_value',
        })
      ).rejects.toThrow("'from' string cannot be empty")
    })

    it('should throw error when files array is empty', async () => {
      await expect(
        devboxInstance.replaceInFiles({
          files: [],
          from: 'old_value',
          to: 'new_value',
        })
      ).rejects.toThrow('At least one file path is required')
    })

    it('should handle non-existent files gracefully', async () => {
      const result = await devboxInstance.replaceInFiles({
        files: ['./replace/nonexistent.txt'],
        from: 'old_value',
        to: 'new_value',
      })

      expect(result.results).toBeDefined()
      expect(result.results.length).toBe(1)

      const fileResult = result.results[0]!
      expect(fileResult.status).toBe('error')
      expect(fileResult.replacements).toBe(0)
      expect(fileResult.error).toBeDefined()
    }, 10000)

    it('should skip binary files', async () => {
      // Create a binary file
      const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      await devboxInstance.writeFile('./replace/binary.png', binaryContent)

      const result = await devboxInstance.replaceInFiles({
        files: ['./replace/binary.png'],
        from: 'old_value',
        to: 'new_value',
      })

      expect(result.results).toBeDefined()
      expect(result.results.length).toBe(1)

      const fileResult = result.results[0]!
      expect(fileResult.status).toBe('skipped')
      expect(fileResult.replacements).toBe(0)
      expect(fileResult.error).toBeDefined()
      expect(fileResult.error).toContain('Binary')
    }, 10000)

    it('should handle UTF-8 content correctly', async () => {
      await devboxInstance.writeFile('./replace/utf8.txt', '你好，世界！Hello, 世界！')

      const result = await devboxInstance.replaceInFiles({
        files: ['./replace/utf8.txt'],
        from: '世界',
        to: 'World',
      })

      expect(result.results.length).toBe(1)
      expect(result.results[0]!.status).toBe('success')
      expect(result.results[0]!.replacements).toBe(2)

      // Verify UTF-8 replacement
      const content = await devboxInstance.readFile('./replace/utf8.txt')
      expect(content.toString()).toBe('你好，World！Hello, World！')
      expect(content.toString()).not.toContain('世界')
    }, 10000)

    it('should handle mixed success and error results', async () => {
      // Create one valid file and one non-existent file
      const result = await devboxInstance.replaceInFiles({
        files: ['./replace/file1.txt', './replace/nonexistent2.txt'],
        from: 'old_value',
        to: 'new_value',
      })

      expect(result.results.length).toBe(2)

      const successResult = result.results.find(r => r.status === 'success')
      const errorResult = result.results.find(r => r.status === 'error')

      expect(successResult).toBeDefined()
      expect(errorResult).toBeDefined()
      expect(successResult?.replacements).toBeGreaterThan(0)
      expect(errorResult?.replacements).toBe(0)
    }, 10000)
  })

  describe('Integration Tests', () => {
    it('should work together: search -> find -> replace', async () => {
      // Step 1: Create test files
      await devboxInstance.writeFile('./search/config.json', '{"version": "1.0.0"}')
      await devboxInstance.writeFile('./search/src/config.ts', 'export const VERSION = "1.0.0"')
      await devboxInstance.writeFile('./search/other.txt', 'version 1.0.0')

      // Step 2: Search for files with "config" in name
      const searchResult = await devboxInstance.searchFiles({
        dir: './search',
        pattern: 'config',
      })
      expect(searchResult.files.length).toBeGreaterThan(0)

      // Step 3: Find files containing "1.0.0"
      const findResult = await devboxInstance.findInFiles({
        dir: './search',
        keyword: '1.0.0',
      })
      expect(findResult.files.length).toBeGreaterThan(0)

      // Step 4: Replace version in found files
      const replaceResult = await devboxInstance.replaceInFiles({
        files: findResult.files,
        from: '1.0.0',
        to: '2.0.0',
      })

      expect(replaceResult.results.length).toBeGreaterThan(0)
      expect(replaceResult.results.some(r => r.status === 'success')).toBe(true)

      // Step 5: Verify replacement
      const verifyResult = await devboxInstance.findInFiles({
        dir: './search',
        keyword: '2.0.0',
      })
      expect(verifyResult.files.length).toBeGreaterThan(0)
    }, 20000)
  })
})

