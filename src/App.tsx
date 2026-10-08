import { useRef, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DataProvider, useData } from './data/DataProvider'
import { isConfigured } from './lib/supabase'
import Layout from './components/Layout'
import Welcome from './pages/Welcome'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import CheckIn from './pages/CheckIn'
import Habits from './pages/Habits'
import HabitDetail from './pages/HabitDetail'
import HabitEdit from './pages/HabitEdit'
import Settings from './pages/Settings'
import Groups from './pages/Groups'
import GroupDetail from './pages/GroupDetail'
import MemberDetail from './pages/MemberDetail'
import Join from './pages/Join'
import Sos from './pages/Sos'
import Summary from './pages/Summary'
import PinLock from './components/PinLock'

export default function App() {
  if (!isConfigured) return <NotConfigured />
  return (
    <DataProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </DataProvider>
  )
}

function Gate() {
  const { authReady, session, profile, error, reload } = useData()
  // Keep the welcome screen up (without flicker) while it creates the account and joins
  // the group, until the profile with the new name has loaded.
  const [welcomeBusy, setWelcomeBusy] = useState(false)
  const startedSignedOut = useRef(false)
  if (authReady && !session) startedSignedOut.current = true

  if (!authReady) return <Splash />
  const showWelcome = !session || welcomeBusy || (profile ? !profile.display_name : startedSignedOut.current)
  if (showWelcome) return <Welcome onBusy={setWelcomeBusy} />
  if (!profile) {
    return error ? (
      <div className="page text-center">
        <p className="mb-4">Couldn’t load your data: {error}</p>
        <button className="btn-primary" onClick={reload}>Try again</button>
      </div>
    ) : (
      <Splash />
    )
  }
  if (!profile.onboarded) return <Onboarding />

  return (
    <PinLock>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/habits/new" element={<HabitEdit />} />
          <Route path="/habits/:id" element={<HabitDetail />} />
          <Route path="/habits/:id/edit" element={<HabitEdit />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:id" element={<GroupDetail />} />
          <Route path="/groups/:id/member/:userId" element={<MemberDetail />} />
          <Route path="/join/:code" element={<Join />} />
          <Route path="/sos" element={<Sos />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </PinLock>
  )
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="h-20 w-20 animate-pulse rounded-3xl" />
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="page">
      <h1 className="h1 mb-2">Almost there</h1>
      <p className="muted">
        The app isn’t connected to Supabase yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see the README).
      </p>
    </div>
  )
}
