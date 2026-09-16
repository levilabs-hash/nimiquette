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
  Gift: 'Send money as a gift or surprise.',
  Split: 'Share a cost with someone.',
  Thanks: 'Show appreciation with a payment.',
  Work: 'Pay for work, tasks, or services.',
  Support: 'Send financial support.',
  Repayment: 'Pay someone back.',
  Celebration: 'Mark a special moment with a payment.',
}

export function buildPaymentData(intent: IntentType, message: string): string {
  const trimmed = message.trim()
  return trimmed.length > 0 ? `${intent}: ${trimmed}` : intent
}
