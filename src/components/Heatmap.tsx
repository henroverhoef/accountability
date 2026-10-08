import { useState } from 'react'
import { addDays, isDue, weekdayOf } from '../lib/logic'
import { describeAnswer, formatDate, hasMidOutcome, outcomeLabel, OUTCOME_STYLES } from '../lib/outcomes'
import type { Outcome } from '../lib/logic'
import type { Habit } from '../lib/types'

/** What the calendar needs about a habit (your own, or one a group member shares). */
export type HeatmapHabit = Pick<Habit, 'id' | 'name' | 'type' | 'schedule_days' | 'start_date' | 'outcome_options' | 'unit'>

/** A check-in; outcome is null when it's shared as "check-in only" (result hidden). */
export interface HeatmapCheckin {
  habit_id: string
  date: string
  outcome: Outcome | null
  value_number?: number | null
  value_time?: string | null
  tags: string[]
  note: string | null
}

const CHECKED_IN_ONLY = 'bg-sky-400 dark:bg-sky-500'

/** Calendar grid of the last ~90 days: one column per week, Sunday at the top. */
export default function Heatmap({ habit, checkins, today, weeks = 13 }: { habit: HeatmapHabit; checkins: HeatmapCheckin[]; today: string; weeks?: number }) {
  const [selected, setSelected] = useState<string | null>(null)
  const byDate = new Map(checkins.filter((c) => c.habit_id === habit.id).map((c) => [c.date, c]))
  // Start on the Sunday (weeks-1) weeks before this week's Sunday.
  const start = addDays(today, -weekdayOf(today) - (weeks - 1) * 7)
  const columns: string[][] = []
  for (let w = 0; w < weeks; w++) columns.push(Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))

  const sel = selected ? byDate.get(selected) : undefined

  return (
    <div>
      {/* Squares stay small (about 24px) even when only a few weeks are shown. */}
      <div className="flex gap-1" role="grid" aria-label={`${habit.name} history`} style={{ maxWidth: weeks * 26 }}>
        {columns.map((col) => (
          <div key={col[0]} className="flex flex-1 flex-col gap-1" role="row">
            {col.map((date) => {
              const c = byDate.get(date)
              const future = date > today
              const due = isDue({ ...habit, archived: false }, date)
              let color = 'bg-slate-100 dark:bg-slate-800/40' // not due
              if (future) color = 'bg-transparent'
              else if (c) color = c.outcome ? OUTCOME_STYLES[c.outcome].dot : CHECKED_IN_ONLY
              else if (due && date !== today) color = 'bg-slate-300 dark:bg-slate-600' // missed check-in
              const label = `${formatDate(date)}: ${c ? describeAnswer(habit, c) : due ? 'no check-in' : 'not scheduled'}`
              return (
                <button
                  key={date}
                  role="gridcell"
                  disabled={future}
                  aria-label={label}
                  title={label}
                  onClick={() => setSelected(date === selected ? null : date)}
                  className={`aspect-square w-full rounded-[3px] ${color} ${date === today ? 'ring-2 ring-amber-400' : ''} ${
                    date === selected ? 'outline-2 outline-slate-900 dark:outline-white' : ''
                  }`}
                />
              )
            })}
          </div>
        ))}
      </div>
      <Legend habit={habit} checkinOnly={checkins.some((c) => c.habit_id === habit.id && !c.outcome)} />
      {selected && (
        <div className="mt-3 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
          <div className="font-semibold">{formatDate(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          {sel ? (
            <>
              <div>{describeAnswer(habit, sel)}</div>
              {sel.tags.length > 0 && <div className="muted">{sel.tags.join(', ')}</div>}
              {sel.note && <div className="mt-1 whitespace-pre-wrap">{sel.note}</div>}
            </>
          ) : (
            <div className="muted">No check-in</div>
          )}
        </div>
      )}
    </div>
  )
}

function Legend({ habit, checkinOnly }: { habit: HeatmapHabit; checkinOnly: boolean }) {
  const items: [string, string][] = checkinOnly
    ? [[CHECKED_IN_ONLY, 'Checked in'], ['bg-slate-300 dark:bg-slate-600', 'No check-in']]
    : [
        [OUTCOME_STYLES.good.dot, outcomeLabel(habit, 'good')],
        ...(hasMidOutcome(habit.type) ? [[OUTCOME_STYLES.mid.dot, outcomeLabel(habit, 'mid')] as [string, string]] : []),
        [OUTCOME_STYLES.bad.dot, outcomeLabel(habit, 'bad')],
        ['bg-slate-300 dark:bg-slate-600', 'No check-in'],
      ]
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
      {items.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1">
          <span className={`inline-block h-3 w-3 rounded-sm ${c}`} /> {l}
        </span>
      ))}
    </div>
  )
}
