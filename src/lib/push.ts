// Turning notifications on/off for this phone.
import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushStatus = 'unsupported' | 'needs-install' | 'not-configured' | 'denied' | 'off' | 'on'

/** iPhones only allow notifications once the app is added to the Home Screen. */
export function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export async function getPushStatus(): Promise<PushStatus> {
  if (isIos() && !isStandalone()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

function base64UrlToBytes(s: string) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Ask permission (must be called from a button tap), subscribe, and save the subscription. */
export async function enablePush(): Promise<PushStatus> {
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) })
  }
  const json = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_keys: json.keys,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
  return 'on'
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

/** Ask the server to send a test notification to all of my devices. */
export async function sendTestPush(): Promise<number> {
  const { data, error } = await supabase.functions.invoke('push', { body: { type: 'test' } })
  if (error) throw error
  return (data as { sent: number }).sent
}
