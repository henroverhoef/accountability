// "Could this person use some extra support?"
//
// A hidden score over the last week of check-ins. It is never shown to anyone: the app
// only uses it to gently prompt the person (reach out to someone) and their group
// (coffee, praying together, an honest conversation).
//
// Every due habit-day in the window counts once:
//   good (clean / done / on time / 7–10)          → 1
//   mid  (struggled / partly / 4–6)               → 0.5
//   bad  (slipped / skipped / late / 1–3)         → 0
//   checked in, result not shared ("check-in only") → 1 (they showed up honestly)
//   no check-in                                    → 0
// For a group, only habits the person shares with that group are used, so nothing
// private ever influences what the group is told.
import { addDays, dateRange } from './dates.ts'
import { isDue, type HabitRules, type Outcome } from './habits.ts'

export interface SupportCheckin {
  habit_id: string
  date: string
  outcome: Outcome | null // null = checked in, but the result isn't shared
}

/** Below this the week counts as "hard". */
export const SUPPORT_THRESHOLD = 0.5
/** A window needs at least this many due habit-days before it means anything. */
export const SUPPORT_MIN_ITEMS = 4
/** "Low for a while": the week ending yesterday AND the week ending this many days earlier. */
export const SUPPORT_LOOKBACK_DAYS = 3

const POINTS: Record<Outcome, number> = { good: 1, mid: 0.5, bad: 0 }

interface Tally {
  items: number // due habit-days counted
  points: number
  answered: number // of which actually checked in
  answeredPoints: number
}

function tally(habits: HabitRules[], checkins: SupportCheckin[], end: string, days: number, openFrom?: string): Tally {
  const byKey = new Map(checkins.map((c) => [`${c.habit_id}|${c.date}`, c]))
  const t: Tally = { items: 0, points: 0, answered: 0, answeredPoints: 0 }
  for (const date of dateRange(addDays(end, -(days - 1)), end)) {
    for (const h of habits) {
      if (!isDue(h, date)) continue
      const c = byKey.get(`${h.id}|${date}`)
      if (!c) {
        if (openFrom && date >= openFrom) continue // can still be filled in
        t.items++ // missed
        continue
      }
      const p = c.outcome ? POINTS[c.outcome] : 1
      t.items++
      t.points += p
      t.answered++
      t.answeredPoints += p
    }
  }
  return t
}

/**
 * Average points per due habit-day over `days` days ending on `end`.
 * Missing check-ins on or after `openFrom` are left out (they can still be filled in).
 * Returns null when there's too little to go on.
 */
export function weekScore(
  habits: HabitRules[],
  checkins: SupportCheckin[],
  end: string,
  opts: { days?: number; openFrom?: string } = {},
): number | null {
  const t = tally(habits, checkins, end, opts.days ?? 7, opts.openFrom)
  return t.items < SUPPORT_MIN_ITEMS ? null : t.points / t.items
}

/**
 * Why someone could use support, if they could:
 *   'hard'  – the check-ins themselves have been hard (slips, skipped, low scores)
 *   'quiet' – mostly missing check-ins: they've gone quiet
 * Only when the last week was low AND the week ending a few days before was low too.
 * `today` is the person's own date; today itself never counts (the day isn't over),
 * and a missing check-in for last night doesn't count yet (it can still be caught up).
 */
export function supportReason(habits: HabitRules[], checkins: SupportCheckin[], today: string): 'hard' | 'quiet' | null {
  const yesterday = addDays(today, -1)
  const recent = tally(habits, checkins, yesterday, 7, yesterday)
  const before = tally(habits, checkins, addDays(yesterday, -SUPPORT_LOOKBACK_DAYS), 7)
  const low = (t: Tally) => t.items >= SUPPORT_MIN_ITEMS && t.points / t.items < SUPPORT_THRESHOLD
  if (!low(recent) || !low(before)) return null
  const answeredHard = recent.answered > 0 && recent.answeredPoints / recent.answered < SUPPORT_THRESHOLD
  return answeredHard ? 'hard' : 'quiet'
}

export function needsSupport(habits: HabitRules[], checkins: SupportCheckin[], today: string): boolean {
  return supportReason(habits, checkins, today) !== null
}

/**
 * What a group may use for one member: only habits shared with that group, with the
 * result hidden for "check-in only" habits (exactly what group_overview returns).
 */
