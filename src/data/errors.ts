export type AppErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'CONCURRENT_UPDATE'
  | 'INTEGRATION_PENDING'
  | 'UNAUTHENTICATED'
  | 'NETWORK'
  | 'UNKNOWN'

export class AppError extends Error {
  readonly code: AppErrorCode

  constructor(code: AppErrorCode, message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'AppError'
    this.code = code
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Ocorreu um erro inesperado. Tente novamente.'
}
