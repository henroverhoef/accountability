// Edge Function "login": personal login codes, so someone can use their account on a new phone.
//
//   {"action":"create"}            (signed in) → {"code":"K7QM-2XPA-9FTR"}  – replaces any older code
//   {"action":"redeem","code":…}   (anyone)    → {"token_hash":…}  – the app exchanges it for a session
//
// How it works: Supabase can only log someone in on another device if the account has an
// email address. So the first time a code is created we give the account a placeholder
// address (<id>@login.steadfast.invalid) that is never used to send email (".invalid" is a
// reserved domain that can never receive mail). Redeeming generates a one-time sign-in token
// for that address; no email is sent.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cors, json, signedInUser } from '../_shared/auth.ts'
import { hashLoginCode, newLoginCode, normalizeLoginCode } from '../_shared/logic/logincode.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))

    if (body.action === 'create') {
      const user = await signedInUser(req)
      if (!user) return json({ error: 'not signed in' }, 401)
      if (!user.email) {
        const { error } = await admin.auth.admin.updateUserById(user.id, {
          email: `${user.id}@login.steadfast.invalid`,
          email_confirm: true,
        })
        if (error) throw error
      }
      const code = newLoginCode()
      const { error } = await admin
        .from('login_codes')
        .upsert({ user_id: user.id, code_hash: await hashLoginCode(code), created_at: new Date().toISOString() })
      if (error) throw error
      await admin.from('profiles').update({ has_login_code: true }).eq('id', user.id)
      return json({ code })
    }

    if (body.action === 'redeem') {
      const code = String(body.code ?? '')
      const { data: row } =
        normalizeLoginCode(code).length === 12
          ? await admin.from('login_codes').select('user_id').eq('code_hash', await hashLoginCode(code)).maybeSingle()
          : { data: null }
      if (!row) {
        await new Promise((r) => setTimeout(r, 800)) // slow down guessing
        return json({ error: 'That login code doesn’t match any account. Check it and try again.' }, 400)
      }
      const { data: found, error: userErr } = await admin.auth.admin.getUserById(row.user_id)
      if (userErr || !found.user?.email) throw userErr ?? new Error('account has no login address')
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: found.user.email })
      if (linkErr) throw linkErr
      return json({ token_hash: link.properties.hashed_token })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
