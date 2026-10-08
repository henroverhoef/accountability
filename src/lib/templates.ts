import type { Habit } from './types'

export type HabitDraft = Omit<Habit, 'id' | 'user_id' | 'start_date' | 'sort_order' | 'archived'>

const everyDay = [0, 1, 2, 3, 4, 5, 6]

const base: Pick<HabitDraft, 'schedule_days' | 'target_value' | 'target_direction' | 'target_time' | 'grace_minutes' | 'unit' | 'outcome_options' | 'tags' | 'reminder_time' | 'wind_down_minutes' | 'question'> = {
  schedule_days: everyDay,
  target_value: null,
  target_direction: null,
  target_time: null,
  grace_minutes: 0,
  unit: null,
  outcome_options: {},
  tags: [],
  reminder_time: null,
  wind_down_minutes: null,
  question: null,
}

export const TEMPLATES: { key: string; description: string; habit: HabitDraft }[] = [
  {
    key: 'purity',
    description: 'Guard your eyes and heart. You can rename it to anything.',
    habit: { ...base, name: 'Purity', icon: '🛡️', type: 'avoid', tags: ['late night', 'alone', 'stressed', 'bored', 'scrolling', 'tired'] },
  },
  {
    key: 'shorts',
    description: 'Stay off endless short videos.',
    habit: { ...base, name: 'No Short-form Video', icon: '📵', type: 'avoid', tags: ['bored', 'scrolling', 'tired', 'avoiding work', 'late night'] },
  },
  {
    key: 'quiet-time',
    description: 'Time with God in prayer and the Word.',
    habit: { ...base, name: 'Quiet Time', icon: '🙏', type: 'done' },
  },
  {
    key: 'bedtime',
    description: 'In bed on time, phone away.',
    habit: { ...base, name: 'Bedtime', icon: '🌙', type: 'time', target_time: '22:30', wind_down_minutes: 30 },
  },
  {
    key: 'exercise',
    description: 'Look after the body God gave you.',
    habit: { ...base, name: 'Exercise', icon: '💪', type: 'done' },
  },
  {
    key: 'scripture',
    description: 'Read at least one chapter a day.',
    habit: { ...base, name: 'Scripture Reading', icon: '📖', type: 'amount', unit: 'chapters', target_value: 1, target_direction: 'at_least' },
  },
  {
    key: 'thankfulness',
    description: 'Be honest: how thankful were you today? Score it out of 10.',
    habit: { ...base, name: 'Thankfulness', icon: '🌻', type: 'scale', question: 'How thankful was I today?', tags: ['tired', 'stressed', 'comparing', 'complaining', 'busy'] },
  },
]

export const BLANK_HABIT: HabitDraft = { ...base, name: '', icon: '✅', type: 'done' }

export const ICON_CHOICES = ['✅', '🛡️', '📵', '🙏', '📖', '🌙', '💪', '🏃', '💧', '🍎', '✍️', '🎯', '🧠', '❤️', '⭐', '🔥']
