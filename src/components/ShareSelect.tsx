import { VISIBILITY_HELP, VISIBILITY_LABELS, type Visibility } from '../lib/groups'

/** Drop-down to choose what one group may see about one habit. */
export default function ShareSelect({ id, value, onChange, disabled }: { id: string; value: Visibility; onChange: (v: Visibility) => void; disabled?: boolean }) {
  return (
    <div>
      <select id={id} className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Visibility)}>
        {(Object.keys(VISIBILITY_LABELS) as Visibility[]).map((v) => (
          <option key={v} value={v}>{v === 'private' ? '🔒 ' : '👥 '}{VISIBILITY_LABELS[v]}</option>
        ))}
      </select>
      <p className="muted mt-1">{VISIBILITY_HELP[value]}</p>
    </div>
  )
}
