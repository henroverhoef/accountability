// One place that loads and holds "my" data: login session, profile, habits and recent check-ins.
// Pages read it with useData(). After changing something, call the matching action
// (saveHabit, saveCheckins, …) which updates the database and the local copy.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { addDays, DEFAULT_TIMEZONE, localNow } from '../lib/logic'
import type { Checkin, Habit, Profile } from '../lib/types'
import type { HabitDraft } from '../lib/templates'

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
  reload: () => Promise<void>
  saveProfile: (changes: Partial<Profile>) => Promise<void>
  createHabit: (draft: HabitDraft) => Promise<Habit>
  updateHabit: (id: string, changes: Partial<Habit>) => Promise<void>
  deleteHabit: (id: string) => Promise<void>
  saveCheckins: (rows: Checkin[]) => Promise<void>
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

export function DataProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [habits, setHabits] = useState<Habit[]>([])
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [clock, setClock] = useState(() => new Date())

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

  // --- loading ------------------------------------------------------------
  const reload = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
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
      setCheckins(c.data as Checkin[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
    // Only reload when the logged-in user changes (timezone is read fresh above).
  }, [userId])

  useEffect(() => {
    if (userId) reload()
    else {
      setProfile(null)
      setHabits([])
      setCheckins([])
    }
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

  const saveCheckins = useCallback(async (rows: Checkin[]) => {
    if (rows.length === 0) return
    const payload = rows.map((r) => ({
      habit_id: r.habit_id,
      date: r.date,
      outcome: r.outcome,
      value_number: r.value_number,
      value_time: r.value_time,
      tags: r.tags,
      note: r.note?.trim() ? r.note.trim() : null,
    }))
    const { data, error } = await supabase.from('checkins').upsert(payload, { onConflict: 'habit_id,date' }).select()
    if (error) throw error
    mergeCheckins(data as Checkin[])
  }, [])

  function mergeCheckins(saved: Checkin[]) {
    setCheckins((prev) => {
      const key = (c: Checkin) => `${c.habit_id}|${c.date}`
      const map = new Map(prev.map((c) => [key(c), c]))
      for (const c of saved) map.set(key(c), c)
      return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
    })
  }

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
    reload,
    saveProfile,
    createHabit,
    updateHabit,
    deleteHabit,
    saveCheckins,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
