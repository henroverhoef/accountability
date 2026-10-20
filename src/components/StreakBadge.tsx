import type { HabitStreak } from '../lib/logic'

/**
 * One streak at a time: "❤️‍🔥 7" (green days in a row) while it shows, otherwise
 * "🔥 13" (green or yellow days in a row).
 */
export default function StreakBadge({ streak, className = '' }: { streak: HabitStreak; className?: string }) {
  const s = streakShown(streak)
  return (
    <span className={`whitespace-nowrap font-semibold ${className}`} role="img" aria-label={s.label} title={s.label}>{s.icon} {s.days}</span>
  )
}

export function streakShown({ current, green }: HabitStreak) {
  const days = green > 0 ? green : current
  return {
    icon: green > 0 ? '❤️‍🔥' : '🔥',
    days,
    label: `${days} ${green > 0 ? 'green ' : ''}day${days === 1 ? '' : 's'} in a row`,
  }
}

/** One line explaining the two emoji. */
export function StreakLegend({ className = '' }: { className?: string }) {
  return (
    <p className={`muted text-xs ${className}`}>
      ❤️‍🔥 green days in a row · 🔥 green or yellow days in a row. After a yellow day, ❤️‍🔥 comes back once your green run is more than half of your 🔥.
    </p>
  )
}
