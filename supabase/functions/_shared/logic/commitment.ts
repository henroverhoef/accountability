// "Let your yes be yes": is someone struggling to keep ONE habit they committed to?
//
// Separate from the overall support score (support.ts): this looks at each habit on its
// own, regardless of how the others go. It only applies to commitments to DO something
// (done / time / amount habits, like "exercise 7 days a week"), where an honest answer
// can be "this isn't what the Lord has asked of me in this season". Not to habits you
// avoid (that's a struggle to fight, not a commitment to reconsider) or scores out of 10.
//
// Over the last two weeks (ending yesterday), every due day counts once:
//   good → 1, mid (partly) → 0.5, bad / missed → 0,
//   checked in with the result not shared ("check-in only") → 1.
// Below half, with enough due days and a habit at least two weeks old: struggling.
// As with support, a group only ever uses what that person shares with it.
import { addDays, dateRange } from './dates.ts'
import { isDue, type HabitRules, type HabitType } from './habits.ts'
import { sharedForGroup, weekKey, type SupportCheckin, type SupportPerson, type SupportPrompt } from './support.ts'

export const COMMITMENT_TYPES: HabitType[] = ['done', 'time', 'amount']
/** The window: the last two weeks, ending yesterday. */
export const COMMITMENT_DAYS = 14
/** At least this many due days in the window (e.g. 3x a week) before it means anything. */
export const COMMITMENT_MIN_DUE = 6
/** Kept less than half the time: struggling. */
export const COMMITMENT_THRESHOLD = 0.5
/** After you answer, how long until the app asks again. */
export const COMMITMENT_SNOOZE_DAYS = { change: 14, pray: 3, release: 14 } as const

export type CommitmentAnswer = keyof typeof COMMITMENT_SNOOZE_DAYS

export interface CommitmentStat {
  due: number // due days in the window
  kept: number // fully kept (green)
  partly: number
  score: number // 0..1
}

/**
 * How one habit's commitment went over the last two weeks (ending yesterday).
 * null when it doesn't apply: not a commitment-type habit, too new, or too few due days.
 * A missing check-in for last night doesn't count yet (it can still be caught up).
 */
export function commitmentStat(habit: HabitRules, checkins: SupportCheckin[], today: string): CommitmentStat | null {
  if (!COMMITMENT_TYPES.includes(habit.type) || habit.archived) return null
  if (habit.start_date > addDays(today, -COMMITMENT_DAYS)) return null
  const yesterday = addDays(today, -1)
  const byDate = new Map(checkins.filter((c) => c.habit_id === habit.id).map((c) => [c.date, c]))
  const s: CommitmentStat = { due: 0, kept: 0, partly: 0, score: 0 }
  let points = 0
  for (const date of dateRange(addDays(today, -COMMITMENT_DAYS), yesterday)) {
    if (!isDue(habit, date)) continue
    const c = byDate.get(date)
    if (!c) {
      if (date === yesterday) continue // can still be caught up
      s.due++
      continue
    }
    s.due++
    if (c.outcome === null || c.outcome === 'good') { points += 1; s.kept++ } else if (c.outcome === 'mid') { points += 0.5; s.partly++ }
  }
  if (s.due < COMMITMENT_MIN_DUE) return null
  s.score = points / s.due
  return s
}

export function strugglingToCommit(habit: HabitRules, checkins: SupportCheckin[], today: string): boolean {
  const s = commitmentStat(habit, checkins, today)
  return s !== null && s.score < COMMITMENT_THRESHOLD
}

/** Is the question about this habit snoozed by an answer you gave recently? */
export function commitmentSnoozed(answers: { habit_id: string; answer: CommitmentAnswer; created_at: string }[], habitId: string, now: Date): boolean {
  return answers.some((a) => a.habit_id === habitId && Date.parse(a.created_at) + COMMITMENT_SNOOZE_DAYS[a.answer] * 86400000 > now.getTime())
}

/**
 * Weekly prompts, sent with the support prompts (and skipped when one of those already
 * goes to the same person about the same member this week):
 * - the person: one of your commitments has been hard to keep (unless they answered the
 *   question about it recently),
 * - each other member of their groups: X has found it hard to keep a commitment.
 * The text never names the habit (it may show on a lock screen); the app does.
 */
export function planCommitmentPrompts(input: {
  recipients: (SupportPerson & { self: boolean; group: boolean })[]
  people: SupportPerson[]
  members: { group_id: string; user_id: string }[]
  habits: (HabitRules & { user_id: string })[]
  checkins: (SupportCheckin & { user_id: string })[]
  shares: { habit_id: string; group_id: string; visibility: 'checkin' | 'result' | 'notes' }[]
  answers: { user_id: string; habit_id: string; answer: CommitmentAnswer; created_at: string }[]
  now: Date
  already: SupportPrompt[] // support prompts going out now
}): SupportPrompt[] {
  const person = new Map(input.people.map((p) => [p.id, p]))
  const habitsOf = (uid: string) => input.habits.filter((h) => h.user_id === uid)
  const checkinsOf = (uid: string) => input.checkins.filter((c) => c.user_id === uid)
  const sent = new Set(input.already.map((p) => `${p.user_id}|${p.kind}|${p.ref}`))

  const out: SupportPrompt[] = []
  for (const r of input.recipients) {
    const week = weekKey(r.today)
    if (r.self && !sent.has(`${r.id}|support_self|${week}`)) {
      const mine = checkinsOf(r.id)
      const answers = input.answers.filter((a) => a.user_id === r.id)
      if (habitsOf(r.id).some((h) => strugglingToCommit(h, mine, r.today) && !commitmentSnoozed(answers, h.id, input.now))) {
        out.push({
          user_id: r.id, kind: 'commit_self', ref: week, title: 'Steadfast',
          body: 'One of your commitments has been hard to keep lately. Take a moment to look at it honestly with the Lord.',
          url: '#/',
        })
      }
    }
    if (!r.group) continue
    const myGroups = input.members.filter((m) => m.user_id === r.id).map((m) => m.group_id)
    for (const gid of myGroups) {
      for (const m of input.members) {
        if (m.group_id !== gid || m.user_id === r.id) continue
        if (sent.has(`${r.id}|support:${m.user_id}|${gid}:${week}`)) continue
        const p = person.get(m.user_id)
        if (!p) continue
        const shared = sharedForGroup(habitsOf(m.user_id), checkinsOf(m.user_id), input.shares.filter((s) => s.group_id === gid))
        if (!shared.habits.some((h) => strugglingToCommit(h, shared.checkins, p.today))) continue
        out.push({
          user_id: r.id, kind: `commit:${m.user_id}`, ref: `${gid}:${week}`, title: 'Steadfast',
          body: `${p.name || 'Someone in your group'} has found it hard to keep one of their commitments. Maybe have an honest chat about it.`,
          url: `#/groups/${gid}/member/${m.user_id}`,
        })
      }
    }
  }
  return out
}