export function sharedForGroup<H extends HabitRules, C extends SupportCheckin>(
  habits: H[],
  checkins: C[],
  shares: { habit_id: string; visibility: 'checkin' | 'result' | 'notes' }[],
): { habits: H[]; checkins: SupportCheckin[] } {
  const vis = new Map(shares.map((s) => [s.habit_id, s.visibility]))
  return {
    habits: habits.filter((h) => vis.has(h.id)),
    checkins: checkins
      .filter((c) => vis.has(c.habit_id))
      .map((c) => ({ habit_id: c.habit_id, date: c.date, outcome: vis.get(c.habit_id) === 'checkin' ? null : c.outcome })),
  }
}

/** Monday of the week `date` falls in: one support prompt per person per week at most. */
export function weekKey(date: string): string {
  const dow = new Date(date + 'T12:00:00Z').getUTCDay() // 0 = Sunday
  return addDays(date, -((dow + 6) % 7))
}

// ---------- prompts sent by the server -------------------------------------------

export interface SupportPerson {
  id: string
  name: string
  today: string // their own local date
}

export interface SupportPrompt {
  user_id: string // who gets the notification
  kind: string // with ref: unique per user in notification_log, so it's sent once
  ref: string
  title: string
  body: string
  url: string
}

/**
 * Who should be prompted, for the people in `recipients` (those it's prompt time for).
 * - The person themselves (all their own habits), after a hard stretch:
 *   "you don't have to carry it alone".
 * - Each other member of each of their groups (only what that member shares with
 *   the group): "X could use some extra support this week" / "X hasn't checked in much".
 * At most once per person per week (the ref is the week).
 */
export function planSupportPrompts(input: {
  recipients: (SupportPerson & { self: boolean; group: boolean })[] // self/group: which prompts they want
  people: SupportPerson[] // everyone involved, recipients included
  members: { group_id: string; user_id: string }[]
  habits: (HabitRules & { user_id: string })[]
  checkins: (SupportCheckin & { user_id: string })[]
  shares: { habit_id: string; group_id: string; visibility: 'checkin' | 'result' | 'notes' }[]
}): SupportPrompt[] {
  const person = new Map(input.people.map((p) => [p.id, p]))
  const habitsOf = (uid: string) => input.habits.filter((h) => h.user_id === uid)
  const checkinsOf = (uid: string) => input.checkins.filter((c) => c.user_id === uid)
  const reasons = new Map<string, 'hard' | 'quiet' | null>()
  const reason = (uid: string, groupId: string | null) => {
    const key = `${uid}|${groupId}`
    if (!reasons.has(key)) {
      const p = person.get(uid)
      let value: 'hard' | 'quiet' | null = null
      if (p) {
        if (groupId === null) {
          value = supportReason(habitsOf(uid), checkinsOf(uid), p.today)
        } else {
          const shared = sharedForGroup(habitsOf(uid), checkinsOf(uid), input.shares.filter((s) => s.group_id === groupId))
          value = supportReason(shared.habits, shared.checkins, p.today)
        }
      }
      reasons.set(key, value)
    }
    return reasons.get(key)!
  }

  const out: SupportPrompt[] = []
  for (const r of input.recipients) {
    const week = weekKey(r.today)
    // (Someone who has gone quiet already gets the daily check-in reminders.)
    if (r.self && reason(r.id, null) === 'hard') {
      out.push({
        user_id: r.id, kind: 'support_self', ref: week, title: 'Steadfast',
        body: 'Hard week? You don’t have to carry it alone. Reach out to someone for an honest chat.',
        url: '#/',
      })
    }
    if (!r.group) continue
    const myGroups = input.members.filter((m) => m.user_id === r.id).map((m) => m.group_id)
    for (const gid of myGroups) {
      for (const m of input.members) {
        if (m.group_id !== gid || m.user_id === r.id) continue
        const why = reason(m.user_id, gid)
        if (!why) continue
        const name = person.get(m.user_id)?.name || 'Someone in your group'
        out.push({
          user_id: r.id, kind: `support:${m.user_id}`, ref: `${gid}:${week}`, title: 'Steadfast',
          body: why === 'hard'
            ? `${name} could use some extra support this week. A coffee, a call or praying together could mean a lot.`
            : `${name} hasn’t checked in much lately. A message or a coffee could make a difference.`,
          url: `#/groups/${gid}/member/${m.user_id}`,
        })
      }
    }
  }
  return out
}
