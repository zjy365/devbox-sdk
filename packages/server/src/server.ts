/**
 * Devbox HTTP Server Core
 * Main HTTP server implementation using Bun with Router + DI Container architecture
 */

import type { 
  ServerConfig, 
  ReadFileRequest, 
  WriteFileRequest, 
  BatchUploadRequest, 
  ProcessExecRequest,
  CreateSessionRequest,
  UpdateSessionEnvRequest,
  SessionExecRequest,
  SessionChangeDirRequest
} from './types/server'
import { ServiceContainer } from './core/container'
import { Router } from './core/router'
import { 
  corsMiddleware, 
  loggerMiddleware, 
  errorHandlerMiddleware,
  executeMiddlewares 
} from './core/middleware'
import { 
  validateRequestBody, 
  validateQueryParams, 
  validatePathParams 
} from './core/validation-middleware'
import { z } from 'zod'
import {
  WriteFileRequestSchema,
  ReadFileRequestSchema,
  BatchUploadRequestSchema,
  ProcessExecRequestSchema,
  ProcessKillRequestSchema,
  ProcessLogsQuerySchema,
  CreateSessionRequestSchema,
  UpdateSessionEnvRequestSchema,
  TerminateSessionRequestSchema,
  SessionExecRequestSchema,
  SessionChangeDirRequestSchema,
  SessionQuerySchema
} from './validators/schemas'
import { FileHandler } from './handlers/files'
import { ProcessHandler } from './handlers/process'
import { SessionHandler } from './handlers/session'
import { HealthHandler } from './handlers/health'
import { WebSocketHandler } from './handlers/websocket'
import { FileWatcher } from './utils/file-watcher'
import { ProcessTracker } from './utils/process-tracker'
import { SessionManager } from './session/manager'
import { createLogger, type Logger } from '@sealos/devbox-shared/logger'

export class DevboxHTTPServer {
  private config: ServerConfig
  private container: ServiceContainer
  private router: Router
  private middlewares: any[]

  constructor(config: ServerConfig) {
    this.config = config
    this.container = new ServiceContainer()
    this.router = new Router(this.container)
    this.middlewares = []
    
    this.setupServices()
    this.setupMiddlewares()
    this.setupRoutes()
  }

  private setupServices(): void {
    // Core services
    this.container.register('logger', () => createLogger())
    this.container.register('fileWatcher', () => new FileWatcher())
    this.container.register('processTracker', () => new ProcessTracker())
    this.container.register('sessionManager', () => new SessionManager())
    
    // Handlers
    this.container.register('fileHandler', () => {
      const fileWatcher = this.container.get<FileWatcher>('fileWatcher')
      return new FileHandler(this.config.workspacePath, fileWatcher)
    })

    this.container.register('processHandler', () => {
      const processTracker = this.container.get<ProcessTracker>('processTracker')
      return new ProcessHandler(this.config.workspacePath, processTracker)
    })

    this.container.register('sessionHandler', () => {
      const sessionManager = this.container.get<SessionManager>('sessionManager')
      return new SessionHandler(sessionManager)
    })

    this.container.register('healthHandler', () => {
      const sessionManager = this.container.get<SessionManager>('sessionManager')
      return new HealthHandler(sessionManager)
    })

    this.container.register('webSocketHandler', () => {
      const fileWatcher = this.container.get<FileWatcher>('fileWatcher')
      return new WebSocketHandler(fileWatcher)
    })
  }

  private setupMiddlewares(): void {
    this.middlewares = [
      loggerMiddleware(this.container.get<Logger>('logger')),
      this.config.enableCors ? corsMiddleware() : null,
      errorHandlerMiddleware()
    ].filter(Boolean)
  }

