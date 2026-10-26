import { useState } from 'react'
import PrayerPrompt from './PrayerPrompt'
import { prayActions, ReactionLabel, type Social } from './Reactions'
import { sendPrayerWord, type GroupOverview } from '../lib/groups'
import { OUTCOME_STYLES } from '../lib/outcomes'
import { habitKey, habitPot, potIsHard, type PotCategory } from '../lib/pot'

/**
 * The group's Overview tab: everyone's shared habits in one pot, grouped by name, with how
 * the last week went, so the group can see shared struggles and pray into them together.
 */
export default function HabitPot({ o, social }: { o: GroupOverview; social: Social }) {
  const pot = habitPot(o)
  return (
    <div className="space-y-3">
      <p className="muted">
        Everyone’s shared habits in one pot, grouped by name: how the last 7 days went for the group.
        Only what each person shares with this group is included.
      </p>
      {pot.length === 0 && <p className="card text-center">No shared habits yet.</p>}
      <ul className="space-y-3">
        {pot.map((c) => <Category key={c.key} c={c} social={social} />)}
      </ul>
    </div>
  )
}

function Category({ c, social }: { c: PotCategory; social: Social }) {
  const [praying, setPraying] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const hard = potIsHard(c)
  const names = c.people.map((p) => (p.user_id === social.me ? 'you' : p.name))
  const weekAgo = Date.now() - 7 * 86400000
  const prayers = social.reactions.filter((r) => r.kind === 'prayer' && !r.to_user && r.topic && habitKey(r.topic) === c.key && Date.parse(r.created_at) > weekAgo)
  const subject = c.people.length === 1 ? `${names[0] === 'you' ? 'your' : `${names[0]}’s`} ${c.name}` : `the group’s ${c.name}`
  const pray = prayActions(social, { topic: c.name, who: 'the group', what: c.name, link: `/groups/${social.groupId}?tab=overview` })
  // A word after praying goes to that person when the habit is just one other person's, else to the group.
  const only = c.people.length === 1 && c.people[0].user_id !== social.me ? c.people[0] : null
  const sendWord = async (message: string, groupSees: boolean) => {
    await sendPrayerWord({ group_id: social.groupId, to_user: only?.user_id ?? null, checkin_id: null, topic: c.name, message, group_sees: groupSees })
    social.onSent()
  }

  const parts: [number, string, string][] = [
    [c.good, OUTCOME_STYLES.good.dot, 'good'],
    [c.mid, OUTCOME_STYLES.mid.dot, 'mixed'],
    [c.bad, OUTCOME_STYLES.bad.dot, 'hard'],
    [c.checkedIn, 'bg-sky-400', 'checked in'],
    [c.missed, 'bg-slate-300 dark:bg-slate-600', 'missed'],
  ]
  const total = parts.reduce((n, [v]) => n + v, 0)
  const summary = parts.filter(([v]) => v > 0).map(([v, , label]) => `${v} ${label}`).join(' · ')

  return (
    <li className={`card space-y-2 ${hard ? 'ring-2 ring-amber-400' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-2xl" aria-hidden>{c.icon}</span>
        <h3 className="flex-1 font-semibold">{c.name}</h3>
        <ReactionLabel list={prayers} social={social} general />
        <span className="muted whitespace-nowrap text-sm">{c.people.length} {c.people.length === 1 ? 'person' : 'people'}</span>
      </div>

      {total > 0 ? (
        <>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`Last 7 days: ${summary}`}>
            {parts.map(([v, color, label]) => v > 0 && <div key={label} className={color} style={{ width: `${(v / total) * 100}%` }} />)}
          </div>
          <p className="text-sm">{summary}</p>
        </>
      ) : <p className="muted text-sm">Nothing checked in yet this week.</p>}
      <p className="muted text-xs">{names.join(', ')}</p>

      {hard && (
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
          {c.people.length === 1 ? `A hard week for ${names[0] === 'you' ? 'you' : names[0]} here. Pray into it?` : 'A hard week for the group here. Pray into it together?'}
        </p>
      )}
      <button className="btn-secondary w-full" onClick={() => setPraying(true)}>🙏 Pray for this</button>
      {status && <p className="muted text-sm">{status}</p>}

      {praying && (
        <PrayerPrompt subject={subject} who={c.people.length === 1 ? (names[0] === 'you' ? 'this' : names[0]) : 'the group'}
          details={<><span className="font-semibold">Shared by {names.join(', ')}.</span>{total > 0 && <span className="block">This week: {summary}</span>}</>}
          onPrayed={async () => { await pray.onPrayed(); setStatus('🙏 The group will see you prayed for this.') }}
          onLater={async (at) => { await pray.onLater(at); setStatus(`⏰ We’ll remind you at ${at.toTimeString().slice(0, 5)}.`) }}
          onWord={async (m, g) => { await sendWord(m, g); setStatus(only ? `🙏 ${only.name} got your word.` : '🙏 The group will see you prayed for this, and your word is in the feed.') }}
          wordTo={only ? only.name : 'the group'}
          onClose={() => setPraying(false)} />
      )}
    </li>
  )
}
