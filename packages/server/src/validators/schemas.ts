/**
 * Zod Validation Schemas
 * Request validation schemas for all API endpoints
 */

import { z } from 'zod'

// File Operation Schemas
export const WriteFileRequestSchema = z.object({
  path: z.string().min(1, 'Path cannot be empty'),
  content: z.string(),
  encoding: z.enum(['utf8', 'base64', 'binary', 'hex']).optional(),
  permissions: z.string().optional(),
})

export const ReadFileRequestSchema = z.object({
  path: z.string().min(1, 'Path cannot be empty'),
  encoding: z.enum(['utf8', 'base64', 'binary', 'hex']).optional(),
})

export const ListFilesRequestSchema = z.object({
  path: z.string().min(1, 'Path cannot be empty'),
  recursive: z.boolean().optional(),
  includeHidden: z.boolean().optional(),
})

export const DeleteFileRequestSchema = z.object({
  path: z.string().min(1, 'Path cannot be empty'),
  recursive: z.boolean().optional(),
})

export const BatchUploadRequestSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().min(1, 'File path cannot be empty'),
        content: z.string(),
        encoding: z.enum(['utf8', 'base64', 'binary', 'hex']).optional(),
      })
    )
    .min(1, 'At least one file is required')
    .max(100, 'Maximum 100 files per batch'),
})

// Process Operation Schemas
export const ProcessExecRequestSchema = z.object({
  command: z.string().min(1, 'Command cannot be empty').max(10000, 'Command too long'),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  shell: z.string().optional(),
  timeout: z.number().int().min(1000).max(600000).optional(), // 1 second to 10 minutes
})

export const ProcessKillRequestSchema = z.object({
  id: z.string().min(1, 'Process ID cannot be empty'),
  signal: z.string().optional(),
})

export const ProcessLogsRequestSchema = z.object({
  id: z.string().min(1, 'Process ID cannot be empty'),
  tail: z.number().int().min(1).max(10000).optional(),
})

// Session Operation Schemas
export const CreateSessionRequestSchema = z.object({
  workingDir: z.string().optional(),
  env: z.record(z.string()).optional(),
  shell: z.string().optional(),
})

export const UpdateSessionEnvRequestSchema = z.object({
  id: z.string().min(1, 'Session ID cannot be empty'),
  env: z.record(z.string()),
})

export const TerminateSessionRequestSchema = z.object({
  id: z.string().min(1, 'Session ID cannot be empty'),
})

export const SessionExecRequestSchema = z.object({
  sessionId: z.string().min(1, 'Session ID cannot be empty'),
  command: z.string().min(1, 'Command cannot be empty').max(10000, 'Command too long'),
})

export const SessionChangeDirRequestSchema = z.object({
  sessionId: z.string().min(1, 'Session ID cannot be empty'),
  path: z.string().min(1, 'Path cannot be empty'),
})

// Query Parameter Schemas
export const ProcessStatusQuerySchema = z.object({
  id: z.string().min(1, 'Process ID cannot be empty'),
})

export const ProcessLogsQuerySchema = z.object({
  id: z.string().min(1, 'Process ID cannot be empty'),
  tail: z
    .string()
    .optional()
    .transform(val => (val ? Number.parseInt(val) : undefined)),
})

export const SessionQuerySchema = z.object({
  id: z.string().min(1, 'Session ID cannot be empty'),
})

// Health Check Schemas
export const HealthQuerySchema = z.object({
  detailed: z
    .string()
    .optional()
    .transform(val => val === 'true'),
})

// Common validation helpers
export const validateRequest = <T extends z.ZodType>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; errors: z.ZodError } => {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  } else {
    return { success: false, errors: result.error }
  }
}

export const validateQueryParams = <T extends z.ZodType>(
  schema: T,
  searchParams: URLSearchParams
): { success: true; data: z.infer<T> } | { success: false; errors: z.ZodError } => {
  const params: Record<string, string> = {}
  for (const [key, value] of searchParams.entries()) {
    params[key] = value
  }

  return validateRequest(schema, params)
}

// Type exports for use in handlers
export type WriteFileRequest = z.infer<typeof WriteFileRequestSchema>
export type ReadFileRequest = z.infer<typeof ReadFileRequestSchema>
export type ListFilesRequest = z.infer<typeof ListFilesRequestSchema>
export type DeleteFileRequest = z.infer<typeof DeleteFileRequestSchema>
export type BatchUploadRequest = z.infer<typeof BatchUploadRequestSchema>
export type ProcessExecRequest = z.infer<typeof ProcessExecRequestSchema>
export type ProcessKillRequest = z.infer<typeof ProcessKillRequestSchema>
export type ProcessLogsRequest = z.infer<typeof ProcessLogsRequestSchema>
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>
export type UpdateSessionEnvRequest = z.infer<typeof UpdateSessionEnvRequestSchema>
export type TerminateSessionRequest = z.infer<typeof TerminateSessionRequestSchema>
export type SessionExecRequest = z.infer<typeof SessionExecRequestSchema>
export type SessionChangeDirRequest = z.infer<typeof SessionChangeDirRequestSchema>
export type ProcessStatusQuery = z.infer<typeof ProcessStatusQuerySchema>
export type ProcessLogsQuery = z.infer<typeof ProcessLogsQuerySchema>
export type SessionQuery = z.infer<typeof SessionQuerySchema>
export type HealthQuery = z.infer<typeof HealthQuerySchema>
