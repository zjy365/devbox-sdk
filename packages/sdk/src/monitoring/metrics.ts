/**
 * Metrics Collection
 * Collects and tracks SDK performance metrics
 */

export interface SDKMetrics {
  connectionsCreated: number
  connectionsActive: number
  filesTransferred: number
  bytesTransferred: number
  errors: number
  avgLatency: number
  operationsCount: number
  requestsTotal: number
  requestsSuccessful: number
  requestsFailed: number
  startTime: number
  uptime: number
}

export interface OperationStats {
  count: number
  min: number
  max: number
  avg: number
  p50: number
  p95: number
  p99: number
  sum: number
}

export interface DetailedMetrics {
  operations: Record<string, OperationStats>
  errors: Record<string, number>
  summary: SDKMetrics
}

/**
 * 增强的指标收集器
 * 提供详细的性能统计和监控数据
 */
export class MetricsCollector {
  private metrics: SDKMetrics
  private operationMetrics: Map<string, number[]> = new Map()
  private errorCounts: Map<string, number> = new Map()
  private startTime: number

  constructor() {
    this.startTime = Date.now()
    this.metrics = this.createEmptyMetrics()
  }

  private createEmptyMetrics(): SDKMetrics {
    return {
      connectionsCreated: 0,
      connectionsActive: 0,
      filesTransferred: 0,
      bytesTransferred: 0,
      errors: 0,
      avgLatency: 0,
      operationsCount: 0,
      requestsTotal: 0,
      requestsSuccessful: 0,
      requestsFailed: 0,
      startTime: this.startTime,
      uptime: 0,
    }
  }

  /**
   * 记录操作指标
   */
  recordOperation(name: string, durationMs: number): void {
    if (!this.operationMetrics.has(name)) {
      this.operationMetrics.set(name, [])
    }
    this.operationMetrics.get(name)!.push(durationMs)
    this.metrics.operationsCount++
  }

  /**
   * 记录文件传输
   */
  recordTransfer(size: number, latency: number): void {
    this.metrics.filesTransferred++
    this.metrics.bytesTransferred += size
    this.recordOperation('file_transfer', latency)
    this.recordRequest(true)
  }

  /**
   * 记录连接创建
   */
  recordConnection(): void {
    this.metrics.connectionsCreated++
    this.metrics.connectionsActive++
  }

  /**
   * 记录连接关闭
   */
  recordConnectionClosed(): void {
    this.metrics.connectionsActive = Math.max(0, this.metrics.connectionsActive - 1)
  }

  /**
   * 记录错误
   */
  recordError(errorType?: string): void {
    this.metrics.errors++
    if (errorType) {
      const count = this.errorCounts.get(errorType) || 0
      this.errorCounts.set(errorType, count + 1)
    }
    this.recordRequest(false)
  }

  /**
   * 记录请求
   */
  recordRequest(success: boolean): void {
    this.metrics.requestsTotal++
    if (success) {
      this.metrics.requestsSuccessful++
    } else {
      this.metrics.requestsFailed++
    }
  }

  /**
   * 计算操作统计信息
   */
  private calculateStats(values: number[]): OperationStats {
    if (values.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0, sum: 0 }
    }

    const sorted = [...values].sort((a, b) => a - b)
    const sum = values.reduce((a, b) => a + b, 0)

    return {
      count: values.length,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      avg: sum / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
      sum,
    }
  }

  /**
   * 获取基本指标
   */
  getMetrics(): SDKMetrics {
    const uptime = Date.now() - this.startTime
    return { ...this.metrics, uptime }
  }

  /**
   * 获取详细指标
   */
  getDetailedMetrics(): DetailedMetrics {
    const operations: Record<string, OperationStats> = {}

    for (const [name, values] of this.operationMetrics) {
      operations[name] = this.calculateStats(values)
    }

    const errors: Record<string, number> = {}
    for (const [type, count] of this.errorCounts) {
      errors[type] = count
    }

    return {
      operations,
      errors,
      summary: this.getMetrics(),
    }
  }

  /**
   * 获取操作统计
   */
  getOperationStats(name: string): OperationStats | null {
    const values = this.operationMetrics.get(name)
    if (!values || values.length === 0) {
      return null
    }
    return this.calculateStats(values)
  }

  /**
   * 导出所有指标为 JSON
   */
  export(): string {
    return JSON.stringify(this.getDetailedMetrics(), null, 2)
  }

  /**
   * 重置所有指标
   */
  reset(): void {
    this.startTime = Date.now()
    this.metrics = this.createEmptyMetrics()
    this.operationMetrics.clear()
    this.errorCounts.clear()
  }

  /**
   * 获取性能摘要
   */
  getSummary(): string {
    const metrics = this.getMetrics()
    const uptime = Math.floor(metrics.uptime / 1000) // 转换为秒

    const lines = [
      '=== SDK Performance Summary ===',
      `Uptime: ${uptime}s`,
      `Operations: ${metrics.operationsCount}`,
      `Requests: ${metrics.requestsTotal} (Success: ${metrics.requestsSuccessful}, Failed: ${metrics.requestsFailed})`,
      `Connections: ${metrics.connectionsCreated} created, ${metrics.connectionsActive} active`,
      `Files Transferred: ${metrics.filesTransferred}`,
      `Bytes Transferred: ${this.formatBytes(metrics.bytesTransferred)}`,
      `Errors: ${metrics.errors}`,
      `Success Rate: ${((metrics.requestsSuccessful / metrics.requestsTotal) * 100 || 0).toFixed(2)}%`,
    ]

    return lines.join('\n')
  }

  /**
   * 格式化字节数
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }
}

// 全局指标收集器实例
export const metrics = new MetricsCollector()

/**
 * 性能监控装饰器
 * 自动记录函数执行时间
 */
export function monitored(operationName: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now()
      try {
        const result = await originalMethod.apply(this, args)
        const duration = Date.now() - startTime
        metrics.recordOperation(operationName, duration)
        metrics.recordRequest(true)
        return result
      } catch (error) {
        const duration = Date.now() - startTime
        metrics.recordOperation(operationName, duration)
        metrics.recordError(operationName)
        throw error
      }
    }

    return descriptor
  }
}

/**
 * 性能追踪工具
 */
export class PerformanceTracker {
  private startTime: number

  constructor(private operationName: string) {
    this.startTime = Date.now()
  }

  /**
   * 结束追踪并记录
   */
  end(): number {
    const duration = Date.now() - this.startTime
    metrics.recordOperation(this.operationName, duration)
    return duration
  }

  /**
   * 结束追踪并记录为成功
   */
  success(): number {
    const duration = this.end()
    metrics.recordRequest(true)
    return duration
  }

  /**
   * 结束追踪并记录为失败
   */
  failure(errorType?: string): number {
    const duration = this.end()
    metrics.recordError(errorType)
    return duration
  }
}

/**
 * 创建性能追踪器
 */
export function track(operationName: string): PerformanceTracker {
  return new PerformanceTracker(operationName)
}
