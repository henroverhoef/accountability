import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
// @ts-expect-error – no type definitions; this is the reference implementation used by the `web-push` npm package.
import ece from 'http_ece'
import { b64urlDecode, b64urlEncode, encryptPayload, vapidAuthorization } from '../supabase/functions/_shared/logic/webpush'

describe('web push encryption', () => {
  it('produces messages the reference library can decrypt', async () => {
    // Pretend to be the browser: make a subscription key pair and auth secret.
    const browser = crypto.createECDH('prime256v1')
    browser.generateKeys()
    const auth = crypto.randomBytes(16)
    const body = await encryptPayload(
      new TextEncoder().encode('{"title":"Hello"}'),
      b64urlEncode(browser.getPublicKey()),
      b64urlEncode(auth),
    )
    const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: browser, authSecret: auth.toString('base64url') })
    expect(plain.toString()).toBe('{"title":"Hello"}')
  })

  it('signs a valid VAPID token', async () => {
    const ecdh = crypto.createECDH('prime256v1')
    ecdh.generateKeys()
    const publicKey = b64urlEncode(ecdh.getPublicKey())
    const privateKey = b64urlEncode(ecdh.getPrivateKey())
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', { publicKey, privateKey, subject: 'mailto:a@b.c' }, 1_700_000_000_000)
    const m = header.match(/^vapid t=([^,]+), k=(.+)$/)!
    expect(m[2]).toBe(publicKey)
    const [h, c, s] = m[1].split('.')
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString())
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_700_000_000 + 12 * 3600, sub: 'mailto:a@b.c' })
    const pub = b64urlDecode(publicKey)
    const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33)) }, format: 'jwk' })
    const ok = crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))
    expect(ok).toBe(true)
  })
})
