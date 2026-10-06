// Keeping the app usable without internet:
//  * a copy of your profile/habits/check-ins is kept on the phone (so the app opens offline)
//  * check-ins saved offline wait in a queue and are sent when you're back online
import type { Checkin, Habit, Profile } from '../lib/types'

export interface CachedData {
  profile: Profile
  habits: Habit[]
  checkins: Checkin[]
}

const cacheKey = (userId: string) => `steadfast-cache-${userId}`
const queueKey = (userId: string) => `steadfast-queue-${userId}`

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function loadCache(userId: string): CachedData | null {
  return readJson<CachedData>(cacheKey(userId))
}

export function saveCache(userId: string, data: CachedData) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(data))
  } catch {
    /* storage full: not critical */
  }
}

export function loadQueue(userId: string): Checkin[] {
  return readJson<Checkin[]>(queueKey(userId)) ?? []
}

/** Add check-ins to the queue; a newer answer for the same habit+day replaces the older one. */
export function enqueue(userId: string, rows: Checkin[]) {
  const map = new Map(loadQueue(userId).map((c) => [`${c.habit_id}|${c.date}`, c]))
  for (const r of rows) map.set(`${r.habit_id}|${r.date}`, r)
  localStorage.setItem(queueKey(userId), JSON.stringify([...map.values()]))
}

export function setQueue(userId: string, rows: Checkin[]) {
  if (rows.length) localStorage.setItem(queueKey(userId), JSON.stringify(rows))
  else localStorage.removeItem(queueKey(userId))
}

/** Remove everything this app stored on the phone (used on sign-out / account deletion). */
export function clearLocalData() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('steadfast-')) localStorage.removeItem(key)
  }
}

/** Did this fail because we're offline (rather than e.g. a permission problem)? */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg)
}
