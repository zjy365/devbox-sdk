/**
 * File Operations Handler
 * Handles file reading, writing, and directory operations
 */

import { resolve } from 'path'
import type { WriteFileRequest, ReadFileRequest, BatchUploadRequest, FileOperationResult } from '../types/server'
import { validatePath, getContentType } from '../utils/path-validator'
import { FileWatcher } from '../utils/file-watcher'

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
        timestamp: Date.now()
      })

      return Response.json({
        success: true,
        path: request.path,
        size: content.length,
        timestamp: new Date().toISOString()
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
            'Content-Length': content.byteLength.toString()
          }
        })
      } else {
        const content = await file.text()
        return new Response(content, {
          headers: {
            'Content-Type': getContentType(fullPath),
            'Content-Length': content.length.toString()
          }
        })
      }
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
          size: content.length
        })

        // Trigger file watcher event
        this.fileWatcher.emit('change', {
          type: 'change',
          path: file.path,
          timestamp: Date.now()
        })
      } catch (error) {
        results.push({
          path: file.path,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return Response.json({
      success: true,
      results,
      totalFiles: request.files.length,
      successCount: results.filter(r => r.success).length
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
        timestamp: Date.now()
      })

      return Response.json({
        success: true,
        path,
        timestamp: new Date().toISOString()
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
    return Response.json({
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    }, { status })
  }
}