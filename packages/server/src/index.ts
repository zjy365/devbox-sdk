/**
 * Devbox HTTP Server Entry Point
 * Main server bootstrap and startup
 */

import { DevboxHTTPServer } from './server'

const server = new DevboxHTTPServer({
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  workspacePath: process.env.WORKSPACE_PATH || '/workspace',
  enableCors: process.env.ENABLE_CORS === 'true',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600') // 100MB
})

server.start().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})