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

function eventIdFromUrl(): number | null {
  const path = window.location.pathname || ''
  const mPath = path.match(/^\/event\/(\d+)/i)
  if (mPath) return Number(mPath[1])
  const hash = window.location.hash || ''
  const mHash = hash.match(/^#\/?event\/(\d+)/i)
  if (mHash) return Number(mHash[1])
  return null
}

function pageFromUrl(): Page {
  if (eventIdFromUrl() !== null) return 'event'
  const path = (window.location.pathname || '').toLowerCase()
  const hash = (window.location.hash || '').toLowerCase()
  const loc = path + ' ' + hash
  if (loc.includes('/dashboard') || hash.includes('dashboard')) return 'dashboard'
  if (
    loc.includes('/auth') || loc.includes('/login') || loc.includes('/signin') || loc.includes('/signup') ||
    hash.includes('auth') || hash.includes('signin') || hash.includes('signup')
  ) return 'auth'
  return 'landing'
}

export default function App() {
  const [page, setPage] = useState<Page>(() => pageFromUrl())
  const [user, setUser] = useState<UserAccount | null>(null)
  const [eventId, setEventId] = useState<number | null>(() => eventIdFromUrl())
  // True while we validate a stored session with the server (never trust localStorage for the role)
  const [booting, setBooting] = useState<boolean>(() => !!getToken())

  const go = useCallback((next: Page, targetEventId?: number | null) => {
    const eid = targetEventId !== undefined ? targetEventId : eventId
    if (targetEventId !== undefined) {
      setEventId(targetEventId)
    }
    setPage(next)

    let path = '/'
    if (next === 'dashboard') path = '/dashboard'
    else if (next === 'auth') path = '/auth'
    else if (next === 'event' && eid !== null) path = `/event/${eid}`

    if (window.location.pathname !== path || window.location.hash !== '') {
      history.pushState(null, '', path)
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

  // Listen to browser Back / Forward buttons and location changes
  useEffect(() => {
    const onLocationChange = () => {
      setEventId(eventIdFromUrl())
      setPage(pageFromUrl())
    }
    window.addEventListener('popstate', onLocationChange)
    window.addEventListener('hashchange', onLocationChange)
    return () => {
      window.removeEventListener('popstate', onLocationChange)
      window.removeEventListener('hashchange', onLocationChange)
    }
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
    const m = back?.match(/^(?:#|\/)?event\/(\d+)/)
    if (m) {
      const eid = Number(m[1])
      setEventId(eid)
      setPage('event')
      history.replaceState(null, '', `/event/${eid}`)
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
          try { sessionStorage.setItem(RETURN_KEY, `/event/${eventId}`) } catch { /* noop */ }
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
