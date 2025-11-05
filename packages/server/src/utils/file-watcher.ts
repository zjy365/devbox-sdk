/**
 * File Watcher Utility
 * Chokidar-based file watching implementation
 */

import { watch } from 'chokidar'
import type { FileChangeEvent } from '../types/server'

export class FileWatcher extends EventTarget {
  private watchers = new Map<string, Set<any>>()
  private fileWatchers = new Map<string, any>() // Chokidar watcher instances

  startWatching(path: string, ws: any): void {
    let watcherSet = this.watchers.get(path)

    if (!watcherSet) {
      watcherSet = new Set()
      this.watchers.set(path, watcherSet)

      // Start chokidar watcher if this is the first subscription
      const watcher = watch(path, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: false,
      })

      watcher.on('change', filePath => {
        this.broadcastFileChange({
          type: 'change',
          path: filePath,
          timestamp: Date.now(),
        })
      })

      watcher.on('add', filePath => {
        this.broadcastFileChange({
          type: 'add',
          path: filePath,
          timestamp: Date.now(),
        })
      })

      watcher.on('unlink', filePath => {
        this.broadcastFileChange({
          type: 'unlink',
          path: filePath,
          timestamp: Date.now(),
        })
      })

      this.fileWatchers.set(path, watcher)
    }

    watcherSet.add(ws)
  }

  stopWatching(path: string, ws: any): void {
    const watchers = this.watchers.get(path)
    if (watchers) {
      watchers.delete(ws)
      if (watchers.size === 0) {
        // Stop chokidar watcher if no more subscribers
        const fileWatcher = this.fileWatchers.get(path)
        if (fileWatcher) {
          fileWatcher.close()
          this.fileWatchers.delete(path)
        }
        this.watchers.delete(path)
      }
    }
  }

  private broadcastFileChange(event: FileChangeEvent): void {
    this.emit('change', event)
  }

  emit(event: string, data: FileChangeEvent): void {
    const customEvent = new CustomEvent(event, { detail: data })
    this.dispatchEvent(customEvent)
  }

  on(event: string, callback: (data: FileChangeEvent) => void): void {
    this.addEventListener(event, (e: any) => callback(e.detail))
  }
}