  private setupRoutes(): void {
    const fileHandler = this.container.get<FileHandler>('fileHandler')
    const processHandler = this.container.get<ProcessHandler>('processHandler')
    const sessionHandler = this.container.get<SessionHandler>('sessionHandler')
    const healthHandler = this.container.get<HealthHandler>('healthHandler')

    // Health
    this.router.register('GET', '/health', async (req) => {
      return await healthHandler.handleHealth()
    })

    this.router.register('GET', '/metrics', async (req) => {
      return await healthHandler.handleMetrics()
    })

    this.router.register('GET', '/health/detailed', async (req) => {
      return await healthHandler.getDetailedHealth()
    })

    // Files
    this.router.register('POST', '/files/read', async (req) => {
      const validation = await validateRequestBody(req, ReadFileRequestSchema)
      if (!validation.success) {
        return validation.response
      }
      return await fileHandler.handleReadFile(validation.data)
    })

    this.router.register('POST', '/files/write', async (req) => {
      const validation = await validateRequestBody(req, WriteFileRequestSchema)
      if (!validation.success) {
        return validation.response
      }
      return await fileHandler.handleWriteFile(validation.data)
    })

    this.router.register('POST', '/files/delete', async (req) => {
      const validation = await validateRequestBody(req, z.object({ path: z.string().min(1) }))
      if (!validation.success) {
        return validation.response
      }
      return await fileHandler.handleDeleteFile(validation.data.path)
    })

    this.router.register('POST', '/files/batch-upload', async (req) => {
      const validation = await validateRequestBody(req, BatchUploadRequestSchema)
      if (!validation.success) {
        return validation.response
      }
      return await fileHandler.handleBatchUpload(validation.data)
    })

    // Processes
    this.router.register('POST', '/process/exec', async (req) => {
      const validation = await validateRequestBody(req, ProcessExecRequestSchema)
      if (!validation.success) {
        return validation.response
      }
      return await processHandler.handleExec(validation.data)
    })

    this.router.register('GET', '/process/status/:id', async (req, params) => {
      const validation = validatePathParams(params.path, SessionQuerySchema)
      if (!validation.success) {
        return validation.response
      }
      return await processHandler.handleStatus(validation.data.id)
    })

    this.router.register('POST', '/process/kill', async (req) => {
      const validation = await validateRequestBody(req, ProcessKillRequestSchema)
      if (!validation.success) {
        return validation.response
      }
      return await processHandler.handleKillProcess(validation.data.id, validation.data.signal)
    })

    this.router.register('GET', '/process/list', async (req) => {
      return await processHandler.handleListProcesses()
    })

    this.router.register('GET', '/process/logs/:id', async (req, params) => {
      const pathValidation = validatePathParams(params.path, SessionQuerySchema)
      if (!pathValidation.success) {
        return pathValidation.response
      }
      
      const queryValidation = validateQueryParams(req, ProcessLogsQuerySchema)
      if (!queryValidation.success) {
        return queryValidation.response
      }
      
      return await processHandler.handleGetProcessLogs(pathValidation.data.id, queryValidation.data.tail)
    })

    // Sessions
    this.router.register('POST', '/sessions/create', async (req) => {
      const validation = await validateRequestBody(req, CreateSessionRequestSchema)
      if (!validation.success) {
        return validation.response
      }
      return await sessionHandler.handleCreateSession(validation.data)
    })

    this.router.register('GET', '/sessions/:id', async (req, params) => {
      const validation = validatePathParams(params.path, SessionQuerySchema)
      if (!validation.success) {
        return validation.response
      }
      return await sessionHandler.handleGetSession(validation.data.id)
    })

    this.router.register('POST', '/sessions/:id/env', async (req, params) => {
      const pathValidation = validatePathParams(params.path, SessionQuerySchema)
      if (!pathValidation.success) {
        return pathValidation.response
      }
      
      const bodyValidation = await validateRequestBody(req, z.object({ env: z.record(z.string()) }))
      if (!bodyValidation.success) {
        return bodyValidation.response
      }
      
      const request: UpdateSessionEnvRequest = {
        id: pathValidation.data.id,
        env: bodyValidation.data.env
      }
      return await sessionHandler.handleUpdateSessionEnv(request)
    })

    this.router.register('POST', '/sessions/:id/terminate', async (req, params) => {
      const validation = validatePathParams(params.path, SessionQuerySchema)
      if (!validation.success) {
        return validation.response
      }
      return await sessionHandler.handleTerminateSession({ id: validation.data.id })
    })

    this.router.register('GET', '/sessions', async (req) => {
      return await sessionHandler.handleListSessions()
    })

    this.router.register('POST', '/sessions/:id/exec', async (req, params) => {
      const pathValidation = validatePathParams(params.path, SessionQuerySchema)
      if (!pathValidation.success) {
        return pathValidation.response
      }
      
      const bodyValidation = await validateRequestBody(req, z.object({ command: z.string().min(1) }))
      if (!bodyValidation.success) {
        return bodyValidation.response
      }
      
      return await sessionHandler.handleExecuteCommand(pathValidation.data.id, bodyValidation.data.command)
    })

    this.router.register('POST', '/sessions/:id/cd', async (req, params) => {
      const pathValidation = validatePathParams(params.path, SessionQuerySchema)
      if (!pathValidation.success) {
        return pathValidation.response
      }
      
      const bodyValidation = await validateRequestBody(req, z.object({ path: z.string().min(1) }))
      if (!bodyValidation.success) {
        return bodyValidation.response
      }
      
      return await sessionHandler.handleChangeDirectory(pathValidation.data.id, bodyValidation.data.path)
    })

    // WebSocket endpoint
    this.router.register('GET', '/ws', async (req) => {
      return new Response('WebSocket endpoint - please use WebSocket connection', { status: 426 })
    })
  }

  // Public method to access handlers if needed
  getFileHandler(): FileHandler {
    return this.container.get<FileHandler>('fileHandler')
  }

  getProcessHandler(): ProcessHandler {
    return this.container.get<ProcessHandler>('processHandler')
  }

  async start(): Promise<void> {
    const webSocketHandler = this.container.get<WebSocketHandler>('webSocketHandler')
    
    const server = Bun.serve({
      port: this.config.port,
      hostname: this.config.host,
      fetch: this.handleRequest.bind(this),
      websocket: {
        open: (ws) => {
          webSocketHandler.handleConnection(ws)
        },
        message: (ws, message) => {
          // WebSocket messages are handled by the handler
        },
        close: (ws) => {
          // Cleanup is handled by the handler
        }
      },
      error(error) {
        console.error('Server error:', error)
        return new Response('Internal Server Error', { status: 500 })
      }
    })

    const logger = this.container.get<Logger>('logger')
    logger.info(`🚀 Devbox HTTP Server running on ${this.config.host}:${this.config.port}`)
    logger.info(`📁 Workspace: ${this.config.workspacePath}`)

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('\nShutting down server...')
      server.stop()
      process.exit(0)
    })
  }

  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)
    
    // Match route
    const match = this.router.match(request.method, url.pathname)
    if (!match) {
      return new Response('Devbox Server - Available endpoints: /health, /files/*, /process/*, /ws (WebSocket)', { status: 404 })
    }

    // Execute middlewares + handler
    return await executeMiddlewares(request, this.middlewares, async () => {
      return await match.handler(request, match.params)
    })
  }
}