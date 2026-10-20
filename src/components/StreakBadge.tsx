import type { HabitStreak } from '../lib/logic'

/**
 * "❤️‍🔥 7 🔥 13": green days in a row, and green-or-yellow days in a row.
 * All green so far: just ❤️‍🔥 (both would be the same number). ❤️‍🔥 hidden after a
 * yellow day: just 🔥. `compact` (tight rows) shows only the first of the two.
 */
export default function StreakBadge({ streak, compact = false, className = '' }: { streak: HabitStreak; compact?: boolean; className?: string }) {
  const { current, green } = streak
  const label = green > 0
    ? `${green} green day${green === 1 ? '' : 's'} in a row${green < current ? `, ${current} days in a row` : ''}`
    : `${current} day${current === 1 ? '' : 's'} in a row`
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap font-semibold ${className}`} role="img" aria-label={label} title={label}>
      {green > 0 && <span>❤️‍🔥 {green}</span>}
      {(green === 0 || (green < current && !compact)) && <span>🔥 {current}</span>}
    </span>
  )
}

/** One line explaining the two emoji. */
export function StreakLegend({ className = '' }: { className?: string }) {
  return (
    <p className={`muted text-xs ${className}`}>
      ❤️‍🔥 green days in a row · 🔥 green or yellow days in a row. After a yellow day, ❤️‍🔥 comes back once your green run is more than half of your 🔥.
    </p>
  )
}
