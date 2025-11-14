import { DevboxSDKError, ERROR_CODES } from '../utils/error'

export class KubeconfigAuthenticator {
  private token: string

  constructor(kubeconfig: string) {
    if (!kubeconfig || typeof kubeconfig !== 'string') {
      throw new DevboxSDKError(
        'kubeconfig is required and must be a string',
        ERROR_CODES.INVALID_KUBECONFIG
      )
    }
    // URL encoding is required because the devbox API expects it;
    this.token = encodeURIComponent(kubeconfig)
  }

  getAuthHeaders(): Record<string, string> {
    return {
      Authorization: this.token,
    }
  }
}
