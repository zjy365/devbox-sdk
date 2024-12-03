// src/index.ts

import { DevBoxOptions, DevBoxResponse, DevBoxDetail } from '@/types';
import { customAlphabet } from 'nanoid';
import * as k8s from '@kubernetes/client-node';
import { KubeFileSystem } from '../utils/kubeFileSystem';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz');

interface DevBoxConstructorParams {
  kubeconfig: string;
  id: string;
  fileSystem: KubeFileSystem;
}

export class DevBox {
  private static readonly DEFAULT_CPU = 1000; // 1 core
  private static readonly DEFAULT_MEMORY = 2048; // 2GB
  private static readonly DEFAULT_PORT = 3000;
  private static readonly RUNTIME_NAMESPACE_MAP: Record<string, string> = {
    'c-gcc-12-2-0-2024-11-12-0651': 'devbox-system',
    'cpp-gcc-12-2-0-2024-11-12-0651': 'devbox-system',
    'go-1-22-5-2024-11-12-0651': 'devbox-system',
    'go-1-23-0-2024-11-12-0651': 'devbox-system',
    'java-openjdk17-2024-11-12-0651': 'devbox-system',
    'net-8-0-2024-11-12-0651': 'devbox-system',
    'node.js-22-2024-11-13-0700': 'devbox-system',
    'node.js-18-2024-11-13-0700': 'devbox-system',
    'node.js-20-2024-11-13-0700': 'devbox-system',
    'php-8-2-20-2024-11-13-0347': 'devbox-system',
    'php-7-4-2024-11-13-0347': 'devbox-system',
    'python-3-10-2024-11-12-0651': 'devbox-system',
    'python-3-11-2024-11-12-0651': 'devbox-system',
    'python-3-12-2024-11-12-0651': 'devbox-system',
    'rust-1-81-0-2024-11-12-0651': 'devbox-system',
    'angular-v18-2024-11-13-0835': 'devbox-system',
    'astro-4-10-0-2024-11-13-0835': 'devbox-system',
    'chi-v5-1-0-2024-11-13-0740': 'devbox-system',
    'django-4-2-16-2024-11-13-0740': 'devbox-system',
    'docusaurus-3-5-2-2024-11-13-0835': 'devbox-system',
    'echo-v4-12-0-2024-11-13-0740': 'devbox-system',
    'express.js-4-21-0-2024-11-13-0835': 'devbox-system',
    'flask-3-0-3-2024-11-13-0740': 'devbox-system',
    'gin-v1-10-0-2024-11-13-0740': 'devbox-system',
    'hexo-7-3-0-2024-11-13-0835': 'devbox-system',
    'hugo-v0-135-0-2024-11-13-0740': 'devbox-system',
    'iris-v12-2-11-2024-11-13-0740': 'devbox-system',
    'next.js-14-2-5-2024-11-13-0835': 'devbox-system',
    'nginx-1-22-1-2024-11-13-0835': 'devbox-system',
    'nuxt3-v3-13-2024-11-13-0835': 'devbox-system',
    'quarkus-3-16-1-2024-11-13-0740': 'devbox-system',
    'quarkus-docker-2024-11-01-0724': 'devbox-system',
    'react-18-2-0-2024-11-13-0835': 'devbox-system',
    'rocket-0-5-1-2024-11-13-0740': 'devbox-system',
    'sealaf-1-0-0-2024-11-13-0835': 'devbox-system',
    'spring-boot-3-3-2-2024-11-13-0740': 'devbox-system',
    'svelte-6-4-0-2024-11-13-0835': 'devbox-system',
    'umi-4-3-27-2024-11-13-0835': 'devbox-system',
    'vert.x-4-5-10-2024-11-13-0740': 'devbox-system',
    'vitepress-1-4-0-2024-11-13-0835': 'devbox-system',
    'vue-v3-4-29-2024-11-13-0835': 'devbox-system',
    'debian-ssh-12-6-2024-11-11-0803': 'devbox-system',
    'ubuntu-24-04-2024-11-01-1417': 'devbox-system',
  };

  private static getApiUrlFromKubeconfig(kubeconfig: string): string {
    const kc = new k8s.KubeConfig();
    kc.loadFromString(kubeconfig);
    const cluster = kc.getCurrentCluster();
    if (!cluster) {
      throw new Error('No cluster found in kubeconfig');
    }
    const server = cluster.server;
    const domain = new URL(server).hostname;
    return `https://devbox.${domain}`;
  }

  private static getDomainSuffixFromKubeconfig(kubeconfig: string): string {
    const kc = new k8s.KubeConfig();
    kc.loadFromString(kubeconfig);
    const cluster = kc.getCurrentCluster();
    if (!cluster) {
      throw new Error('No cluster found in kubeconfig');
    }
    const server = cluster.server;
    const serverUrl = new URL(server);
    const prefix = serverUrl.hostname.split('.')[0];
    return `sealos${prefix}.site`;
  }

  private readonly kubeconfig: string;
  private readonly apiUrl: string;
  private readonly domainSuffix: string;
  public readonly id: string;
  public readonly fileSystem: KubeFileSystem;

