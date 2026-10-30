// Email + password accounts. Supabase sends the emails (confirm your address, change of
// address, reset your password) through the email account set up in its dashboard
// (Authentication → Emails → SMTP).
//
// The links in those emails come back to the app with the sign-in in the address
// (…/#access_token=…&type=signup). handleAuthRedirect() reads that before the app starts.
// On iPhone the link opens in Safari, not the installed app (they don't share a sign-in),
// so the app also lets you continue with "I've confirmed my email" (your email + password).
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { createLoginCode } from './account'

/** Login codes gave accounts a stand-in address that can never receive email. */
const STAND_IN = '@login.steadfast.invalid'

export const MIN_PASSWORD = 8

/** Where the email links send people back to. */
export const appUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`

/** Your real email address, if your account has one (not a login-code stand-in). */
export function realEmail(user: Pick<User, 'email'> | null | undefined): string | null {
  return user?.email && !user.email.endsWith(STAND_IN) ? user.email : null
}

/**
 * Create an account. Returns 'confirm' when Supabase sent a confirmation email first
 * (you're signed in once you tap it), or 'signed-in' when it didn't need to.
 */
export async function signUp(email: string, password: string): Promise<'confirm' | 'signed-in'> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: appUrl() } })
  if (error) throw error
  // An address that already has an account comes back without identities (Supabase doesn't
  // say so outright, so nobody can test which addresses are registered).
  if (data.user && data.user.identities?.length === 0) throw new Error('There’s already an account with this email. Sign in instead.')
  return data.session ? 'signed-in' : 'confirm'
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
}

export async function resendConfirmation(email: string) {
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: appUrl() } })
  if (error) throw error
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() })
  if (error) throw error
}

export async function setPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/** The signed-in user as the server has it now (e.g. after confirming an email elsewhere). */
export async function currentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user
}

/**
 * Picks up an email you confirmed in another browser (on iPhone the link opens in Safari):
 * the app's own copy of your sign-in still has the old address until it's refreshed.
 */
export async function syncConfirmedEmail(user: Pick<User, 'email'> | null | undefined): Promise<User | null> {
  const fresh = await currentUser()
  if (realEmail(fresh) && !realEmail(user)) await supabase.auth.refreshSession()
  return fresh
}

/**
 * Give an existing (code-based) account an email and password. The password works
 * straight away; the email once you tap the link Supabase sends to it.
 */
export async function addEmailAndPassword(email: string, password: string) {
  // An account without any address can't take a password yet: give it its stand-in first.
  if (!(await currentUser())?.email) {
    await createLoginCode()
    await supabase.auth.refreshSession()
  }
  await setPassword(password)
  const { error } = await supabase.auth.updateUser({ email: email.trim() }, { emailRedirectTo: appUrl() })
  if (error) throw error
  await skipStandInConfirmation()
}

export async function resendEmailChange(email: string) {
  const { error } = await supabase.auth.resend({ type: 'email_change', email: email.trim(), options: { emailRedirectTo: appUrl() } })
  if (error) throw error
  await skipStandInConfirmation()
}

/**
 * A stand-in address can't confirm anything. If Supabase's "Secure email change" asked
 * it to as well, mark that side done, so the link sent to the new address is enough
 * (see the standin_email_change migration).
 */
async function skipStandInConfirmation() {
  const { error } = await supabase.rpc('skip_standin_confirmation')
  if (error) console.warn('Could not skip the stand-in confirmation', error)
}

/**
 * Coming back from an email link: Supabase puts the sign-in (or an error) after the "#".
 * With the app's "#/…" screens that would look like a broken address, so read it first,
 * swap in the right screen, and finish signing in in the background.
 */
export function handleAuthRedirect() {
  const hash = window.location.hash.slice(1)
  if (!/(^|&)(access_token|error_description|message)=/.test(hash)) return
  const p = new URLSearchParams(hash)
  const go = (route: string) => window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${route}`)
  const error = p.get('error_description')
  const message = p.get('message')
  const type = p.get('type')
  if (error) go(`/?auth_error=${encodeURIComponent(error)}`)
  else if (message) go(`/settings?auth_message=${encodeURIComponent(message)}`)
  else go(type === 'recovery' ? '/new-password' : type === 'email_change' ? '/settings?auth=email-changed' : '/?auth=confirmed')
  const access_token = p.get('access_token')
  const refresh_token = p.get('refresh_token')
  if (access_token && refresh_token) supabase.auth.setSession({ access_token, refresh_token }).catch((e) => console.warn('Email link sign-in failed', e))
}

/** Supabase's messages, in plain words. */
export function friendlyAuthError(message: string): string {
  if (/invalid or has expired|otp_expired/i.test(message)) return 'That email link has expired or was already used. Sign in, or ask for a new email.'
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match. Check them, or tap “Forgot password?”.'
  if (/email not confirmed/i.test(message)) return 'Your email isn’t confirmed yet. Tap the link in the email we sent you (check your spam folder too).'
  if (/password should be at least/i.test(message)) return `Your password needs at least ${MIN_PASSWORD} characters.`
  if (/rate limit|too many/i.test(message)) return 'Too many emails sent just now. Wait a few minutes and try again.'
  if (/already (been )?registered|already exists/i.test(message)) return 'There’s already an account with this email. Sign in instead.'
  if (/sending.*email|smtp/i.test(message)) return 'We couldn’t send the email just now. Try again in a minute; if it keeps failing, tell the app owner.'
  if (/invalid.*email|unable to validate email/i.test(message)) return 'That doesn’t look like a valid email address.'
  return message
}
