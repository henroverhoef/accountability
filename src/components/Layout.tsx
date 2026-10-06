import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/checkin', label: 'Check in', icon: '✔️' },
  { to: '/habits', label: 'Habits', icon: '📈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Layout() {
  return (
    <div className="min-h-dvh">
      <main>
        <Outlet />
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex max-w-md">
          {tabs.map((t) => (
            <li key={t.to} className="flex-1">
              <NavLink
                to={t.to}
                end={t.to === '/'}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center text-xs font-medium ${
                    isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
                  }`
                }
              >
                <span aria-hidden className="text-xl leading-none">{t.icon}</span>
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
