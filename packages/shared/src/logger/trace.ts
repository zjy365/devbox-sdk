/**
 * TraceID generation and management for distributed tracing
 */

/**
 * Generate a unique trace ID
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 15)
  return `trace_${timestamp}_${randomPart}`
}

/**
 * Trace context for propagating trace information
 */
export interface TraceContext {
  traceId: string
  spanId?: string
  parentSpanId?: string
  timestamp: number
}

/**
 * Create a new trace context
 */
export function createTraceContext(traceId?: string): TraceContext {
  return {
    traceId: traceId || generateTraceId(),
    timestamp: Date.now(),
  }
}

/**
 * Create a child span from parent trace context
 */
export function createChildSpan(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateTraceId(),
    parentSpanId: parent.spanId,
    timestamp: Date.now(),
  }
}
