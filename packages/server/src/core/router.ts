/**
 * HTTP Router with Pattern Matching
 *
 * Supports path parameters (e.g., /files/:path) and query parameters.
 * Integrates with ServiceContainer for dependency injection.
 */

import type { ServiceContainer } from './container'

export type RouteHandler = (req: Request, params: RouteParams) => Promise<Response>

export interface RouteParams {
  path: Record<string, string>
  query: Record<string, string>
}

export interface RouteMatch {
  handler: RouteHandler
  params: RouteParams
}

export class Router {
  private routes = new Map<string, Map<string, RouteHandler>>()

  constructor(private container?: ServiceContainer) {}

  /**
   * Register a route handler
   * @param method - HTTP method (GET, POST, etc.)
   * @param pattern - URL pattern with optional :param placeholders
   * @param handler - Route handler function
   */
  register(method: string, pattern: string, handler: RouteHandler): void {
    const normalizedMethod = method.toUpperCase()

    if (!this.routes.has(normalizedMethod)) {
      this.routes.set(normalizedMethod, new Map())
    }

    this.routes.get(normalizedMethod)!.set(pattern, handler)
  }

  /**
   * Match a request to a registered route
   * @param method - HTTP method
   * @param url - Request URL (path + query string)
   * @returns RouteMatch if found, null otherwise
   */
  match(method: string, url: string): RouteMatch | null {
    const normalizedMethod = method.toUpperCase()
    const methodRoutes = this.routes.get(normalizedMethod)

    if (!methodRoutes) {
      return null
    }

    // Parse URL to separate path and query
    const urlObj = new URL(url, 'http://localhost')
    const path = urlObj.pathname
    const query = this.parseQueryParams(urlObj.searchParams)

    // Try to match against each registered pattern
    for (const [pattern, handler] of methodRoutes) {
      const pathParams = this.matchPattern(pattern, path)
      if (pathParams !== null) {
        return {
          handler,
          params: {
            path: pathParams,
            query,
          },
        }
      }
    }

    return null
  }

  /**
   * Match a URL path against a pattern
   * @param pattern - Pattern with :param placeholders
   * @param path - Actual URL path
   * @returns Object with extracted params, or null if no match
   */
  private matchPattern(pattern: string, path: string): Record<string, string> | null {
    const patternParts = pattern.split('/').filter(Boolean)
    const pathParts = path.split('/').filter(Boolean)

    // Must have same number of segments
    if (patternParts.length !== pathParts.length) {
      return null
    }

    const params: Record<string, string> = {}

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i]!
      const pathPart = pathParts[i]!

      if (patternPart.startsWith(':')) {
        // Dynamic segment - extract parameter
        const paramName = patternPart.slice(1)
        params[paramName] = decodeURIComponent(pathPart)
      } else if (patternPart !== pathPart) {
        // Static segment must match exactly
        return null
      }
    }

    return params
  }

  /**
   * Parse query parameters from URLSearchParams
   */
  private parseQueryParams(searchParams: URLSearchParams): Record<string, string> {
    const query: Record<string, string> = {}
    for (const [key, value] of searchParams.entries()) {
      query[key] = value
    }
    return query
  }

  /**
   * Get a service from the container
   * @param name - Service identifier
   * @returns Service instance
   * @throws Error if container not provided or service not found
   */
  getService<T>(name: string): T {
    if (!this.container) {
      throw new Error('Container not provided to router')
    }
    return this.container.get<T>(name)
  }

  /**
   * Get all registered routes (for debugging)
   */
  getRoutes(): Map<string, Map<string, RouteHandler>> {
    return this.routes
  }
}
