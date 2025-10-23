/**
 * Devbox HTTP Server Core
 * Main HTTP server implementation using Bun
 */

import type { ServerConfig, HealthResponse, WriteFileRequest, ReadFileRequest, BatchUploadRequest, ProcessExecRequest } from './types/server'
import { FileHandler } from './handlers/files'
import { ProcessHandler } from './handlers/process'
import { WebSocketHandler } from './handlers/websocket'
import { FileWatcher } from './utils/file-watcher'

export class DevboxHTTPServer {
  private config: ServerConfig
  private fileWatcher: FileWatcher
  private fileHandler: FileHandler
  private processHandler: ProcessHandler
  private webSocketHandler: WebSocketHandler

  constructor(config: ServerConfig) {
    this.config = config

    // Initialize components
    this.fileWatcher = new FileWatcher()
    this.fileHandler = new FileHandler(config.workspacePath, this.fileWatcher)
    this.processHandler = new ProcessHandler(config.workspacePath)
    this.webSocketHandler = new WebSocketHandler(this.fileWatcher)
  }

  // Public method to access handlers if needed
  getFileHandler(): FileHandler {
    return this.fileHandler
  }

  getProcessHandler(): ProcessHandler {
    return this.processHandler
  }

  async start(): Promise<void> {
    const server = Bun.serve({
      port: this.config.port,
      hostname: this.config.host,
      fetch: this.handleRequest.bind(this),
      websocket: {
        open: (ws) => {
          this.webSocketHandler.handleConnection(ws)
        },
        message: (ws, message) => {
          // WebSocket messages are handled by the handler
        },
        close: (ws) => {
          // Cleanup is handled by the handler
        },
        error: (ws, error) => {
          console.error('WebSocket error:', error)
        }
      },
      error(error) {
        console.error('Server error:', error)
        return new Response('Internal Server Error', { status: 500 })
      }
    })

    console.log(`🚀 Devbox HTTP Server running on ${this.config.host}:${this.config.port}`)
    console.log(`📁 Workspace: ${this.config.workspacePath}`)

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down server...')
      server.stop()
      process.exit(0)
    })
  }

  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // CORS headers
    if (this.config.enableCors) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
          }
        })
      }
    }

    try {
      switch (url.pathname) {
        // Health check
        case '/health':
          return this.handleHealth()

        // File operations
        case '/files/read':
          if (request.method === 'POST') {
            const body = await request.json() as ReadFileRequest
            return await this.fileHandler.handleReadFile(body)
          }
          return new Response('Method not allowed', { status: 405 })

        case '/files/write':
          if (request.method === 'POST') {
            const body = await request.json() as WriteFileRequest
            return await this.fileHandler.handleWriteFile(body)
          }
          return new Response('Method not allowed', { status: 405 })

        case '/files/delete':
          if (request.method === 'POST') {
            const body = await request.json() as { path: string }
            return await this.fileHandler.handleDeleteFile(body.path)
          }
          return new Response('Method not allowed', { status: 405 })

        case '/files/batch-upload':
          if (request.method === 'POST') {
            const body = await request.json() as BatchUploadRequest
            return await this.fileHandler.handleBatchUpload(body)
          }
          return new Response('Method not allowed', { status: 405 })

        // Process operations
        case '/process/exec':
          if (request.method === 'POST') {
            const body = await request.json() as ProcessExecRequest
            return await this.processHandler.handleExec(body)
          }
          return new Response('Method not allowed', { status: 405 })

        case '/process/status':
          if (request.method === 'GET') {
            const pid = parseInt(url.searchParams.get('pid') || '0')
            return await this.processHandler.handleStatus(pid)
          }
          return new Response('Method not allowed', { status: 405 })

        // WebSocket endpoint
        case '/ws':
          // WebSocket upgrade is handled by Bun's websocket handler
          // This route is for HTTP fallback only
          return new Response('WebSocket endpoint - please use WebSocket connection', { status: 426 })

        default:
          return new Response('Devbox Server - Available endpoints: /health, /files/*, /process/*, /ws (WebSocket)', { status: 404 })
      }
    } catch (error) {
      console.error('Request handling error:', error)
      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }
  }

  
  private handleHealth(): Response {
    const response: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime()
    }

    const jsonResponse = Response.json(response)

    if (this.config.enableCors) {
      jsonResponse.headers.set('Access-Control-Allow-Origin', '*')
    }

    return jsonResponse
  }
}