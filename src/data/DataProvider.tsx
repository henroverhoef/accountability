// One place that loads and holds "my" data: login session, profile, habits and recent check-ins.
// Pages read it with useData(). After changing something, call the matching action
// (saveHabit, saveCheckins, …) which updates the database and the local copy.
//
// Offline: the last loaded data is kept on the phone (see offline.ts), so the app opens
// without internet. Check-ins saved offline are queued and sent automatically later.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { addDays, DEFAULT_TIMEZONE, localNow } from '../lib/logic'
import { clearPin } from '../lib/pin'
import type { Checkin, Habit, Profile } from '../lib/types'
import type { HabitDraft } from '../lib/templates'
import { clearLocalData, enqueue, isNetworkError, loadCache, loadQueue, saveCache, setQueue } from './offline'

/** How many days of history we keep in memory (enough for the 90-day heatmap). */
export const HISTORY_DAYS = 120

interface DataContextValue {
  session: Session | null
  authReady: boolean
  loading: boolean
  error: string | null
  profile: Profile | null
  habits: Habit[] // includes archived ones
  activeHabits: Habit[]
  checkins: Checkin[]
  today: string
  yesterday: string
  online: boolean
  pendingSync: number // check-ins waiting to be uploaded
  reload: () => Promise<void>
  saveProfile: (changes: Partial<Profile>) => Promise<void>
  createHabit: (draft: HabitDraft) => Promise<Habit>
  updateHabit: (id: string, changes: Partial<Habit>) => Promise<void>
  deleteHabit: (id: string) => Promise<void>
  /** Returns 'saved', or 'queued' if we're offline and it will sync later. */
  saveCheckins: (rows: Checkin[]) => Promise<'saved' | 'queued'>
  signOut: () => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside <DataProvider>')
  return ctx
}

function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE
  } catch {
    return DEFAULT_TIMEZONE
  }
}

function toRow(r: Checkin) {
  return {
    habit_id: r.habit_id,
    date: r.date,
    outcome: r.outcome,
    value_number: r.value_number,
    value_time: r.value_time,
    tags: r.tags,
    note: r.note?.trim() ? r.note.trim() : null,
  }
}

