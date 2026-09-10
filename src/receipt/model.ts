import { parseNimiqAddress } from '../payment/address'
import { INTENT_TYPES, MESSAGE_MAX_LENGTH, type IntentType } from '../payment/intent'

export const RECEIPT_VERSION = 1 as const

export interface ReceiptPayment {
  txHash: string
  intent: IntentType
  luna: number
  sender: string
  recipient: string
  message?: string
}

export interface ReceiptAck {
  address: string
  publicKey: string
  signature: string
  signedMessage: string
}

export interface ReceiptV1 {
  v: typeof RECEIPT_VERSION
  payment: ReceiptPayment
  ack: ReceiptAck | null
}

export function isIntentType(value: unknown): value is IntentType {
  return typeof value === 'string' && (INTENT_TYPES as readonly string[]).includes(value)
}

export function createSenderReportedReceipt(input: {
  txHash: string
  intent: IntentType
  luna: number
  sender: string
  recipient: string
  message: string
}): ReceiptV1 | null {
  const sender = parseNimiqAddress(input.sender)
  const recipient = parseNimiqAddress(input.recipient)
  const txHash = input.txHash.trim()
  const message = input.message.trim()

  if (!sender || !recipient || txHash.length === 0 || !Number.isSafeInteger(input.luna) || input.luna < 1) {
    return null
  }

  if (message.length > MESSAGE_MAX_LENGTH) {
    return null
  }

  return {
    v: RECEIPT_VERSION,
    payment: {
      txHash,
      intent: input.intent,
      luna: input.luna,
      sender,
      recipient,
      ...(message.length > 0 ? { message } : {}),
    },
    ack: null,
  }
}

export function buildCanonicalAckMessage(payment: ReceiptPayment): string {
  const messageLine = payment.message && payment.message.length > 0
    ? `message: ${payment.message}`
    : 'message:'

  return [
    'Nimiquette acknowledgement v1',
    'purpose: acknowledge-payment-intent',
    `tx: ${payment.txHash}`,
    `intent: ${payment.intent}`,
    `luna: ${payment.luna}`,
    `sender: ${payment.sender}`,
    `recipient: ${payment.recipient}`,
    messageLine,
  ].join('\n')
}

export function findMatchingRecipient(accounts: readonly string[], recipient: string): string | null {
  const target = parseNimiqAddress(recipient)
  if (!target) {
    return null
  }

  for (const account of accounts) {
    if (parseNimiqAddress(account) === target) {
      return target
    }
  }

  return null
}

export function isAcknowledgmentBound(receipt: ReceiptV1): boolean {
  if (!receipt.ack) {
    return false
  }

  return (
    receipt.ack.address === receipt.payment.recipient
    && receipt.ack.publicKey.length > 0
    && receipt.ack.signature.length > 0
    && receipt.ack.signedMessage === buildCanonicalAckMessage(receipt.payment)
  )
}

export function encodeReceipt(receipt: ReceiptV1): string {
  return toBase64Url(JSON.stringify(toEncodable(receipt)))
}

export function decodeReceiptPayload(input: string): ReceiptV1 | null {
  const encoded = extractEncodedPayload(input)
  if (!encoded) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(fromBase64Url(encoded))
    return parseReceipt(parsed)
  }
  catch {
    return null
  }
}

function toEncodable(receipt: ReceiptV1): ReceiptV1 {
  const payment: ReceiptPayment = {
    txHash: receipt.payment.txHash,
    intent: receipt.payment.intent,
    luna: receipt.payment.luna,
    sender: receipt.payment.sender,
    recipient: receipt.payment.recipient,
  }

  if (receipt.payment.message) {
    payment.message = receipt.payment.message
  }

  return {
    v: RECEIPT_VERSION,
    payment,
    ack: receipt.ack,
  }
}

function parseReceipt(value: unknown): ReceiptV1 | null {
  if (!isRecord(value) || value.v !== RECEIPT_VERSION || !isRecord(value.payment)) {
    return null
  }

  const payment = parsePayment(value.payment)
  if (!payment) {
    return null
  }

  if (value.ack === null) {
    return { v: RECEIPT_VERSION, payment, ack: null }
  }

  const ack = parseAck(value.ack)
  if (!ack) {
    return null
  }

  return { v: RECEIPT_VERSION, payment, ack }
}

function parsePayment(value: Record<string, unknown>): ReceiptPayment | null {
  if (typeof value.txHash !== 'string' || value.txHash.trim().length === 0) {
    return null
  }

  if (!isIntentType(value.intent) || typeof value.luna !== 'number' || !Number.isSafeInteger(value.luna) || value.luna < 1) {
    return null
  }

  const sender = typeof value.sender === 'string' ? parseNimiqAddress(value.sender) : null
  const recipient = typeof value.recipient === 'string' ? parseNimiqAddress(value.recipient) : null
  if (!sender || !recipient) {
    return null
  }

  const payment: ReceiptPayment = {
    txHash: value.txHash,
    intent: value.intent,
    luna: value.luna,
    sender,
    recipient,
  }

  if (value.message !== undefined) {
    if (typeof value.message !== 'string') {
      return null
    }

    const message = value.message.trim()
    if (message.length === 0 || message.length > MESSAGE_MAX_LENGTH || message !== value.message) {
      return null
    }

    payment.message = message
  }

  return payment
}

function parseAck(value: unknown): ReceiptAck | null {
  if (!isRecord(value)) {
    return null
  }

  const address = typeof value.address === 'string' ? parseNimiqAddress(value.address) : null
  if (
    !address
    || typeof value.publicKey !== 'string'
    || value.publicKey.length === 0
    || typeof value.signature !== 'string'
    || value.signature.length === 0
    || typeof value.signedMessage !== 'string'
    || value.signedMessage.length === 0
  ) {
    return null
  }

  return {
    address,
    publicKey: value.publicKey,
    signature: value.signature,
    signedMessage: value.signedMessage,
  }
}

function extractEncodedPayload(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return null
  }

  try {
    return new URL(trimmed).hash.replace(/^#r=/, '') || null
  }
  catch {
    if (trimmed.startsWith('#r=')) {
      return trimmed.slice(3) || null
    }

    if (trimmed.startsWith('r=')) {
      return trimmed.slice(2) || null
    }

    return trimmed
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
