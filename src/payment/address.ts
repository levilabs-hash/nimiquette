const NIMIQ_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY'

function compactAddress(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '')
}

function ibanMod97(stripped: string): number {
  const rearranged = stripped.slice(4) + stripped.slice(0, 4)
  let remainder = 0

  for (const character of rearranged) {
    const code = character.charCodeAt(0)
    const value = code >= 65 ? code - 55 : code - 48
    remainder = value >= 10
      ? (remainder * 100 + value) % 97
      : (remainder * 10 + value) % 97
  }

  return remainder
}

export function parseNimiqAddress(input: string): string | null {
  const compact = compactAddress(input)

  if (compact.length !== 36 || !compact.startsWith('NQ')) {
    return null
  }

  if (!/^[0-9]{2}$/.test(compact.slice(2, 4))) {
    return null
  }

  const body = compact.slice(4)
  if (![...body].every((character) => NIMIQ_ALPHABET.includes(character))) {
    return null
  }

  if (ibanMod97(compact) !== 1) {
    return null
  }

  return compact.replace(/(.{4})/g, '$1 ').trim()
}

export function shortenNimiqAddress(address: string): string {
  const parsed = parseNimiqAddress(address)
  const value = parsed ?? address.trim()
  const parts = value.split(' ')

  if (parts.length < 4) {
    return value
  }

  return `${parts[0]} ${parts[1]} … ${parts[parts.length - 1]}`
}
