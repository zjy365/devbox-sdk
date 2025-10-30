/**
 * Metrics Collection
 * Collects and tracks SDK performance metrics
 */

export interface SDKMetrics {
  connectionsCreated: number
  filesTransferred: number
  bytesTransferred: number
  errors: number
  avgLatency: number
  operationsCount: number
}

export class MetricsCollector {
  private metrics: SDKMetrics = {
    connectionsCreated: 0,
    filesTransferred: 0,
    bytesTransferred: 0,
    errors: 0,
    avgLatency: 0,
    operationsCount: 0,
  }

  recordTransfer(size: number, latency: number): void {
    this.metrics.filesTransferred++
    this.metrics.bytesTransferred += size
    this.metrics.avgLatency = (this.metrics.avgLatency + latency) / 2
    this.metrics.operationsCount++
  }

  recordConnection(): void {
    this.metrics.connectionsCreated++
  }

  recordError(): void {
    this.metrics.errors++
  }

  getMetrics(): SDKMetrics {
    return { ...this.metrics }
  }

  reset(): void {
    this.metrics = {
      connectionsCreated: 0,
      filesTransferred: 0,
      bytesTransferred: 0,
      errors: 0,
      avgLatency: 0,
      operationsCount: 0,
    }
  }
}
