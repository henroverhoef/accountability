const ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone')
  } catch {
    return ['Africa/Johannesburg', 'Europe/London', 'America/New_York', 'Australia/Sydney', 'UTC']
  }
})()

export default function TimezoneSelect({ id, value, onChange }: { id: string; value: string; onChange: (tz: string) => void }) {
  const zones = ZONES.includes(value) ? ZONES : [value, ...ZONES]
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {zones.map((z) => (
        <option key={z} value={z}>{z.replaceAll('_', ' ')}</option>
      ))}
    </select>
  )
}
