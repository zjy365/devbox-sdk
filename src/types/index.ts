/**
 * Options for creating a new DevBox
 */
export interface DevBoxOptions {
  /**
   * Runtime for the DevBox
   * @example 'next.js-14-2-5-2024-11-13-0835'
   */
  runtime: Runtime;

  /**
   * Kubeconfig for authorization
   */
  kubeconfig: string;
}

/**
 * Available runtime options for DevBox
 */
export type Runtime =
  | 'next.js-14-2-5-2024-11-13-0835'
  | 'node.js-22-2024-11-13-0700'
  | 'node.js-18-2024-11-13-0700'
  | 'node.js-20-2024-11-13-0700'
  | 'python-3-10-2024-11-12-0651'
  | 'python-3-11-2024-11-12-0651'
  | 'python-3-12-2024-11-12-0651'
  | 'react-18-2-0-2024-11-13-0835'
  | 'vue-v3-4-29-2024-11-13-0835';

/**
 * Response from the DevBox API
 */
export interface DevBoxResponse<T = any> {
  code: number;
  data: T;
  error?: string;
}

export interface DevBoxDetail {
  apiVersion: string;
  kind: string;
  metadata: {
    creationTimestamp: string;
    name: string;
    namespace: string;
    uid: string;
  };
  spec: {
    network: {
      extraPorts: Array<{
        containerPort: number;
        protocol: string;
      }>;
      type: string;
    };
    resource: {
      cpu: string;
      memory: string;
    };
    runtimeRef: {
      name: string;
      namespace: string;
    };
    squash: boolean;
    state: string;
    tolerations: Array<{
      effect: string;
      key: string;
      operator: string;
    }>;
    runtimeType: string;
  };
  status: {
    commitHistory: Array<{
      containerID: string;
      image: string;
      node: string;
      pod: string;
      predicatedStatus: string;
      status: string;
      time: string;
    }>;
    lastState: Record<string, any>;
    network: {
      nodePort: number;
      tailnet: string;
      type: string;
    };
    phase: string;
    state: {
      running?: {
        startedAt: string;
      };
      waiting?: Record<string, any>;
    };
  };
  portInfos: Array<{
    networkName: string;
    port: number;
    protocol: string;
    openPublicDomain: boolean;
    publicDomain: string;
    customDomain: string;
    portName: string;
  }>;
}
