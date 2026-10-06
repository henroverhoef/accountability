import { describe, expect, it } from 'vitest'
import { hashLoginCode, newLoginCode, normalizeLoginCode } from '../supabase/functions/_shared/logic/logincode'
import { generateVapidKeys, vapidAuthorization } from '../supabase/functions/_shared/logic/webpush'

describe('login codes', () => {
  it('look like XXXX-XXXX-XXXX without look-alike characters', () => {
    for (let i = 0; i < 50; i++) expect(newLoginCode()).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/)
  })
  it('are different every time', () => {
    expect(new Set(Array.from({ length: 200 }, newLoginCode)).size).toBe(200)
  })
  it('ignore case, spaces and dashes when checking', async () => {
    expect(normalizeLoginCode(' k7qm 2xpa-9ftr ')).toBe('K7QM2XPA9FTR')
    expect(await hashLoginCode('k7qm 2xpa 9ftr')).toBe(await hashLoginCode('K7QM-2XPA-9FTR'))
    expect(await hashLoginCode('K7QM-2XPA-9FTR')).not.toBe(await hashLoginCode('K7QM-2XPA-9FTS'))
  })
})

describe('self-generated notification keys', () => {
  it('produce a 65-byte public key and can sign VAPID tokens', async () => {
    const keys = await generateVapidKeys()
    expect(Buffer.from(keys.publicKey, 'base64url').length).toBe(65)
    expect(Buffer.from(keys.privateKey, 'base64url').length).toBe(32)
    const header = await vapidAuthorization('https://web.push.apple.com/abc', { ...keys, subject: 'https://example.org' })
    expect(header).toMatch(/^vapid t=.+\..+\..+, k=/)
  })
})
