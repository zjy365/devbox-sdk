/**
 * WebSocket Handler
 * Handles real-time file watching and communication
 */

import type { FileChangeEvent } from '../types/server'
import { FileWatcher } from '../utils/file-watcher'

export class WebSocketHandler {
  private connections = new Set<WebSocket>()
  private fileWatcher: FileWatcher

  constructor(fileWatcher: FileWatcher) {
    this.fileWatcher = fileWatcher
    this.setupFileWatcher()
  }

  handleConnection(ws: WebSocket): void {
    this.connections.add(ws)

    ws.onopen = () => {
      console.log('WebSocket connection established')
    }

    ws.onclose = () => {
      this.connections.delete(ws)
      console.log('WebSocket connection closed')
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      this.connections.delete(ws)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data.toString())
        this.handleMessage(ws, message)
      } catch (error) {
        console.error('Invalid WebSocket message:', error)
        this.sendError(ws, 'Invalid message format')
      }
    }
  }

  private handleMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'watch':
        this.handleWatchRequest(ws, message.path)
        break
      case 'unwatch':
        this.handleUnwatchRequest(ws, message.path)
        break
      default:
        this.sendError(ws, 'Unknown message type')
    }
  }

  private handleWatchRequest(ws: WebSocket, path: string): void {
    try {
      this.fileWatcher.startWatching(path, ws)
      this.sendSuccess(ws, { type: 'watch', path, status: 'started' })
    } catch (error) {
      this.sendError(ws, error instanceof Error ? error.message : 'Failed to start watching')
    }
  }

  private handleUnwatchRequest(ws: WebSocket, path: string): void {
    try {
      this.fileWatcher.stopWatching(path, ws)
      this.sendSuccess(ws, { type: 'unwatch', path, status: 'stopped' })
    } catch (error) {
      this.sendError(ws, error instanceof Error ? error.message : 'Failed to stop watching')
    }
  }

  private setupFileWatcher(): void {
    this.fileWatcher.on('change', (event: FileChangeEvent) => {
      this.broadcastToAll({
        type: 'file-change',
        event
      })
    })
  }

  private broadcastToAll(data: any): void {
    const message = JSON.stringify(data)

    this.connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message)
        } catch (error) {
          console.error('Failed to send WebSocket message:', error)
          this.connections.delete(ws)
        }
      }
    })
  }

  private sendSuccess(ws: WebSocket, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        success: true,
        ...data
      }))
    }
  }

  private sendError(ws: WebSocket, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        success: false,
        error: message
      }))
    }
  }
}