  private constructor(params: DevBoxConstructorParams) {
    this.kubeconfig = params.kubeconfig;
    this.id = params.id;
    this.fileSystem = params.fileSystem;
    this.apiUrl = DevBox.getApiUrlFromKubeconfig(params.kubeconfig);
    this.domainSuffix = DevBox.getDomainSuffixFromKubeconfig(params.kubeconfig);
  }

  /**
   * Create a new DevBox instance
   */
  static async create(options: DevBoxOptions): Promise<DevBox> {
    const domainSuffix = this.getDomainSuffixFromKubeconfig(options.kubeconfig);
    const id = `devbox-sdk-${nanoid(12)}`;
    const portName = nanoid(12);
    const networkName = `devbox-${nanoid(12)}`;
    const publicDomain = `${nanoid(12)}.${domainSuffix}`;

    const payload = {
      devboxForm: {
        name: id,
        runtimeType: options.runtime.split('-')[0],
        runtimeVersion: options.runtime,
        cpu: this.DEFAULT_CPU,
        memory: this.DEFAULT_MEMORY,
        networks: [
          {
            networkName,
            portName,
            port: this.DEFAULT_PORT,
            protocol: 'HTTP' as const,
            openPublicDomain: true,
            publicDomain,
            customDomain: '',
          },
        ],
      },
      runtimeNamespaceMap: this.RUNTIME_NAMESPACE_MAP,
    };

    try {
      const apiUrl = this.getApiUrlFromKubeconfig(options.kubeconfig);
      const response = await fetch(`${apiUrl}/api/createDevbox`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${encodeURIComponent(options.kubeconfig)}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = (await response.json()) as DevBoxResponse;

      if (result.error) {
        throw new Error(result.error);
      }

      // Get pod details
      const detail = await this.getDetail(id, options.kubeconfig);

      if (!detail.status.commitHistory?.[0]?.pod) {
        throw new Error('Pod name not found in commit history');
      }

      // Initialize filesystem
      const kc = new k8s.KubeConfig();
      kc.loadFromString(options.kubeconfig);

      const fileSystem = new KubeFileSystem(
        new k8s.Exec(kc),
        detail.metadata.namespace,
        detail.status.commitHistory[0].pod,
        id,
      );

      return new DevBox({
        kubeconfig: options.kubeconfig,
        id,
        fileSystem,
      });
    } catch (error: any) {
      throw new Error(`Failed to create DevBox: ${error.message}`);
    }
  }

  private static async getDetail(
    name: string,
    kubeconfig: string,
  ): Promise<DevBoxDetail> {
    try {
      const apiUrl = this.getApiUrlFromKubeconfig(kubeconfig);
      const response = await fetch(
        `${apiUrl}/api/getDevboxByName?devboxName=${name}`,
        {
          headers: {
            Authorization: `${encodeURIComponent(kubeconfig)}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = (await response.json()) as DevBoxResponse<DevBoxDetail>;

      if (result.error) {
        throw new Error(result.error);
      }

      return result.data;
    } catch (error: any) {
      throw new Error(`Failed to get DevBox details: ${error.message}`);
    }
  }

  /**
   * Delete a DevBox instance by name
   * @param name DevBox name to delete
   * @param kubeconfig Kubernetes config for authentication
   */
  static async delete(name: string, kubeconfig: string): Promise<void> {
    try {
      const apiUrl = this.getApiUrlFromKubeconfig(kubeconfig);
      const response = await fetch(
        `${apiUrl}/api/delDevbox?devboxName=${name}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `${encodeURIComponent(kubeconfig)}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = (await response.json()) as DevBoxResponse;

      if (result.error) {
        throw new Error(result.error);
      }
    } catch (error: any) {
      throw new Error(`Failed to delete DevBox: ${error.message}`);
    }
  }

  /**
   * Get DevBox details
   */
  async getDetail(): Promise<DevBoxDetail> {
    return DevBox.getDetail(this.id, this.kubeconfig);
  }

  /**
   * Delete this DevBox instance
   */
  async delete(): Promise<void> {
    return DevBox.delete(this.id, this.kubeconfig);
  }

  /**
   * Get all DevBox instances
   * @param kubeconfig Kubernetes config for authentication
   */
  static async list(kubeconfig: string): Promise<DevBoxDetail[]> {
    try {
      const apiUrl = this.getApiUrlFromKubeconfig(kubeconfig);
      const response = await fetch(`${apiUrl}/api/getDevboxList`, {
        headers: {
          Authorization: `${encodeURIComponent(kubeconfig)}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = (await response.json()) as DevBoxResponse<DevBoxDetail[]>;

      if (result.error) {
        throw new Error(result.error);
      }

      return result.data;
    } catch (error: any) {
      throw new Error(`Failed to list DevBoxes: ${error.message}`);
    }
  }

  /**
   * Get an existing DevBox instance by ID
   * @param id DevBox ID
   * @param kubeconfig Kubernetes config for authentication
   */
  static async get(id: string, kubeconfig: string): Promise<DevBox> {
    const detail = await this.getDetail(id, kubeconfig);

    // Initialize file system
    const kc = new k8s.KubeConfig();
    kc.loadFromString(kubeconfig);

    const fileSystem = new KubeFileSystem(
      new k8s.Exec(kc),
      detail.metadata.namespace,
      detail.status.commitHistory[0].pod,
      id,
    );

    return new DevBox({
      kubeconfig,
      id,
      fileSystem,
    });
  }
}
