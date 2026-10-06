import { useState } from 'react'
import { evaluateAmount, evaluateTime, type Outcome } from '../lib/logic'
import { outcomeLabel, OUTCOME_STYLES, shortTime, tappableOutcomes } from '../lib/outcomes'
import type { Checkin, Habit } from '../lib/types'

interface Props {
  habit: Habit
  date: string
  draft: Checkin | undefined
  onChange: (c: Checkin) => void
}

/** One habit on the check-in screen: answer with one or two taps, details optional. */
export default function CheckinCard({ habit, date, draft, onChange }: Props) {
  const [open, setOpen] = useState(Boolean(draft?.note || draft?.tags.length))

  const blank: Checkin = { habit_id: habit.id, date, outcome: 'good', value_number: null, value_time: null, tags: [], note: null }
  const update = (changes: Partial<Checkin>) => onChange({ ...blank, ...draft, ...changes })

  const showTags = habit.tags.length > 0 && (open || (habit.type === 'avoid' && draft && draft.outcome !== 'good'))

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>{habit.icon}</span>
        <h2 className="h2 flex-1">{habit.name}</h2>
        {draft && <span className={`h-3 w-3 rounded-full ${OUTCOME_STYLES[draft.outcome].dot}`} aria-label="answered" />}
      </div>

      {(habit.type === 'avoid' || habit.type === 'done') && (
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={habit.name}>
          {tappableOutcomes(habit.type).map((o) => (
            <OutcomeButton key={o} outcome={o} label={outcomeLabel(habit, o)} selected={draft?.outcome === o} onClick={() => update({ outcome: o })} />
          ))}
        </div>
      )}

      {habit.type === 'time' && <TimeInput habit={habit} draft={draft} update={update} />}
      {habit.type === 'amount' && <AmountInput habit={habit} draft={draft} update={update} />}

      {showTags && (
        <div className="flex flex-wrap gap-2" aria-label="Tags">
          {habit.tags.map((t) => {
            const on = draft?.tags.includes(t) ?? false
            return (
              <button key={t} type="button" aria-pressed={on} className={on ? 'chip-on' : 'chip-off'}
                onClick={() => update({ tags: on ? draft!.tags.filter((x) => x !== t) : [...(draft?.tags ?? []), t] })}>
                {t}
              </button>
            )
          })}
        </div>
      )}

      {open ? (
        <div>
          <label htmlFor={`note-${habit.id}`} className="label">Note (optional)</label>
          <textarea id={`note-${habit.id}`} rows={2} maxLength={1000} className="input"
            placeholder={habit.type === 'avoid' ? 'What helped or what was hard?' : 'e.g. what I read'}
            value={draft?.note ?? ''} onChange={(e) => update({ note: e.target.value })} />
        </div>
      ) : (
        <button type="button" className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline dark:text-slate-400" onClick={() => setOpen(true)}>
          + Add note{habit.tags.length ? ' / tags' : ''}
        </button>
      )}
    </div>
  )
}

function OutcomeButton({ outcome, label, selected, onClick }: { outcome: Outcome; label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick}
      className={`min-h-14 rounded-xl border-2 px-2 text-base font-semibold transition active:scale-95 ${
        selected ? OUTCOME_STYLES[outcome].on : 'border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
      }`}>
      {label}
    </button>
  )
}

function TimeInput({ habit, draft, update }: { habit: Habit; draft?: Checkin; update: (c: Partial<Checkin>) => void }) {
  const target = shortTime(habit.target_time) || '22:30'
  const [value, setValue] = useState(shortTime(draft?.value_time) || target)
  const log = (v: string) => update({ value_time: v, outcome: evaluateTime(v, target, habit.grace_minutes) })
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`time-${habit.id}`}>Actual time</label>
      <input id={`time-${habit.id}`} type="time" className="input flex-1 text-lg" value={value}
        onChange={(e) => { setValue(e.target.value); if (draft && e.target.value) log(e.target.value) }} />
      <button type="button" className={draft ? 'btn-secondary' : 'btn-primary'} onClick={() => value && log(value)}>
        {draft ? outcomeLabel(habit, draft.outcome) : 'Log'}
      </button>
      <span className="sr-only">Target {target}</span>
    </div>
  )
}

function AmountInput({ habit, draft, update }: { habit: Habit; draft?: Checkin; update: (c: Partial<Checkin>) => void }) {
  const [value, setValue] = useState<number>(draft?.value_number ?? habit.target_value ?? 0)
  const log = (v: number) => update({ value_number: v, outcome: evaluateAmount(v, habit.target_value, habit.target_direction) })
  const set = (v: number) => { const n = Math.max(0, v); setValue(n); if (draft) log(n) }
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="btn-secondary w-12" aria-label="Less" onClick={() => set(value - 1)}>−</button>
      <label className="sr-only" htmlFor={`amt-${habit.id}`}>{habit.unit ?? 'Amount'}</label>
      <input id={`amt-${habit.id}`} type="number" inputMode="decimal" min={0} className="input w-20 text-center text-lg"
        value={value} onChange={(e) => set(Number(e.target.value))} />
      <button type="button" className="btn-secondary w-12" aria-label="More" onClick={() => set(value + 1)}>+</button>
      <span className="muted flex-1">{habit.unit}</span>
      <button type="button" className={draft ? 'btn-secondary' : 'btn-primary'} onClick={() => log(value)}>
        {draft ? outcomeLabel(habit, draft.outcome) : 'Log'}
      </button>
    </div>
  )
}
