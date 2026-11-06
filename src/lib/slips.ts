// "I just gave in": your slips on habits you're breaking. Private to you (RLS); your group
// sees one card per habit per day in the feed, made by the database (habit_slips migration).
import { supabase } from './supabase'
import { addDays, type SlipLike } from './logic'

export interface Slip extends SlipLike {
  id: string
  created_at: string
}

/** Your slips from the last `days` days (for today's count, yesterday and "usually"). */
export async function listMySlips(today: string, days = 8): Promise<Slip[]> {
  const { data, error } = await supabase.from('habit_slips').select('id, habit_id, date, amount, lost_count, created_at')
    .gte('date', addDays(today, -days)).order('created_at')
  if (error) throw error
  return data as Slip[]
}

/** +amount (or "I lost count" when amount is null). Returns the new slip, to undo it. */
export async function logSlip(habitId: string, date: string, amount: number | null): Promise<Slip> {
  const row = { habit_id: habitId, date, amount, lost_count: amount === null }
  const { data, error } = await supabase.from('habit_slips').insert(row).select('id, habit_id, date, amount, lost_count, created_at').single()
  if (error) throw error
  return data as Slip
}

export async function undoSlip(id: string) {
  const { error } = await supabase.from('habit_slips').delete().eq('id', id)
  if (error) throw error
}
