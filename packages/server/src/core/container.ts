/**
 * Dependency Injection Container
 *
 * Provides service registration and lazy initialization following
 * the Cloudflare Sandbox SDK pattern.
 */

export type ServiceFactory<T> = () => T

interface ServiceEntry {
  factory: ServiceFactory<any>
  instance: any
}

export class ServiceContainer {
  private services = new Map<string, ServiceEntry>()

  /**
   * Register a service factory
   * @param name - Service identifier
   * @param factory - Factory function that creates the service instance
   */
  register<T>(name: string, factory: ServiceFactory<T>): void {
    this.services.set(name, { factory, instance: null })
  }

  /**
   * Get a service instance (lazy initialization)
   * @param name - Service identifier
   * @returns The service instance
   * @throws Error if service not found
   */
  get<T>(name: string): T {
    const service = this.services.get(name)
    if (!service) {
      throw new Error(`Service "${name}" not found in container`)
    }

    // Lazy initialization - create instance only on first access
    if (!service.instance) {
      service.instance = service.factory()
    }

    return service.instance as T
  }

  /**
   * Check if a service exists
   * @param name - Service identifier
   * @returns true if service is registered
   */
  has(name: string): boolean {
    return this.services.has(name)
  }

  /**
   * Clear all services (useful for testing)
   */
  clear(): void {
    this.services.clear()
  }

  /**
   * Get the number of registered services
   */
  get size(): number {
    return this.services.size
  }
}
