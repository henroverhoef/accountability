// Standard Web Push (RFC 8291 message encryption + RFC 8292 VAPID) using only WebCrypto,
// so it runs in Supabase Edge Functions (Deno) and in Node tests without extra libraries.
// Keys are the usual base64url strings, e.g. from `npx web-push generate-vapid-keys`.

export interface PushSubscriptionKeys {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface VapidKeys {
  publicKey: string // base64url, 65-byte uncompressed P-256 point
  privateKey: string // base64url, 32-byte private scalar
  subject: string // "mailto:you@example.com" or https URL
}

const enc = new TextEncoder()

export function b64urlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) {
    out.set(p, i)
    i += p.length
  }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, key, length * 8)
  return new Uint8Array(bits)
}

/** Encrypt a payload for one subscription (aes128gcm content encoding). */
export async function encryptPayload(payload: Uint8Array, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(p256dh)
  const auth = b64urlDecode(authSecret)

  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256))

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt'])
  const plaintext = concat(payload, new Uint8Array([2])) // 0x02 = last (and only) record
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aesKey, plaintext as BufferSource))

  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096) // record size
  header[20] = asPublic.length
  return concat(header, asPublic, ciphertext)
}

/** The "Authorization: vapid t=…, k=…" header value for a push service. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = Date.now()): Promise<string> {
  const pub = b64urlDecode(vapid.publicKey)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: vapid.privateKey,
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    ext: true,
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })),
  )
  const unsigned = `${header}.${claims}`
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)))
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${vapid.publicKey}`
}

/**
 * Send one push message. Returns the push service's HTTP status:
 * 201 = sent; 404/410 = subscription is gone and should be deleted.
 */
export async function sendWebPush(sub: PushSubscriptionKeys, data: unknown, vapid: VapidKeys, ttlSeconds = 24 * 3600): Promise<number> {
  const body = await encryptPayload(enc.encode(JSON.stringify(data)), sub.keys.p256dh, sub.keys.auth)
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'high',
    },
    body: body as BodyInit,
  })
  await res.body?.cancel()
  return res.status
}
