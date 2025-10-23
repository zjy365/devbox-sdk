/**
 * Path Validation Utilities
 */

import { lookup } from 'mime-types'
import { resolve } from 'path'

export function validatePath(path: string, allowedBase: string): void {
  const normalizedPath = resolve(allowedBase, path)

  if (!normalizedPath.startsWith(allowedBase)) {
    throw new Error('Path traversal detected')
  }
}

export function getContentType(filePath: string): string {
  const mimeType = lookup(filePath)
  return mimeType || 'application/octet-stream'
}

export function sanitizePath(path: string): string {
  return path.replace(/\/+/g, '/').replace(/\/+$/, '')
}