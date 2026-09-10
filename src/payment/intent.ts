export const INTENT_TYPES = [
  'Gift',
  'Split',
  'Thanks',
  'Work',
  'Support',
  'Repayment',
  'Celebration',
] as const

export type IntentType = (typeof INTENT_TYPES)[number]

export const MESSAGE_MAX_LENGTH = 80

export const INTENT_HINTS: Record<IntentType, string> = {
  Gift: 'A present, with no expectation of return.',
  Split: 'Share a cost with someone.',
  Thanks: 'Show gratitude.',
  Work: 'Pay for work that was done.',
  Support: 'Help someone who needs it.',
  Repayment: 'Pay back money that was owed.',
  Celebration: 'Mark a moment worth celebrating.',
}

export function buildPaymentData(intent: IntentType, message: string): string {
  const trimmed = message.trim()
  return trimmed.length > 0 ? `${intent}: ${trimmed}` : intent
}
