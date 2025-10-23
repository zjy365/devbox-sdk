/**
 * kubeconfig-based authentication for Sealos platform
 */

import { DevboxSDKError, ERROR_CODES } from '../utils/error'
import type { KubeconfigAuth } from './types'

export class KubeconfigAuthenticator {
  private auth: KubeconfigAuth

  constructor (kubeconfig: string) {
    this.auth = { kubeconfig }
    this.validateKubeconfig()
  }

  /**
   * Get authorization headers for API requests
   */
  getAuthHeaders (): Record<string, string> {
    return {
      Authorization: `Bearer ${this.auth.kubeconfig}`,
      'Content-Type': 'application/json'
    }
  }

  /**
   * Validate the kubeconfig format and content
   */
  private validateKubeconfig (): void {
    if (!this.auth.kubeconfig || typeof this.auth.kubeconfig !== 'string') {
      throw new DevboxSDKError(
        'kubeconfig is required and must be a string',
        ERROR_CODES.INVALID_KUBECONFIG
      )
    }

    try {
      // Basic validation - try to parse if it's JSON
      if (this.auth.kubeconfig.trim().startsWith('{')) {
        JSON.parse(this.auth.kubeconfig)
      }
    } catch (error) {
      throw new DevboxSDKError(
        'Invalid kubeconfig format: Unable to parse kubeconfig content',
        ERROR_CODES.INVALID_KUBECONFIG,
        { originalError: error }
      )
    }

    // Additional validation could be added here
    // For now, we assume the Sealos platform will validate the actual token
  }

  /**
   * Test the authentication with a simple API call
   */
  async testAuthentication (apiClient: any): Promise<boolean> {
    try {
      // Try to list devboxes as a test
      await apiClient.get('/api/v1/devbox', {
        headers: this.getAuthHeaders()
      })
      return true
    } catch (error) {
      if (error instanceof DevboxSDKError &&
          (error.code === ERROR_CODES.AUTHENTICATION_FAILED ||
           error.code === 'UNAUTHORIZED')) {
        throw new DevboxSDKError(
          'Authentication failed: Invalid or expired kubeconfig',
          ERROR_CODES.AUTHENTICATION_FAILED,
          { originalError: error }
        )
      }
      // Other errors might be network/server related, not auth
      return false
    }
  }

  /**
   * Get the raw kubeconfig content
   */
  getKubeconfig (): string {
    return this.auth.kubeconfig
  }

  /**
   * Update the kubeconfig
   */
  updateKubeconfig (kubeconfig: string): void {
    this.auth.kubeconfig = kubeconfig
    this.validateKubeconfig()
  }
}
