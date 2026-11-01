import { AppError, InputImageSizeError, errorCodes, type ErrorCode } from '../core/errors.ts'
import { t, formatNumber } from './runtime.ts'

export function errorMessage(error: unknown, fallback: ErrorCode = 'unknown'): string {
  if (error instanceof InputImageSizeError) return t('errors.inputPixelsDetails', {
    width: formatNumber(error.width), height: formatNumber(error.height),
    megapixels: formatNumber(error.width * error.height / 1_000_000, { maximumFractionDigits: 2 }),
  })
  const code = error instanceof AppError ? error.code : fallback
  return t(`errors.${code}`)
}
export function workerError(code: string): AppError {
  return new AppError(errorCodes.includes(code as ErrorCode) ? code as ErrorCode : 'processing')
}
