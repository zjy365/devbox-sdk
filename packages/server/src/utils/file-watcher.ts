/**
 * File Watcher Utility
 * Simple file watching implementation
 */

import type { FileChangeEvent } from '../types/server'

export class FileWatcher extends EventTarget {
  private watchers = new Map<string, Set<WebSocket>>()

  startWatching(path: string, ws: WebSocket): void {
    if (!this.watchers.has(path)) {
      this.watchers.set(path, new Set())
    }
    this.watchers.get(path)!.add(ws)
  }

  stopWatching(path: string, ws: WebSocket): void {
    const watchers = this.watchers.get(path)
    if (watchers) {
      watchers.delete(ws)
      if (watchers.size === 0) {
        this.watchers.delete(path)
      }
    }
  }

  emit(event: string, data: FileChangeEvent): void {
    const customEvent = new CustomEvent(event, { detail: data })
    this.dispatchEvent(customEvent)
  }

  on(event: string, callback: (data: FileChangeEvent) => void): void {
    this.addEventListener(event, (e: any) => callback(e.detail))
  }
}