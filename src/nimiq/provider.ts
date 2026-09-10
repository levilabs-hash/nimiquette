import { init, type ErrorResponse, type NimiqProvider } from '@nimiq/mini-app-sdk'

const INIT_TIMEOUT_MS = 10_000

let nimiqPromise: ReturnType<typeof init> | null = null

export function connectProvider(): Promise<NimiqProvider> {
  if (!nimiqPromise) {
    nimiqPromise = init({ timeout: INIT_TIMEOUT_MS })
  }

  return nimiqPromise
}

export function resetProviderConnection(): void {
  nimiqPromise = null
}

export function isErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false
  }

  const error = (value as ErrorResponse).error
  return typeof error?.type === 'string' && typeof error.message === 'string'
}

export function unwrapProviderResult<T>(result: T | ErrorResponse): T {
  if (isErrorResponse(result)) {
    throw new ProviderRequestError(result.error.message, result.error.type)
  }

  return result
}

export class ProviderRequestError extends Error {
  readonly type: string

  constructor(message: string, type: string) {
    super(message)
    this.name = 'ProviderRequestError'
    this.type = type
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

export type ProviderAction = 'connect' | 'payment' | 'sign'

export function explainProviderFailure(error: unknown, action: ProviderAction): string {
  const type = error instanceof ProviderRequestError ? error.type.toLowerCase() : ''
  const raw = toUserMessage(error).toLowerCase()

  if (type.includes('invalidtransaction') || raw.includes('invalidtransaction')) {
    return 'Nimiq Pay could not send this payment. Check the amount, recipient, and that you have enough NIM, then try again.'
  }

  if (
    raw.includes('not injected')
    || raw.includes('unavailable')
    || raw.includes('timeout')
    || raw.includes('timed out')
  ) {
    return 'Nimiq Pay is not available right now. Open this Mini App from Nimiq Pay and try again.'
  }

  if (action === 'connect') {
    return 'Could not read your Nimiq addresses. Try connecting again.'
  }

  if (action === 'payment') {
    return 'The payment could not be completed. No NIM was sent. You can review the intent and try again.'
  }

  if (raw.includes('did not return a signature')) {
    return 'Nimiq Pay did not return a signature. You can try again.'
  }

  if (raw.includes('does not match this payment')) {
    return 'The signature does not match this payment. You can try again.'
  }

  return 'The acknowledgment signature could not be created. You can try again.'
}

export function isUserRejection(error: unknown): boolean {
  if (error instanceof ProviderRequestError && error.type.toLowerCase().includes('permissiondenied')) {
    return true
  }

  const message = toUserMessage(error).toLowerCase()
  return (
    message.includes('reject')
    || message.includes('denied')
    || message.includes('cancel')
    || message.includes('user closed')
  )
}
