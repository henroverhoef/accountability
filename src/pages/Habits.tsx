import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import { habitStreak } from '../lib/logic'
import { TYPE_NAMES } from '../lib/outcomes'
import type { Habit } from '../lib/types'

export default function Habits() {
  const { habits, activeHabits, checkins, today } = useData()
  const [showArchived, setShowArchived] = useState(false)
  const archived = habits.filter((h) => h.archived)

  return (
    <div className="page space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Habits</h1>
        <Link to="/habits/new" className="btn-primary">+ Add</Link>
      </div>

      {activeHabits.length === 0 && <p className="card">No habits yet. Tap “Add” to choose one.</p>}
      <ul className="space-y-2">
        {activeHabits.map((h) => <HabitRow key={h.id} habit={h} streak={habitStreak(h, checkins, today).current} />)}
      </ul>

      {archived.length > 0 && (
        <div>
          <button className="btn-ghost" onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}>
            {showArchived ? '▾' : '▸'} Archived ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-2 space-y-2 opacity-70">
              {archived.map((h) => <HabitRow key={h.id} habit={h} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function HabitRow({ habit, streak }: { habit: Habit; streak?: number }) {
  return (
    <li>
      <Link to={`/habits/${habit.id}`} className="card flex min-h-16 items-center gap-3">
        <span className="text-2xl" aria-hidden>{habit.icon}</span>
        <span className="flex-1">
          <span className="block font-semibold">{habit.name}</span>
          <span className="muted block">{TYPE_NAMES[habit.type]}</span>
        </span>
        {streak !== undefined && <span className="font-bold">🔥 {streak}</span>}
      </Link>
    </li>
  )
}
