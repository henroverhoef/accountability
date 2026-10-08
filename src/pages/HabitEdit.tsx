import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { BLANK_HABIT, ICON_CHOICES, TEMPLATES, type HabitDraft } from '../lib/templates'
import { DEFAULT_LABELS, shortTime, tappableOutcomes, TYPE_NAMES, WEEKDAYS } from '../lib/outcomes'
import type { HabitType } from '../lib/logic'

export default function HabitEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { habits, createHabit, updateHabit, deleteHabit } = useData()
  const existing = habits.find((h) => h.id === id)
  const isNew = !existing

  const [form, setForm] = useState<HabitDraft>(() => (existing ? { ...existing } : { ...BLANK_HABIT }))
  const [newTag, setNewTag] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (changes: Partial<HabitDraft>) => setForm((f) => ({ ...f, ...changes }))

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      const clean: HabitDraft = {
        ...form,
        name: form.name.trim(),
        target_time: form.type === 'time' ? form.target_time || '22:30' : null,
        target_value: form.type === 'amount' ? form.target_value : null,
        target_direction: form.type === 'amount' ? form.target_direction || 'at_least' : null,
        unit: form.type === 'amount' ? form.unit?.trim() || null : null,
        wind_down_minutes: form.type === 'time' ? form.wind_down_minutes : null,
        question: form.type === 'scale' ? form.question?.trim() || null : null,
      }
      // Never send read-only columns back to the database.
      const { name, icon, type, schedule_days, target_value, target_direction, target_time, grace_minutes, unit, outcome_options, tags, reminder_time, wind_down_minutes, question } = clean
      const fields = {
        name, icon, type, schedule_days, target_value, target_direction, target_time, grace_minutes, unit, outcome_options, tags, reminder_time, wind_down_minutes,
        // only score habits have a question
        ...(type === 'scale' ? { question } : {}),
      } as HabitDraft
      if (existing) {
        await updateHabit(existing.id, fields)
        navigate(`/habits/${existing.id}`, { replace: true })
      } else {
        const h = await createHabit(fields)
        navigate(`/habits/${h.id}`, { replace: true })
      }
    })
  }

  function addTag() {
    const t = newTag.trim().toLowerCase()
    if (t && !form.tags.includes(t)) set({ tags: [...form.tags, t] })
    setNewTag('')
  }

  return (
    <form className="page space-y-5" onSubmit={submit}>
      <Link to={existing ? `/habits/${existing.id}` : '/habits'} className="btn-ghost -ml-4">‹ Back</Link>
      <h1 className="h1">{isNew ? 'New habit' : 'Edit habit'}</h1>

      {isNew && (
        <section>
          <h2 className="label">Start from a template</h2>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button key={t.key} type="button" className="chip-off" onClick={() => setForm({ ...t.habit })}>
                {t.habit.icon} {t.habit.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <div>
        <label htmlFor="name" className="label">Name (only you and groups you share with see this)</label>
        <input id="name" className="input" required maxLength={40} value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </div>

      <fieldset>
        <legend className="label">Icon</legend>
        <div className="flex flex-wrap gap-2">
          {ICON_CHOICES.map((i) => (
            <button key={i} type="button" aria-pressed={form.icon === i} aria-label={`Icon ${i}`}
              className={`h-11 w-11 rounded-xl text-2xl ${form.icon === i ? 'bg-amber-200 ring-2 ring-amber-500 dark:bg-amber-900/50' : 'bg-slate-100 dark:bg-slate-800'}`}
              onClick={() => set({ icon: i })}>{i}</button>
          ))}
          <input aria-label="Custom emoji" className="input w-20 text-center text-xl" maxLength={4} value={form.icon} onChange={(e) => set({ icon: e.target.value })} />
        </div>
      </fieldset>

      <div>
        <label htmlFor="type" className="label">Type</label>
        <select id="type" className="input" value={form.type} disabled={!isNew}
          onChange={(e) => set({ type: e.target.value as HabitType, outcome_options: {} })}>
          {(Object.keys(TYPE_NAMES) as HabitType[]).map((t) => <option key={t} value={t}>{TYPE_NAMES[t]}</option>)}
        </select>
        {!isNew && <p className="muted mt-1">The type can’t be changed after creating a habit.</p>}
      </div>

      <fieldset>
        <legend className="label">Which days?</legend>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d, i) => {
            const on = form.schedule_days.includes(i)
            return (
              <button key={d} type="button" aria-pressed={on}
                className={`min-h-11 rounded-lg text-sm font-semibold ${on ? 'bg-amber-400 text-slate-900' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                onClick={() => set({ schedule_days: on ? form.schedule_days.filter((x) => x !== i) : [...form.schedule_days, i].sort() })}>
                {d}
              </button>
            )
          })}
        </div>
      </fieldset>

      {form.type === 'time' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="target_time" className="label">Target (at or before)</label>
            <input id="target_time" type="time" className="input" required value={shortTime(form.target_time) || '22:30'} onChange={(e) => set({ target_time: e.target.value })} />
          </div>
          <div>
            <label htmlFor="grace" className="label">Grace minutes</label>
            <input id="grace" type="number" min={0} max={120} className="input" value={form.grace_minutes} onChange={(e) => set({ grace_minutes: Number(e.target.value) })} />
          </div>
        </div>
      )}

      {form.type === 'scale' && (
        <div>
          <label htmlFor="question" className="label">Question to answer each day (score out of 10)</label>
          <input id="question" className="input" maxLength={120} placeholder="How thankful was I today?"
            value={form.question ?? ''} onChange={(e) => set({ question: e.target.value })} />
          <p className="muted mt-1">7–10 counts as a strong day (green), 4–6 mixed (amber), 1–3 hard (red).</p>
        </div>
      )}

      {form.type === 'amount' && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="dir" className="label">Target</label>
            <select id="dir" className="input" value={form.target_direction ?? 'at_least'} onChange={(e) => set({ target_direction: e.target.value as 'at_least' | 'at_most' })}>
              <option value="at_least">At least</option>
              <option value="at_most">At most</option>
            </select>
          </div>
          <div>
            <label htmlFor="tv" className="label">Amount</label>
            <input id="tv" type="number" min={0} step="any" className="input" value={form.target_value ?? ''} onChange={(e) => set({ target_value: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <div>
            <label htmlFor="unit" className="label">Unit</label>
            <input id="unit" className="input" maxLength={20} placeholder="chapters" value={form.unit ?? ''} onChange={(e) => set({ unit: e.target.value })} />
          </div>
        </div>
      )}

      {tappableOutcomes(form.type).length > 0 && (
        <fieldset>
          <legend className="label">Answer buttons (rename if you like)</legend>
          <div className="grid grid-cols-3 gap-2">
            {tappableOutcomes(form.type).map((o) => (
              <input key={o} aria-label={`Label for ${DEFAULT_LABELS[form.type][o]}`} className="input" maxLength={20}
                placeholder={DEFAULT_LABELS[form.type][o]} value={form.outcome_options[o] ?? ''}
                onChange={(e) => set({ outcome_options: { ...form.outcome_options, [o]: e.target.value || undefined } })} />
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="label">Quick tags (to spot patterns, e.g. “late night”)</legend>
        <div className="mb-2 flex flex-wrap gap-2">
          {form.tags.map((t) => (
            <button key={t} type="button" className="chip-on" aria-label={`Remove tag ${t}`} onClick={() => set({ tags: form.tags.filter((x) => x !== t) })}>
              {t} ✕
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input aria-label="New tag" className="input" maxLength={24} value={newTag} placeholder="Add a tag"
            onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} />
          <button type="button" className="btn-secondary" onClick={addTag}>Add</button>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="label">Reminder (optional)</legend>
        <div className="flex items-center gap-2">
          <label htmlFor="reminder" className="flex-1">Extra reminder for this habit</label>
          <input id="reminder" type="time" className="input w-36" value={shortTime(form.reminder_time)} onChange={(e) => set({ reminder_time: e.target.value || null })} />
          {form.reminder_time && <button type="button" className="btn-ghost px-2" aria-label="Remove reminder" onClick={() => set({ reminder_time: null })}>✕</button>}
        </div>
        {form.type === 'time' && (
          <div className="flex items-center gap-2">
            <label htmlFor="wind" className="flex-1">Wind-down reminder before target</label>
            <select id="wind" className="input w-36" value={form.wind_down_minutes ?? ''} onChange={(e) => set({ wind_down_minutes: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Off</option>
              {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        )}
        <p className="muted">Reminders skip days you’ve already checked in.</p>
      </fieldset>

      <ErrorText error={error} />
      <button className="btn-primary w-full" disabled={busy || !form.name.trim() || form.schedule_days.length === 0}>
        {busy ? 'Saving…' : 'Save'}
      </button>

      {existing && (
        <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <button type="button" className="btn-secondary w-full" disabled={busy}
            onClick={() => run(async () => { await updateHabit(existing.id, { archived: !existing.archived }); navigate('/habits') })}>
            {existing.archived ? 'Restore habit' : 'Archive habit (keeps history)'}
          </button>
          <button type="button" className="btn-ghost w-full text-rose-600" disabled={busy}
            onClick={() => {
              if (confirm('Delete this habit and ALL its check-ins? This cannot be undone.')) {
                run(async () => { await deleteHabit(existing.id); navigate('/habits') })
              }
            }}>
            Delete habit
          </button>
        </div>
      )}
    </form>
  )
}
