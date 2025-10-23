/**
 * Devbox SDK - Main Entry Point
 * Enterprise TypeScript SDK for Sealos Devbox management
 */

// Basic version export
export const VERSION = '1.0.0'

// Export a basic class for now
export class DevboxSDK {
  constructor(public config: any) {}

  async hello() {
    return 'Hello from Devbox SDK v' + VERSION
  }
}

// Default export
export default DevboxSDK
