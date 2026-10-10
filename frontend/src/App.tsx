import { useState, useEffect, useCallback } from 'react'
import LandingPage from './components/LandingPage'
import AuthPage from './AuthPage'
import RoleDashboard from './RoleDashboard'
import EventPage from './components/EventPage'
import { RealtimeProvider } from './useRealtimeUpdates'
import { getToken, setToken, setUnauthorizedHandler } from './apiClient'
import { fetchCurrentUser, logoutUser, type UserAccount } from './authService'

type Page = 'landing' | 'auth' | 'dashboard' | 'event'

const RETURN_KEY = 'skyline_return_to'

function eventIdFromHash(): number | null {
  const m = window.location.hash.match(/^#event\/(\d+)/i)
  return m ? Number(m[1]) : null
}

function pageFromHash(): Page | null {
  if (eventIdFromHash() !== null) return 'event'
  const hash = window.location.hash.toLowerCase()
  if (hash.includes('dashboard')) return 'dashboard'
  if (hash.includes('auth') || hash.includes('signin') || hash.includes('signup')) return 'auth'
  return null
}

export default function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash() ?? 'landing')
  const [user, setUser] = useState<UserAccount | null>(null)
  const [eventId, setEventId] = useState<number | null>(() => eventIdFromHash())
  // True while we validate a stored session with the server (never trust localStorage for the role)
  const [booting, setBooting] = useState<boolean>(() => !!getToken())

  const go = useCallback((next: Page) => {
    setPage(next)
    const hash = next === 'dashboard' ? '#dashboard' : next === 'auth' ? '#auth' : next === 'event' && eventId !== null ? `#event/${eventId}` : ''
    if (window.location.hash !== hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search + hash)
    }
    window.scrollTo({ top: 0 })
  }, [eventId])

  // Restore the session from the server
  useEffect(() => {
    if (!getToken()) { setBooting(false); return }
    let cancelled = false
    fetchCurrentUser().then(u => {
      if (cancelled) return
      if (u) setUser(u)
      else setToken(null)
      setBooting(false)
    })
    return () => { cancelled = true }
  }, [])

  // Expired/invalid token on any API call -> back to sign-in
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
      setUser(null)
      go('auth')
    })
    return () => setUnauthorizedHandler(null)
  }, [go])

  useEffect(() => {
    const onHash = () => { setEventId(eventIdFromHash()); const p = pageFromHash(); if (p) setPage(p); else if (!window.location.hash) setPage('landing') }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Route guard: the dashboard requires a verified session
  useEffect(() => {
    if (booting) return
    if (page === 'dashboard' && !user) go('auth')
  }, [page, user, booting, go])

  const handleLoginSuccess = (u: UserAccount) => {
    setUser(u)
    let back: string | null = null
    try { back = sessionStorage.getItem(RETURN_KEY); sessionStorage.removeItem(RETURN_KEY) } catch { /* noop */ }
    const m = back?.match(/^#event\/(\d+)/)
    if (m) {
      setEventId(Number(m[1]))
      setPage('event')
      history.replaceState(null, '', window.location.pathname + back)
    } else {
      go('dashboard')
    }
  }

  const handleLogout = async () => {
    await logoutUser()
    setUser(null)
    go('landing')
  }

  if (booting) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#714B67]">
        <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      </div>
    )
  }

  if (page === 'dashboard' && user) {
    return (
      <RealtimeProvider>
        <RoleDashboard
          user={user}
          onLogout={handleLogout}
          onNavigateHome={() => go('landing')}
          onUserChange={setUser}
        />
      </RealtimeProvider>
    )
  }

  if (page === 'event' && eventId !== null) {
    return (
      <EventPage
        eventId={eventId}
        user={user}
        onSignIn={() => {
          try { sessionStorage.setItem(RETURN_KEY, `#event/${eventId}`) } catch { /* noop */ }
          go('auth')
        }}
        onOpenTickets={() => go(user ? 'dashboard' : 'auth')}
        onHome={() => go('landing')}
      />
    )
  }

  if (page === 'auth') {
    return <AuthPage onLoginSuccess={handleLoginSuccess} onBackToLanding={() => go('landing')} />
  }

  return (
    <LandingPage
      onOpenAuth={() => go('auth')}
      currentUser={user ? { name: user.name, role: user.role } : null}
      onOpenDashboard={() => go(user ? 'dashboard' : 'auth')}
    />
  )
}
