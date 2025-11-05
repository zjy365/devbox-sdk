/**
 * Devbox HTTP Server Entry Point
 * Main server bootstrap and startup
 */

import { DevboxHTTPServer } from './server'

const server = new DevboxHTTPServer({
  port: Number.parseInt(process.env.PORT || '9757'),
  host: process.env.HOST || '0.0.0.0',
  workspacePath: process.env.WORKSPACE_PATH || '/workspace',
  enableCors: process.env.ENABLE_CORS === 'true',
  maxFileSize: Number.parseInt(process.env.MAX_FILE_SIZE || '104857600'), // 100MB
})

console.log(process.env.WORKSPACE_PATH)

server.start().catch(error => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
