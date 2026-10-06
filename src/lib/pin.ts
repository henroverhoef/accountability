// Optional 4-digit app lock. The PIN is stored on this phone only, as a salted SHA-256
// hash (never the PIN itself). It keeps casual eyes out; it isn't bank-grade security.
const KEY = 'steadfast-pin'

interface Stored {
  salt: string
  hash: string
}

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}

export function hasPin(): boolean {
  return read() !== null
}

export async function setPin(pin: string): Promise<void> {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
  localStorage.setItem(KEY, JSON.stringify({ salt, hash: await sha256(`${salt}:${pin}`) }))
}

export function clearPin(): void {
  localStorage.removeItem(KEY)
}

export async function checkPin(pin: string): Promise<boolean> {
  const stored = read()
  if (!stored) return true
  return (await sha256(`${stored.salt}:${pin}`)) === stored.hash
}
