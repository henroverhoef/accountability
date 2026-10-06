// Personal login codes, e.g. "K7QM-2XPA-9FTR": 12 characters without look-alikes (~59 bits).
// Only a SHA-256 hash is stored; guessing one by trial and error is not practical.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function newLoginCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`
}

/** Ignore case, spaces and dashes; people type codes in many ways. */
export function normalizeLoginCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export async function hashLoginCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`steadfast:${normalizeLoginCode(code)}`))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
