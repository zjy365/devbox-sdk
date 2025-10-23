/**
 * Devbox HTTP Server Core
 * Main HTTP server implementation using Bun
 */

import type { ServerConfig, HealthResponse } from './types/server'
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
    // Simplified constructor - just store config for now
  }

  async start(): Promise<void> {
    const server = Bun.serve({
      port: this.config.port,
      hostname: this.config.host,
      fetch: this.handleRequest.bind(this),
      // Temporarily disable websocket until handler is properly implemented
      // websocket: {
      //   open: (ws) => {
      //     this.webSocketHandler.handleConnection(ws)
      //   },
      //   message: (ws, message) => {
      //     // Handle websocket message if needed
      //   },
      //   close: (ws) => {
      //     // Handle websocket close if needed
      //   },
      //   error: (ws, error) => {
      //     console.error('WebSocket error:', error)
      //   }
      // },
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
        case '/health':
          return this.handleHealth()

        default:
          return new Response('Devbox Server - Use /health for status check', { status: 200 })
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