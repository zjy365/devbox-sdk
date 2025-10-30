/**
 * Path Validation Utilities
 */

import { isAbsolute, relative, resolve, sep } from 'path'
import { lookup } from 'mime-types'

/**
 * Normalize and validate a user-provided path
 * - Strips leading slashes to treat as relative path
 * - Prevents path traversal attacks (../)
 * - Ensures the resolved path stays within allowedBase
 */
export function validatePath(path: string, allowedBase: string): void {
  // Strip leading slashes to treat as relative path
  const cleanPath = path.replace(/^\/+/, '')

  // Resolve against the allowed base
  const normalizedBase = resolve(allowedBase)
  const normalizedPath = resolve(normalizedBase, cleanPath)

  // Check if the resolved path is within the allowed base
  const relativePath = relative(normalizedBase, normalizedPath)

  // Path is invalid if:
  // 1. It starts with '..' (trying to go outside base)
  // 2. It's an absolute path after resolution (shouldn't happen but defense in depth)
  if (relativePath.startsWith('..' + sep) || relativePath === '..' || isAbsolute(relativePath)) {
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
