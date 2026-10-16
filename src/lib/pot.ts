// The group's habits "in one pot": every habit members share with the group, grouped by
// name (so everyone's "No Short-form Video" lands together), with how the last week went.
// Only uses what group_overview returns, so nothing private is ever included.
import { addDays, dateRange, isDue } from './logic'
import type { GroupOverview } from './groups'

export interface PotCategory {
  key: string // normalised name, e.g. "noshortformvideo"
  name: string // most common spelling
  icon: string
  people: { user_id: string; name: string }[]
  good: number
  mid: number
  bad: number
  checkedIn: number // checked in, result not shared
  missed: number
}

/** "No Short-form Video", "no short form video " → "noshortformvideo". */
export function habitKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/**
 * Share of the answers this week that went well (mixed counts half). Missed check-ins
 * aren't counted: they say someone didn't check in, not how the habit went.
 * Null when there are fewer than 3 answers to go on.
 */
export function potRate(c: PotCategory): number | null {
  const answered = c.good + c.mid + c.bad
  return answered < 3 ? null : (c.good + c.mid / 2) / answered
}

/** A hard week in this habit (going by the answers). */
export function potIsHard(c: PotCategory): boolean {
  const rate = potRate(c)
  return rate !== null && rate < 0.5
}

/**
 * The last `days` days for every shared habit, per category. Today only counts once
 * checked in (the day isn't over). Sorted: shared by the most people first, then the
 * hardest first.
 */
export function habitPot(o: GroupOverview, days = 7): PotCategory[] {
  const byKey = new Map<string, { names: string[]; icons: string[]; cat: PotCategory }>()
  const checkins = new Map(o.checkins.map((c) => [`${c.habit_id}|${c.date}`, c]))

  for (const h of o.habits) {
    const member = o.members.find((m) => m.user_id === h.user_id)
    if (!member) continue
    const key = habitKey(h.name)
    if (!key) continue
    let entry = byKey.get(key)
    if (!entry) {
      entry = { names: [], icons: [], cat: { key, name: h.name, icon: h.icon, people: [], good: 0, mid: 0, bad: 0, checkedIn: 0, missed: 0 } }
      byKey.set(key, entry)
    }
    entry.names.push(h.name.trim())
    entry.icons.push(h.icon)
    const cat = entry.cat
    if (!cat.people.some((p) => p.user_id === h.user_id)) cat.people.push({ user_id: h.user_id, name: member.display_name || 'Someone' })

    const today = member.today
    for (const date of dateRange(addDays(today, -(days - 1)), today)) {
      if (!isDue({ ...h, archived: false }, date)) continue
      const c = checkins.get(`${h.id}|${date}`)
      if (!c) {
        if (date !== today) cat.missed++
      } else if (!c.outcome) cat.checkedIn++
      else cat[c.outcome]++
    }
  }

  const cats = [...byKey.values()].map(({ names, icons, cat }) => ({ ...cat, name: mostCommon(names), icon: mostCommon(icons) }))
  return cats.sort((a, b) =>
    b.people.length - a.people.length
    || (potRate(a) ?? 1) - (potRate(b) ?? 1)
    || a.name.localeCompare(b.name))
}
