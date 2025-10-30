/**
 * Security Adapter
 * Provides enterprise-level security features
 */

export class SecurityAdapter {
  private static instance: SecurityAdapter

  static getInstance(): SecurityAdapter {
    if (!SecurityAdapter.instance) {
      SecurityAdapter.instance = new SecurityAdapter()
    }
    return SecurityAdapter.instance
  }

  validatePath(path: string): boolean {
    // Basic path validation to prevent directory traversal
    const normalizedPath = path.replace(/\\/g, '/')
    return !normalizedPath.includes('../') && !normalizedPath.startsWith('/')
  }

  sanitizeInput(input: string): string {
    // Basic input sanitization
    return input.trim()
  }

  validatePermissions(requiredPermissions: string[], userPermissions: string[]): boolean {
    return requiredPermissions.every(permission => userPermissions.includes(permission))
  }
}
