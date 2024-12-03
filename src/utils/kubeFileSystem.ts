import { PassThrough, Readable, Writable } from 'stream';
import * as k8s from '@kubernetes/client-node';

export class KubeFileSystem {
  private readonly k8sExec: k8s.Exec;
  private readonly namespace: string;
  private readonly podName: string;
  private readonly containerName: string;

  constructor(
    k8sExec: k8s.Exec,
    namespace: string,
    podName: string,
    containerName: string,
  ) {
    this.k8sExec = k8sExec;
    this.namespace = namespace;
    this.podName = podName;
    this.containerName = containerName;
  }

  async execCommand(
    command: string[],
    stdin: Readable | null = null,
    stdout: Writable | null = null,
    retryCount = 3,
  ): Promise<string> {
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        return await this.executeWithTimeout(
          this.namespace,
          this.podName,
          this.containerName,
          command,
          stdin,
          stdout,
        );
      } catch (error: any) {
        const isRetryable = this.isRetryableError(error);
        console.error(`[KubeFS] Attempt ${attempt} failed:`, {
          namespace: this.namespace,
          pod: this.podName,
          container: this.containerName,
          command,
          error: error.message,
          isRetryable,
          statusCode: error.statusCode,
          details: error.details || 'No additional details',
        });

        if (!isRetryable || attempt === retryCount) {
          throw new Error(
            `Command execution failed after ${attempt} attempts: ${error.message}`,
          );
        }

        await delay(Math.min(1000 * Math.pow(2, attempt - 1), 5000));
      }
    }

    throw new Error('Unexpected execution path');
  }

  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'Unexpected server response: 500',
      'WebSocket closed with code',
    ];

    const errorMessage = error?.message || error?.toString() || '';
    return retryableErrors.some((retryableError) =>
      errorMessage.includes(retryableError),
    );
  }

  private executeWithTimeout(
    namespace: string,
    podName: string,
    containerName: string,
    command: string[],
    stdin: Readable | null,
    stdout: Writable | null,
    timeoutMs = 30000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const stderr = new PassThrough();
      let chunks = Buffer.alloc(0);
      let timeoutId: NodeJS.Timeout;

      if (!stdout) {
        stdout = new PassThrough();
        stdout.on('data', (chunk) => {
          chunks = Buffer.concat([chunks, chunk]);
        });
      } else {
        stdout.on('data', (chunk) => {
          chunks = Buffer.concat([chunks, chunk]);
        });
      }

      const stdoutStream = stdout;

      const cleanup = () => {
        clearTimeout(timeoutId);
        stderr.removeAllListeners();
        stdoutStream.removeAllListeners();
        stdin?.removeAllListeners();
        stderr.destroy();
        if (!stdout) {
          stdoutStream.destroy();
        }
      };

      this.k8sExec
        .exec(
          namespace,
          podName,
          containerName,
          command,
          stdoutStream,
          stderr,
          stdin,
          false,
        )
        .then((ws) => {
          timeoutId = setTimeout(() => {
            cleanup();
            ws.terminate();
            reject(
              new Error(`Command execution timed out after ${timeoutMs}ms`),
            );
          }, timeoutMs);

          ws.on('error', (error: any) => {
            console.error('[KubeFS] WebSocket error:', {
              message: error?.message,
              code: error?.code,
              type: error?.type,
            });
            cleanup();
            reject(
              new Error(
                `WebSocket error: ${error?.message || 'Unknown error'}`,
              ),
            );
          });

          ws.on('close', (code: number, reason: string) => {
            cleanup();
            if (code !== 1000) {
              reject(
                new Error(
                  `WebSocket closed with code ${code}: ${
                    reason || 'No reason provided'
                  }`,
                ),
              );
            } else {
              resolve(chunks.toString());
            }
          });

          stderr.on('data', (error) => {
            const errorStr = error.toString();
            console.error('[KubeFS] Command stderr:', errorStr);
            cleanup();
            reject(new Error(`Command error: ${errorStr}`));
          });

          stdoutStream.on('end', () => {
            console.log('[KubeFS] Command completed successfully');
          });

          stdoutStream.on('error', (error) => {
            console.error('[KubeFS] Stdout error:', error);
            cleanup();
            reject(error);
          });

          if (stdin) {
            stdin.on('error', (error) => {
              console.error('[KubeFS] Stdin error:', error);
              cleanup();
              reject(error);
            });

            stdin.on('end', () => {});
          }
        })
        .catch((error) => {
          cleanup();
          reject(new Error(`Failed to initialize command: ${error.message}`));
        });
    });
  }

  async writeFile(path: string, content: string): Promise<string> {
    const stream = new PassThrough();
    stream.end(content);

    await this.execCommand(
      ['sh', '-c', `dd of=${path} status=none bs=32767`],
      stream,
    );

    return 'File written successfully';
  }

  async readFile(path: string): Promise<string> {
    try {
      return await this.execCommand(['cat', path]);
    } catch (error) {
      throw new Error(`Failed to read file: ${error}`);
    }
  }

  async mkdir(path: string): Promise<string> {
    return await this.execCommand(['mkdir', '-p', path]);
  }

  async rm(path: string): Promise<string> {
    return await this.execCommand(['rm', '-rf', path]);
  }

  async mv(from: string, to: string): Promise<string> {
    return await this.execCommand(['mv', from, to]);
  }
}
