/**
 * File Operations Handler
 * Handles file reading, writing, and directory operations
 */

import { resolve } from 'node:path'
import { promises as fs } from 'node:fs'
import type {
  BatchUploadRequest,
  FileOperationResult,
  ReadFileRequest,
  WriteFileRequest,
} from '../types/server'
import type { FileWatcher } from '../utils/file-watcher'
import { getContentType, validatePath } from '../utils/path-validator'

export class FileHandler {
  private workspacePath: string
  private fileWatcher: FileWatcher

  constructor(workspacePath: string, fileWatcher: FileWatcher) {
    this.workspacePath = workspacePath
    this.fileWatcher = fileWatcher
  }

  async handleWriteFile(request: WriteFileRequest): Promise<Response> {
    try {
      const fullPath = this.resolvePath(request.path)
      validatePath(fullPath, this.workspacePath)

      // Decode content if base64 encoded
      let content: string | Uint8Array = request.content
      if (request.encoding === 'base64') {
        content = Buffer.from(request.content, 'base64')
      }

      // Use Bun's native file API
      await Bun.write(fullPath, content)

      // Set permissions if specified
      if (request.permissions) {
        // Note: Bun doesn't expose chmod directly on file, but we can use process
        // This is optional functionality, so we'll skip for now
      }

      // Trigger file watcher event
      this.fileWatcher.emit('change', {
        type: 'change',
        path: request.path,
        timestamp: Date.now(),
      })

      return Response.json({
        success: true,
        path: request.path,
        size: content.length,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      return this.createErrorResponse(error instanceof Error ? error.message : 'Unknown error', 500)
    }
  }

  async handleReadFile(request: ReadFileRequest): Promise<Response> {
    try {
      const fullPath = this.resolvePath(request.path)
      validatePath(fullPath, this.workspacePath)

      const file = Bun.file(fullPath)
      const exists = await file.exists()

      if (!exists) {
        return this.createErrorResponse('File not found', 404)
      }

      if (request.encoding === 'binary') {
        const content = await file.arrayBuffer()
        return new Response(content, {
          headers: {
            'Content-Type': getContentType(fullPath),
            'Content-Length': content.byteLength.toString(),
          },
        })
      }

      const content = await file.text()
      return new Response(content, {
        headers: {
          'Content-Type': getContentType(fullPath),
          'Content-Length': content.length.toString(),
        },
      })
    } catch (error) {
      return this.createErrorResponse(error instanceof Error ? error.message : 'Unknown error', 500)
    }
  }

  async handleBatchUpload(request: BatchUploadRequest): Promise<Response> {
    const results: FileOperationResult[] = []

    for (const file of request.files) {
      try {
        const fullPath = this.resolvePath(file.path)
        validatePath(fullPath, this.workspacePath)

        let content: string | Uint8Array = file.content
        if (file.encoding === 'base64') {
          content = Buffer.from(file.content, 'base64')
        }

        await Bun.write(fullPath, content)

        results.push({
          path: file.path,
          success: true,
          size: content.length,
        })

        // Trigger file watcher event
        this.fileWatcher.emit('change', {
          type: 'change',
          path: file.path,
          timestamp: Date.now(),
        })
      } catch (error) {
        results.push({
          path: file.path,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return Response.json({
      success: true,
      results,
      totalFiles: request.files.length,
      successCount: results.filter(r => r.success).length,
    })
  }

  async handleDeleteFile(path: string): Promise<Response> {
    try {
      const fullPath = this.resolvePath(path)
      validatePath(fullPath, this.workspacePath)

      await Bun.file(fullPath).delete()

      // Trigger file watcher event
      this.fileWatcher.emit('change', {
        type: 'unlink',
        path,
        timestamp: Date.now(),
      })

      return Response.json({
        success: true,
        path,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      return this.createErrorResponse(error instanceof Error ? error.message : 'Unknown error', 500)
    }
  }

  async handleListFiles(path: string): Promise<Response> {
    try {
      const fullPath = this.resolvePath(path)
      validatePath(fullPath, this.workspacePath)

      const files = []

      // Check if path exists and is a directory
      const dir = Bun.file(fullPath)
      const exists = await dir.exists()

      if (!exists) {
        return this.createErrorResponse('Directory not found', 404)
      }

      // List directory contents
      try {
        const entries = await fs.readdir(fullPath, { withFileTypes: true })

        for (const entry of entries) {
          const entryPath = `${fullPath}/${entry.name}`
          const stat = await fs.stat(entryPath)

          files.push({
            name: entry.name,
            path: `${path}/${entry.name}`.replace(/\/+/g, '/'),
            type: entry.isDirectory() ? 'directory' : 'file',
            size: entry.isFile() ? stat.size : 0,
            modified: stat.mtime.toISOString(),
          })
        }
      } catch (dirError) {
        // If it's not a directory, check if it's a file
        try {
          const stat = await fs.stat(fullPath)
          if (stat.isFile()) {
            return this.createErrorResponse('Path is a file, not a directory', 400)
          }
        } catch {
          // Path doesn't exist or is not accessible
        }
        throw dirError
      }

      return Response.json({
        success: true,
        path,
        files,
        count: files.length,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      return this.createErrorResponse(error instanceof Error ? error.message : 'Unknown error', 500)
    }
  }

  private resolvePath(path: string): string {
    // Strip leading slashes to treat as relative path
    const cleanPath = path.replace(/^\/+/, '')
    return resolve(this.workspacePath, cleanPath)
  }

  private createErrorResponse(message: string, status: number): Response {
    return Response.json(
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status }
    )
  }
}
