export const LUNA_PER_NIM = 100_000

export type NimAmountIssue = 'invalid' | 'too-small' | 'too-large'

function lunaFromInput(input: string): number | 'empty' | NimAmountIssue {
  const trimmed = input.trim().replace(',', '.')
  if (trimmed.length === 0) {
    return 'empty'
  }

  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,5})?$/.test(trimmed)) {
    return 'invalid'
  }

  const [whole, fraction = ''] = trimmed.split('.')
  if (whole.length > 14) {
    return 'too-large'
  }

  const luna = Number(whole) * LUNA_PER_NIM + Number(fraction.padEnd(5, '0'))
  if (!Number.isFinite(luna) || !Number.isSafeInteger(luna)) {
    return 'too-large'
  }

  if (luna < 1) {
    return 'too-small'
  }

  return luna
}

export function nimAmountIssue(input: string): NimAmountIssue | null {
  const result = lunaFromInput(input)
  if (result === 'empty' || typeof result === 'number') {
    return null
  }

  return result
}

export function parseNimAmount(input: string): { displayNim: string; luna: number } | null {
  const luna = lunaFromInput(input)
  if (typeof luna !== 'number') {
    return null
  }

  return {
    displayNim: formatNimFromLuna(luna),
    luna,
  }
}

export function formatNimFromLuna(luna: number): string {
  const whole = Math.floor(luna / LUNA_PER_NIM)
  const fraction = luna % LUNA_PER_NIM

  if (fraction === 0) {
    return String(whole)
  }

  return `${whole}.${String(fraction).padStart(5, '0').replace(/0+$/, '')}`
}
