import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import ErrorText, { errorMessage } from '../components/ErrorText'
import ShareSelect from '../components/ShareSelect'
import { useAsync } from '../components/useAsync'
import { CheckinReaction, generalPrayersFor, ReactionLabel, reactionsFor, type Social } from '../components/Reactions'
import {
  getOverview, inviteLink, listEncouragements, listMyShares, listReactions, regenerateCode, removeMember, renameGroup, sendEncouragement, setShare,
  type Encouragement, type GroupMember, type GroupOverview, type SharedCheckin, type SharedHabit, type Visibility,
} from '../lib/groups'
import { addDays, daysBetween, habitStreak, supportReason, type CheckinLike } from '../lib/logic'
import { describeAnswer, OUTCOME_STYLES } from '../lib/outcomes'

type Tab = 'members' | 'feed' | 'sharing' | 'invite'
const TABS: Tab[] = ['members', 'feed', 'sharing', 'invite']

export default function GroupDetail() {
  const { id = '' } = useParams()
  const { session } = useData()
  const me = session!.user.id
  const overview = useAsync(() => getOverview(id), [id])
  const feed = useAsync(() => listEncouragements(id), [id])
  const reactions = useAsync(() => listReactions(id), [id])
  // The tab lives in the address (#/groups/…?tab=feed), so notifications can open the feed.
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.find((t) => t === params.get('tab')) ?? 'members'
  const setTab = (t: Tab) => setParams(t === 'members' ? {} : { tab: t }, { replace: true })

  // Coming back to the app (e.g. from a notification): show what's new.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') { overview.reload(); feed.reload(); reactions.reload() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [overview.reload, feed.reload, reactions.reload])

  if (overview.error) return <div className="page"><ErrorText error={overview.error} /><Link to="/groups" className="btn-secondary mt-4">Back</Link></div>
  if (!overview.data) return <div className="page muted">Loading…</div>
  const o = overview.data

  const refresh = () => { overview.reload(); feed.reload(); reactions.reload() }
  const social = makeSocial(o, me, reactions.data ?? [], refresh)

  return (
    <div className="page space-y-4">
      <Link to="/groups" className="btn-ghost -ml-4">‹ Groups</Link>
      <GroupHeader o={o} onRenamed={overview.reload} />

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`min-h-11 rounded-lg text-sm font-semibold capitalize ${tab === t ? 'bg-white shadow dark:bg-slate-950' : 'text-slate-600 dark:text-slate-400'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <ul className="space-y-3">
          {o.members.map((m) => <MemberCard key={m.user_id} o={o} member={m} social={social} />)}
        </ul>
      )}
      {tab === 'feed' && <Feed o={o} items={feed.data ?? []} me={me} onChange={refresh} />}
      {tab === 'sharing' && <MySharing groupId={id} onChange={overview.reload} />}
      {tab === 'invite' && <Invite o={o} me={me} onChange={overview.reload} />}
    </div>
  )
}

function GroupHeader({ o, onRenamed }: { o: GroupOverview; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(o.group.name)
  if (editing) {
    return (
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); await renameGroup(o.group.id, name.trim()); setEditing(false); onRenamed() }}>
        <input aria-label="Group name" className="input" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" disabled={!name.trim()}>Save</button>
      </form>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <h1 className="h1 flex-1">{o.group.name}</h1>
      {o.group.is_admin && <button className="btn-ghost" onClick={() => setEditing(true)} aria-label="Rename group">✏️</button>}
    </div>
  )
}

// ---------- members ---------------------------------------------------------

export function makeSocial(o: GroupOverview, me: string, reactions: Encouragement[], onSent: () => void): Social {
  const nameOf = (uid: string) => (uid === me ? 'You' : o.members.find((m) => m.user_id === uid)?.display_name || 'A former member')
  return { groupId: o.group.id, me, reactions, nameOf, onSent }
}

export function daysSinceCheckin(m: GroupMember): number {
  const since = m.last_checkin_date ?? m.joined_at.slice(0, 10)
  return Math.max(0, daysBetween(since, m.today))
}

/**
 * Could this member use some support, going only by what they share with this group?
 * (The same hidden rule the server uses for its prompts; nobody ever sees a score.)
 */
export function memberSupportReason(o: GroupOverview, m: GroupMember) {
  const habits = o.habits.filter((h) => h.user_id === m.user_id).map((h) => ({ ...h, archived: false }))
  return supportReason(habits, o.checkins.filter((c) => c.user_id === m.user_id), m.today)
}

/** A gentle nudge to the group: after a hard stretch, or when someone has gone quiet. */
export function SupportPrompt({ name, reason }: { name: string; reason: 'hard' | 'quiet' }) {
  if (reason === 'quiet') {
    return (
      <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-50">
        💛 {name} hasn’t checked in much lately. A message, a call or a coffee could make a difference.
      </p>
    )
  }
  return (
    <div className="space-y-1 rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-50">
      <p className="font-semibold">💛 {name} may be going through a harder stretch.</p>
      <p>This could be a good week to:</p>
      <ul className="ml-1 space-y-0.5">
        <li>☕ invite {name} for coffee</li>
        <li>🙏 pray together, not just for {name}</li>
        <li>💬 talk honestly about what might need to change</li>
      </ul>
    </div>
  )
}

function MemberCard({ o, member: m, social }: { o: GroupOverview; member: GroupMember; social: Social }) {
  const isMe = m.user_id === social.me
  const name = m.display_name || 'Someone'
  const quietDays = daysSinceCheckin(m)
  const support = isMe ? null : memberSupportReason(o, m)
  const needsLove = !isMe && (support !== null || quietDays >= 3)
  const habits = o.habits.filter((h) => h.user_id === m.user_id)

  return (
    <li className={`card space-y-3 ${needsLove ? 'ring-2 ring-amber-400' : ''}`}>
      <div className="flex items-center gap-2">
        <Link to={`/groups/${o.group.id}/member/${m.user_id}`} className="flex-1 text-lg font-semibold">
          {m.display_name || 'Someone'} {isMe && <span className="muted">(you)</span>}
          {m.role === 'admin' && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-700">admin</span>}
          <span className="ml-1 text-slate-400" aria-hidden>›</span>
        </Link>
        <ReactionLabel list={generalPrayersFor(social, m.user_id)} social={social} general />
        <span className="text-sm">
          {m.checked_in_today === true ? '✅ Checked in' : m.checked_in_today === false ? '⏳ Not yet' : '· Nothing due'}
        </span>
      </div>

      {support ? <SupportPrompt name={name} reason={support} /> : needsLove && (
        <p className="rounded-lg bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          No check-in for {quietDays} days. Maybe reach out?
        </p>
      )}

      {habits.length > 0 && (
        <ul className="space-y-1">
          {habits.map((h) => (
            <SharedHabitRow key={h.id} habit={h} checkins={o.checkins} today={m.today} social={social} reactAs={isMe ? null : name} />
          ))}
        </ul>
      )}

      <Link to={`/groups/${o.group.id}/member/${m.user_id}`} className="block text-sm font-medium text-amber-700 dark:text-amber-400">
        See {isMe ? 'what the group sees of you' : 'check-ins, tags and notes'} ›
      </Link>

      {!isMe && <EncourageButtons groupId={o.group.id} toUser={m.user_id} onSent={social.onSent} />}
    </li>
  )
}

/**
 * One shared habit on a member card: today's answer, or last night's until today's is in
 * (people often check in late, and friends look the next morning), with 🙏/👏 counts
 * and the kudos / praying button.
 */
export function SharedHabitRow({ habit, checkins, today, social, reactAs }: {
  habit: SharedHabit; checkins: SharedCheckin[]; today: string; social: Social
  reactAs: string | null // the member's name; null on your own card (no kudos for yourself)
}) {
  const mine = checkins.filter((c) => c.habit_id === habit.id)
  const latest = mine.find((c) => c.date === today) ?? mine.find((c) => c.date === addDays(today, -1))
  const showResult = habit.visibility !== 'checkin'
  const streak = showResult
    ? habitStreak({ ...habit, archived: false }, mine.filter((c) => c.outcome).map((c) => c as CheckinLike), today).current
    : null
  const lastNight = latest && latest.date !== today
  const label = latest && <ReactionLabel list={reactionsFor(social, latest.id)} social={social} />
  return (
    <li className="flex min-h-10 items-center gap-2 text-sm">
      <span aria-hidden>{habit.icon}</span>
      <span className="flex-1">{habit.name}</span>
      {latest ? (
        <span className="text-right">
          <AnswerBadge habit={habit} checkin={latest} />
          {(label || lastNight) && (
            <span className="mt-0.5 flex items-center justify-end gap-1.5 text-xs">
              {label}
              {lastNight && <span className="muted">last night</span>}
            </span>
          )}
        </span>
      ) : <span className="muted">not yet</span>}
      {streak !== null && <span className="w-12 text-right font-semibold">🔥{streak}</span>}
      {reactAs && (
        <span className="w-10 text-right">
          {latest && <CheckinReaction checkin={latest} habit={habit} name={reactAs} social={social} />}
        </span>
      )}
    </li>
  )
}

/** A coloured dot + the answer ("Clean", "7/10", "✓ checked in" when the result is private). */
export function AnswerBadge({ habit, checkin }: { habit: SharedHabit; checkin: SharedCheckin }) {
  if (!checkin.outcome) return <span>✓ checked in</span>
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`h-2.5 w-2.5 rounded-full ${OUTCOME_STYLES[checkin.outcome].dot}`} />
      {describeAnswer(habit, checkin)}
    </span>
  )
}

/** Was this check-in first saved on a later day than the day it's about? */
export function caughtUpLater(c: SharedCheckin): boolean {
  if (!c.created_at) return false
  return new Date(c.created_at).toLocaleDateString('en-CA') > c.date
}

/** On a member: pray for them in general, or send them a message. */
export function EncourageButtons({ groupId, toUser, onSent }: { groupId: string; toUser: string; onSent: () => void }) {
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send(kind: 'prayer' | 'message') {
    setError(null)
    try {
      await sendEncouragement({ group_id: groupId, kind, to_user: toUser, message: kind === 'message' ? text : null })
      setStatus(kind === 'prayer' ? '🙏 They’ll know you’re praying.' : 'Sent ✓')
      setText('')
      setWriting(false)
      onSent()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button className="btn-secondary flex-1" onClick={() => send('prayer')}>🙏 Praying for you</button>
        <button className="btn-secondary flex-1" onClick={() => setWriting(!writing)} aria-expanded={writing}>✉️ Message</button>
      </div>
      {writing && (
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`msg-${toUser}`}>Message</label>
          <textarea id={`msg-${toUser}`} className="input" rows={2} maxLength={280} value={text} onChange={(e) => setText(e.target.value)} placeholder="Only you two see this" />
          <div className="flex items-center justify-between">
            <span className="muted">{280 - text.length}</span>
            <button className="btn-primary" disabled={!text.trim()} onClick={() => send('message')}>Send</button>
          </div>
        </div>
      )}
      {status && <p className="muted">{status}</p>}
      <ErrorText error={error} />
    </div>
  )
}

// ---------- feed --------------------------------------------------------------
// Messages and SOS. Check-ins are on each member's page, and kudos and prayers show
// as small 🙏/👏 labels on the check-in they're about, so the messages stay visible.

function Feed({ o, items, me, onChange }: { o: GroupOverview; items: Encouragement[]; me: string; onChange: () => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nameOf = (uid: string | null) => (uid === me ? 'You' : o.members.find((m) => m.user_id === uid)?.display_name || 'A former member')

  async function post() {
    setError(null)
    try {
      await sendEncouragement({ group_id: o.group.id, kind: 'message', message: text })
      setText('')
      onChange()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <label htmlFor="post" className="label">Message the group</label>
        <textarea id="post" className="input" rows={2} maxLength={280} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="An update, a prayer request, a verse, a word of hope…" />
        <div className="flex items-center justify-between">
          <span className="muted">{280 - text.length}</span>
          <button className="btn-primary" disabled={!text.trim()} onClick={post}>Post</button>
        </div>
        <ErrorText error={error} />
      </div>

      {items.length === 0 && <p className="muted text-center">Nothing here yet.</p>}
      <ul className="space-y-2">
        {items.map((e) => (
          <li key={e.id} className={`card text-sm ${e.kind === 'sos' ? 'ring-2 ring-rose-400' : ''}`}>
            <div>
              <span aria-hidden>{e.kind === 'sos' ? '🆘' : '✉️'}</span> <strong>{nameOf(e.from_user)}</strong>{' '}
              {e.kind === 'sos' ? 'asked for prayer and support' : e.to_user ? `→ ${e.to_user === me ? 'you' : nameOf(e.to_user)}` : ''}
            </div>
            {e.message && <p className="mt-1 whitespace-pre-wrap">{e.message}</p>}
            <time className="muted mt-1 block">{new Date(e.created_at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</time>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- what I share with this group --------------------------------------

function MySharing({ groupId, onChange }: { groupId: string; onChange: () => void }) {
  const { activeHabits } = useData()
  const shares = useAsync(listMyShares, [])
  const [error, setError] = useState<string | null>(null)
  const current = (habitId: string): Visibility =>
    shares.data?.find((s) => s.habit_id === habitId && s.group_id === groupId)?.visibility ?? 'private'

  async function change(habitId: string, v: Visibility) {
    setError(null)
    try {
      await setShare(habitId, groupId, v)
      await shares.reload()
      onChange()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="space-y-3">
      <p className="muted">Choose what this group sees for each habit. New habits start as “Result + notes”; pick “Private” to keep one to yourself. Your group always sees whether you’ve done your daily check-in.</p>
      <ErrorText error={error} />
      {activeHabits.map((h) => (
        <div key={h.id} className="card">
          <label htmlFor={`share-${h.id}`} className="mb-2 flex items-center gap-2 font-semibold"><span aria-hidden>{h.icon}</span>{h.name}</label>
          <ShareSelect id={`share-${h.id}`} value={current(h.id)} disabled={!shares.data} onChange={(v) => change(h.id, v)} />
        </div>
      ))}
    </div>
  )
}

// ---------- invite / admin ------------------------------------------------------

function Invite({ o, me, onChange }: { o: GroupOverview; me: string; onChange: () => void }) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const link = inviteLink(o.group.invite_code)

  async function share() {
    const text = `Join my group "${o.group.name}" on Steadfast. Code: ${o.group.invite_code}`
    try {
      if (navigator.share) await navigator.share({ title: 'Steadfast', text, url: link })
      else {
        await navigator.clipboard.writeText(`${text}\n${link}`)
        setCopied(true)
      }
    } catch {
      /* user cancelled */
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 text-center">
        <p className="muted">Invite code</p>
        <p className="font-mono text-3xl font-bold tracking-[0.3em]">{o.group.invite_code}</p>
        <button className="btn-primary w-full" onClick={share}>{copied ? 'Copied ✓' : 'Share invite link'}</button>
        {o.group.is_admin && (
          <button className="btn-ghost w-full" onClick={() => act(async () => { await regenerateCode(o.group.id); onChange() })}>
            Make a new code (old one stops working)
          </button>
        )}
      </div>

      {o.group.is_admin && (
        <div className="card space-y-2">
          <h2 className="h2">Members</h2>
          {o.members.filter((m) => m.user_id !== me).map((m) => (
            <div key={m.user_id} className="flex items-center justify-between">
              <span>{m.display_name || 'Someone'}</span>
              <button className="btn-ghost text-rose-600" onClick={() => confirm(`Remove ${m.display_name} from the group?`) && act(async () => { await removeMember(o.group.id, m.user_id); onChange() })}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <button className="btn-ghost w-full text-rose-600"
        onClick={() => confirm('Leave this group? Your habits will stop being shared with it.') && act(async () => { await removeMember(o.group.id, me); navigate('/groups') })}>
        Leave group
      </button>
      <ErrorText error={error} />
    </div>
  )
}
