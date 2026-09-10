import { decodeReceiptPayload, encodeReceipt, type ReceiptV1 } from './model'

export function readReceiptFromLocation(): ReceiptV1 | null {
  return decodeReceiptPayload(window.location.hash)
}

export function writeReceiptToLocation(receipt: ReceiptV1): void {
  const url = new URL(window.location.href)
  url.hash = `r=${encodeReceipt(receipt)}`
  history.replaceState(null, '', url)
}

export function clearReceiptFromLocation(): void {
  const url = new URL(window.location.href)
  url.hash = ''
  history.replaceState(null, '', url)
}

export function buildShareUrl(receipt: ReceiptV1): string {
  const url = new URL(window.location.href)
  url.hash = `r=${encodeReceipt(receipt)}`
  return url.toString()
}
