import yaml from 'js-yaml'
import { DevboxSDKError, ERROR_CODES } from './error'

interface KubeconfigCluster {
  cluster: {
    server: string
    [key: string]: unknown
  }
  name: string
}

interface KubeconfigContext {
  context: {
    cluster: string
    user: string
    [key: string]: unknown
  }
  name: string
}

interface Kubeconfig {
  apiVersion?: string
  clusters?: KubeconfigCluster[]
  contexts?: KubeconfigContext[]
  'current-context'?: string
  currentContext?: string
  [key: string]: unknown
}

/**
 * Parse kubeconfig YAML string and extract the API server URL
 * @param kubeconfig - Kubeconfig content as YAML string
 * @returns The server URL from the current context's cluster, or null if not found
 * @throws DevboxSDKError if kubeconfig is invalid or cannot be parsed
 */
export function parseKubeconfigServerUrl(kubeconfig: string): string | null {
  if (!kubeconfig || typeof kubeconfig !== 'string') {
    return null
  }

  try {
    const config = yaml.load(kubeconfig) as Kubeconfig

    if (!config) {
      return null
    }

    // Get current context (support both 'current-context' and 'currentContext')
    const currentContextName = config['current-context'] || config.currentContext
    if (!currentContextName) {
      return null
    }

    // Find the current context
    const contexts = config.contexts || []
    const currentContext = contexts.find(
      (ctx: KubeconfigContext) => ctx.name === currentContextName
    )

    if (!currentContext || !currentContext.context) {
      return null
    }

    // Get cluster name from context
    const clusterName = currentContext.context.cluster
    if (!clusterName) {
      return null
    }

    // Find the cluster
    const clusters = config.clusters || []
    const cluster = clusters.find((cl: KubeconfigCluster) => cl.name === clusterName)

    if (!cluster || !cluster.cluster) {
      return null
    }

    // Extract server URL
    const serverUrl = cluster.cluster.server
    if (!serverUrl || typeof serverUrl !== 'string') {
      return null
    }

    // Transform URL: add "devbox." prefix to hostname and remove all ports
    // Example: https://192.168.12.53.nip.io:6443 -> https://devbox.192.168.12.53.nip.io
    try {
      const url = new URL(serverUrl)
      // Add "devbox." prefix to hostname
      url.hostname = `devbox.${url.hostname}`
      // Remove all ports (devbox API uses standard HTTPS port)
      url.port = ''
      // Ensure pathname is empty (remove any existing path)
      url.pathname = ''
      // Return URL without trailing slash
      let result = url.toString()
      // Remove trailing slash if present
      if (result.endsWith('/')) {
        result = result.slice(0, -1)
      }
      return result
    } catch (_urlError) {
      // If URL parsing fails, return original URL
      return serverUrl
    }
  } catch (_error) {
    // If parsing fails, return null (will fallback to default)
    // Don't throw error to allow fallback to default URL
    return null
  }
}

