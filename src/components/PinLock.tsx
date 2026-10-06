import { useEffect, useRef, useState, type ReactNode } from 'react'
import { checkPin, clearPin, hasPin } from '../lib/pin'
import { supabase } from '../lib/supabase'

/** Lock again after the app has been in the background this long. */
const LOCK_AFTER_MS = 60_000

/** Covers the app with a PIN pad when a PIN is set: at start, and after > 1 minute in the background. */
export default function PinLock({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(hasPin)
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now()
      else if (hiddenAt.current !== null && Date.now() - hiddenAt.current > LOCK_AFTER_MS && hasPin()) setLocked(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return (
    <>
      <div aria-hidden={locked} className={locked ? 'invisible' : undefined}>{children}</div>
      {locked && <PinPad onUnlock={() => setLocked(false)} />}
    </>
  )
}

function PinPad({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(0)
  const [waitUntil, setWaitUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  const waiting = now < waitUntil

  useEffect(() => {
    if (!waiting) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [waiting])

  async function press(digit: string) {
    if (waiting) return
    const next = (pin + digit).slice(0, 4)
    setPin(next)
    if (next.length < 4) return
    if (await checkPin(next)) {
      onUnlock()
      return
    }
    const tries = wrong + 1
    setWrong(tries)
    setPin('')
    if (tries % 5 === 0) {
      setWaitUntil(Date.now() + 30_000) // slow down guessing
      setNow(Date.now())
    }
  }

  async function forgot() {
    if (!confirm('Sign out to reset your PIN? You can get back in with your login code (Settings → Login code on another phone). Without a login code the account can’t be recovered.')) return
    clearPin()
    await supabase.auth.signOut()
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-slate-950 px-6 text-white" role="dialog" aria-modal="true" aria-label="Enter PIN">
      <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="h-16 w-16 rounded-2xl" />
      <p className="text-lg font-semibold">Enter your PIN</p>
      <div className="flex gap-4" aria-live="polite" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-4 w-4 rounded-full border-2 border-white ${i < pin.length ? 'bg-white' : ''}`} />
        ))}
      </div>
      <p className="h-5 text-sm text-rose-300" role="alert">
        {waiting ? `Too many tries. Wait ${Math.ceil((waitUntil - now) / 1000)}s.` : wrong > 0 ? 'Wrong PIN, try again.' : ''}
      </p>
      <div className="grid grid-cols-3 gap-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="h-18 w-18 rounded-full bg-slate-800 text-2xl font-semibold active:bg-slate-700" onClick={() => press(d)}>{d}</button>
        ))}
        <span />
        <button className="h-18 w-18 rounded-full bg-slate-800 text-2xl font-semibold active:bg-slate-700" onClick={() => press('0')}>0</button>
        <button className="h-18 w-18 rounded-full text-lg" aria-label="Delete" onClick={() => setPin(pin.slice(0, -1))}>⌫</button>
      </div>
      <button className="text-sm text-slate-400 underline" onClick={forgot}>Forgot PIN?</button>
    </div>
  )
}