function mergeInto(prev: Checkin[], saved: Checkin[]): Checkin[] {
  const key = (c: Checkin) => `${c.habit_id}|${c.date}`
  const map = new Map(prev.map((c) => [key(c), c]))
  for (const c of saved) map.set(key(c), c)
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [habits, setHabits] = useState<Habit[]>([])
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [clock, setClock] = useState(() => new Date())
  const [online, setOnline] = useState(() => navigator.onLine)
  const [pendingSync, setPendingSync] = useState(0)
  const flushing = useRef(false)

  // Keep "today" correct if the app stays open past midnight or resumes the next morning.
  useEffect(() => {
    const tick = () => setClock(new Date())
    const id = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  const timezone = profile?.timezone || detectTimezone()
  const today = localNow(clock, timezone).date
  const yesterday = addDays(today, -1)

  // --- auth -------------------------------------------------------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  // Keep the on-phone copy up to date.
  useEffect(() => {
    if (userId && profile) saveCache(userId, { profile, habits, checkins })
  }, [userId, profile, habits, checkins])

  // --- offline queue --------------------------------------------------------
  const flushQueue = useCallback(async () => {
    if (!userId || flushing.current) return
    const queue = loadQueue(userId)
    setPendingSync(queue.length)
    if (queue.length === 0) return
    flushing.current = true
    const stillWaiting: Checkin[] = []
    const saved: Checkin[] = []
    for (const row of queue) {
      const { data, error } = await supabase.from('checkins').upsert(toRow(row), { onConflict: 'habit_id,date' }).select().single()
      if (!error) saved.push(data as Checkin)
      else if (isNetworkError(error)) stillWaiting.push(row)
      // Any other error (e.g. too old to edit, habit deleted) can never succeed: drop it.
      else console.warn('Dropping queued check-in', row, error)
    }
    setQueue(userId, stillWaiting)
    setPendingSync(stillWaiting.length)
    if (saved.length) setCheckins((prev) => mergeInto(prev, saved))
    flushing.current = false
  }, [userId])

  useEffect(() => {
    const up = () => {
      setOnline(true)
      flushQueue()
    }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    document.addEventListener('visibilitychange', flushQueue)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      document.removeEventListener('visibilitychange', flushQueue)
    }
  }, [flushQueue])

  // --- loading ------------------------------------------------------------
  const reload = useCallback(async () => {
    // Read the session fresh: callers may hold an older copy of this function
    // from before they signed in.
    const userId = (await supabase.auth.getSession()).data.session?.user.id
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      await flushQueue() // send offline check-ins first so they aren't overwritten
      const since = addDays(localNow(new Date(), timezone).date, -HISTORY_DAYS)
      const [p, h, c] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('habits').select('*').order('sort_order').order('created_at'),
        supabase.from('checkins').select('*').gte('date', since).order('date'),
      ])
      if (p.error) throw p.error
      if (h.error) throw h.error
      if (c.error) throw c.error
      let prof = p.data as Profile
      // First visit: remember the phone's timezone.
      if (!prof.onboarded && prof.timezone === DEFAULT_TIMEZONE && detectTimezone() !== DEFAULT_TIMEZONE) {
        prof = { ...prof, timezone: detectTimezone() }
        await supabase.from('profiles').update({ timezone: prof.timezone }).eq('id', userId)
      }
      setProfile(prof)
      setHabits(h.data as Habit[])
      // Anything still queued (offline) wins over the server copy until it syncs.
      setCheckins(mergeInto(c.data as Checkin[], loadQueue(userId)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
    // Only reload when the logged-in user changes (timezone is read fresh above).
  }, [userId, flushQueue])

  const previousUser = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (userId) {
      // Show the on-phone copy straight away, then refresh from the server.
      const cached = loadCache(userId)
      if (cached) {
        setProfile(cached.profile)
        setHabits(cached.habits)
        setCheckins(mergeInto(cached.checkins, loadQueue(userId)))
      }
      setPendingSync(loadQueue(userId).length)
      reload()
    } else {
      if (previousUser.current) {
        // Signed out (here or elsewhere): forget this person's data on the phone.
        clearLocalData()
        clearPin()
      }
      setProfile(null)
      setHabits([])
      setCheckins([])
    }
    previousUser.current = userId
  }, [userId, reload])

  // --- actions --------------------------------------------------------------
  const saveProfile = useCallback(
    async (changes: Partial<Profile>) => {
      if (!userId) return
      const { data, error } = await supabase.from('profiles').update(changes).eq('id', userId).select().single()
      if (error) throw error
      setProfile(data as Profile)
    },
    [userId],
  )

  const createHabit = useCallback(
    async (draft: HabitDraft) => {
      const sort_order = habits.length ? Math.max(...habits.map((h) => h.sort_order)) + 1 : 0
      const { data, error } = await supabase
        .from('habits')
        .insert({ ...draft, start_date: today, sort_order })
        .select()
        .single()
      if (error) throw error
      setHabits((prev) => [...prev, data as Habit])
      return data as Habit
    },
    [habits, today],
  )

  const updateHabit = useCallback(async (id: string, changes: Partial<Habit>) => {
    const { data, error } = await supabase.from('habits').update(changes).eq('id', id).select().single()
    if (error) throw error
    setHabits((prev) => prev.map((h) => (h.id === id ? (data as Habit) : h)))
  }, [])

  const deleteHabit = useCallback(async (id: string) => {
    const { error } = await supabase.from('habits').delete().eq('id', id)
    if (error) throw error
    setHabits((prev) => prev.filter((h) => h.id !== id))
    setCheckins((prev) => prev.filter((c) => c.habit_id !== id))
  }, [])

  const saveCheckins = useCallback(
    async (rows: Checkin[]): Promise<'saved' | 'queued'> => {
      if (rows.length === 0 || !userId) return 'saved'
      const { data, error } = await supabase.from('checkins').upsert(rows.map(toRow), { onConflict: 'habit_id,date' }).select()
      if (error) {
        if (!isNetworkError(error)) throw error
        enqueue(userId, rows)
        setPendingSync(loadQueue(userId).length)
        setCheckins((prev) => mergeInto(prev, rows))
        return 'queued'
      }
      setCheckins((prev) => mergeInto(prev, data as Checkin[]))
      return 'saved'
    },
    [userId],
  )

  const signOut = useCallback(async () => {
    clearLocalData()
    clearPin()
    await supabase.auth.signOut()
  }, [])

  const activeHabits = useMemo(() => habits.filter((h) => !h.archived), [habits])

  const value: DataContextValue = {
    session,
    authReady,
    loading,
    error,
    profile,
    habits,
    activeHabits,
    checkins,
    today,
    yesterday,
    online,
    pendingSync,
    reload,
    saveProfile,
    createHabit,
    updateHabit,
    deleteHabit,
    saveCheckins,
    signOut,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
