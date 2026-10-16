// "Moments set aside to pray": several prayers can share one moment (e.g. Jesse and
// Jared at 11:00). Used by the app (Home, the prayer pop-up) and the push function
// (one notification per moment).

/** Group reminders that share the same time, earliest first. */
export function prayerMoments<T extends { remind_at: string }>(rows: T[]): { at: number; items: T[] }[] {
  const byTime = new Map<number, T[]>()
  for (const r of rows) {
    const at = Date.parse(r.remind_at)
    byTime.set(at, [...(byTime.get(at) ?? []), r])
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([at, items]) => ({ at, items }))
}

/** ["Jesse", "Jared", "the group"] → "Jesse, Jared and the group" (each name once). */
export function joinNames(names: string[]): string {
  const unique = [...new Set(names)]
  if (unique.length <= 1) return unique[0] ?? ''
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`
}
