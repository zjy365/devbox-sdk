import type { DevboxSDKConfig } from '../src/core/types'

if (!process.env.DEVBOX_API_URL) {
  throw new Error('Missing required environment variable: DEVBOX_API_URL')
}

if (!process.env.KUBECONFIG) {
  throw new Error('Missing required environment variable: KUBECONFIG')
}

export const TEST_CONFIG: DevboxSDKConfig = {
  baseUrl: process.env.DEVBOX_API_URL,
  kubeconfig: process.env.KUBECONFIG,
  mockServerUrl: process.env.MOCK_SERVER_URL,
  http: {
    timeout: 300000,
    retries: 3,
    rejectUnauthorized: false,
  },
}

