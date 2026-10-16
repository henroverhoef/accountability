import { Link } from 'react-router-dom'
import ErrorText from '../components/ErrorText'
import { useAsync } from '../components/useAsync'
import { useState } from 'react'
import { adminDeleteAccount, getAdminOverview, type AdminUser } from '../lib/admin'
import { errorMessage } from '../components/ErrorText'
import { daysBetween } from '../lib/logic'
import { formatDate } from '../lib/outcomes'
import { useData } from '../data/DataProvider'

/** App owner only: everyone and every group in the app, without anyone's answers or notes. */
export default function Admin() {
  const { today } = useData()
  const overview = useAsync(getAdminOverview, [])

  if (overview.error) return <div className="page space-y-4"><Link to="/settings" className="btn-ghost -ml-4">‹ Settings</Link><ErrorText error={overview.error} /></div>
  if (!overview.data) return <div className="page muted">Loading…</div>
  const { totals, groups, users } = overview.data
  const loners = users.filter((u) => u.groups === 0)

  const lastSeen = (d: string | null) => {
    if (!d) return 'never checked in'
    const n = daysBetween(d, today)
    return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`
  }

  return (
    <div className="page space-y-4">
      <div className="flex items-center">
        <Link to="/settings" className="btn-ghost -ml-4 flex-1 justify-start">‹ Settings</Link>
        <button className="btn-ghost" onClick={overview.reload} disabled={overview.loading}>{overview.loading ? '…' : '↻ Refresh'}</button>
      </div>
      <h1 className="h1">App overview</h1>
      <p className="muted text-sm">Only you can see this. It shows who uses the app and which groups exist. Nobody's habits, answers or notes are included.</p>
      <p className="muted text-sm">Accounts nobody has used for 30 days are removed automatically each night (people with notifications on get a warning a week before), and so are groups nobody in them has used for 30 days. Yours is never removed automatically.</p>

      <section className="grid grid-cols-3 gap-2 text-center">
        <Stat label="People" value={totals.users} />
        <Stat label="Groups" value={totals.groups} />
        <Stat label="Active (7 days)" value={totals.active_users_7d} />
        <Stat label="Habits" value={totals.habits} />
        <Stat label="Check-ins (7 days)" value={totals.checkins_7d} />
        <Stat label="Notifications on" value={totals.push_users} />
      </section>

      <h2 className="h2 pt-2">Groups ({groups.length})</h2>
      {groups.map((g) => (
        <section key={g.id} className="card space-y-2">
          <div className="flex items-baseline gap-2">
            <h3 className="flex-1 text-lg font-semibold">{g.name}</h3>
            <span className="muted text-sm">{g.members.length} member{g.members.length === 1 ? '' : 's'}</span>
          </div>
          <p className="muted text-sm">
            Started {formatDate(g.created_at.slice(0, 10), { day: 'numeric', month: 'short' })}{g.creator ? ` by ${g.creator}` : ''} · {g.checkins_7d} check-ins this week
          </p>
          <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
            {g.members.map((m) => (
              <li key={m.user_id} className="flex gap-2 py-1.5">
                <span className="flex-1">{m.name || 'Someone'}{m.role === 'admin' && <span className="muted"> · admin</span>}</span>
                <span className="muted">{lastSeen(m.last_checkin)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {loners.length > 0 && (
        <>
          <h2 className="h2 pt-2">Not in a group ({loners.length})</h2>
          <section className="card"><UserList users={loners} lastSeen={lastSeen} onRemoved={overview.reload} /></section>
        </>
      )}

      <h2 className="h2 pt-2">Everyone ({users.length})</h2>
      <section className="card"><UserList users={users} lastSeen={lastSeen} onRemoved={overview.reload} /></section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-2 py-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="muted text-xs">{label}</div>
    </div>
  )
}

function UserList({ users, lastSeen, onRemoved }: { users: AdminUser[]; lastSeen: (d: string | null) => string; onRemoved: () => void }) {
  return (
    <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
      {users.map((u) => <UserRow key={u.user_id} u={u} lastSeen={lastSeen} onRemoved={onRemoved} />)}
    </ul>
  )
}

function UserRow({ u, lastSeen, onRemoved }: { u: AdminUser; lastSeen: (d: string | null) => string; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false)
  const activeDays = u.last_active ? Math.floor((Date.now() - Date.parse(u.last_active)) / 86400000) : null

  async function remove() {
    if (!confirm(`Remove ${u.name || 'this account'}? This permanently deletes the account with all their habits, check-ins and messages. It can't be undone.`)) return
    setBusy(true)
    try {
      await adminDeleteAccount(u.user_id)
      onRemoved()
    } catch (e) {
      alert(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <li className="space-y-0.5 py-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 font-medium">{u.name || 'No name yet'}{u.is_admin && <span className="muted font-normal"> · you</span>}</span>
        <span className="muted">{lastSeen(u.last_checkin)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="muted flex-1 text-xs">
          Joined {formatDate(u.created_at.slice(0, 10), { day: 'numeric', month: 'short' })} · {u.groups} group{u.groups === 1 ? '' : 's'} · {u.habits} habit{u.habits === 1 ? '' : 's'}
          {u.notifications ? ' · 🔔' : ' · 🔕'}{u.login_code ? ' · 🔑' : ''}
          {activeDays !== null && <> · active {activeDays === 0 ? 'today' : activeDays === 1 ? 'yesterday' : `${activeDays} days ago`}</>}
        </span>
        {!u.is_admin && (
          <button className="text-xs font-medium text-rose-600 disabled:opacity-50" disabled={busy} onClick={remove}>{busy ? 'Removing…' : 'Remove'}</button>
        )}
      </div>
    </li>
  )
}
