import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Calendar, ShoppingBag, Award, Target, Megaphone, Users, QrCode, BarChart3,
  ShieldCheck, PieChart, Menu, X, LogOut, Home, ChevronRight, Settings, CheckCircle2, Wifi, WifiOff,
  Sparkles,
} from 'lucide-react'
import type { UserAccount, UserRole } from './authService'
import { updateProfile, changePassword } from './authService'
import { api, errorMessage } from './apiClient'
import { useLiveRefresh, useRealtimeStatus } from './useRealtimeUpdates'
import OverviewPanel from './components/OverviewPanel'
import EventsPanel from './panels/EventsPanel'
import ShopPanel from './panels/ShopPanel'
import MembershipPanel from './panels/MembershipPanel'
import FundraisersPanel from './panels/FundraisersPanel'
import AnnouncementsPanel from './panels/AnnouncementsPanel'
import MembersPanel from './panels/MembersPanel'
import CheckInPanel from './panels/CheckInPanel'
import FinancePanel from './panels/FinancePanel'
import AdminPanel from './panels/AdminPanel'
import MemberPortalPanel from './panels/MemberPortalPanel'
import ReportsPanel from './panels/ReportsPanel'
import NotificationBell from './components/NotificationBell'

interface DashboardProps {
  user: UserAccount
  onLogout: () => void
  onNavigateHome: () => void
  onUserChange: (u: UserAccount) => void
}

type TabKey = 'overview' | 'events' | 'shop' | 'membership' | 'fundraisers' | 'announcements' | 'members' | 'checkin' | 'finance' | 'admin' | 'member_portal' | 'reports'
interface NavTab { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }

// The server decides the role; this only chooses which tabs to render. Every endpoint re-checks on the server.
function getTabsForRole(role: UserRole): NavTab[] {
  const overview: NavTab = { key: 'overview', label: 'Dashboard', icon: LayoutDashboard }
  const memberPortal: NavTab = { key: 'member_portal', label: 'Member Portal', icon: Sparkles }
  const events: NavTab = { key: 'events', label: 'Events', icon: Calendar }
  const shop: NavTab = { key: 'shop', label: 'Shop', icon: ShoppingBag }
  const membership: NavTab = { key: 'membership', label: 'Membership', icon: Award }
  const reports: NavTab = { key: 'reports', label: 'Reports', icon: PieChart }
  const news: NavTab = { key: 'announcements', label: 'Announcements', icon: Megaphone }
  switch (role) {
    case 'Guest': return [overview, events, shop, membership, news]
    case 'Member': return [overview, memberPortal, events, shop, membership, news]
    case 'Officer':
      return [overview, memberPortal, events, shop, { key: 'fundraisers', label: 'Fundraisers', icon: Target }, news,
        { key: 'members', label: 'Members', icon: Users }, { key: 'checkin', label: 'Check-In', icon: QrCode },
        { key: 'finance', label: 'Finance', icon: BarChart3 }, reports]
    case 'Treasurer':
      return [overview, { key: 'finance', label: 'Finance & Treasury', icon: BarChart3 }, reports, events]
    case 'Admin':
      return [overview, { key: 'admin', label: 'Admin', icon: ShieldCheck }, { key: 'members', label: 'Members', icon: Users },
        events, shop, { key: 'checkin', label: 'Check-In', icon: QrCode },
        { key: 'fundraisers', label: 'Fundraisers', icon: Target }, news, { key: 'finance', label: 'Finance', icon: BarChart3 }, reports]
    default: return [overview, events]
  }
}


export default function RoleDashboard({ user, onLogout, onNavigateHome, onUserChange }: DashboardProps) {
  const role: UserRole = user.role
  const tabs = useMemo(() => getTabsForRole(role), [role])
  const isStaff = role === 'Admin' || role === 'Officer' || role === 'Treasurer'
  const isLive = useRealtimeStatus()

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    try {
      const saved = localStorage.getItem('skyline_active_dashboard_tab') as TabKey
      if (saved && getTabsForRole(role).some(t => t.key === saved)) return saved
    } catch { /* storage unavailable */ }
    return 'overview'
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  useEffect(() => {
    try { localStorage.setItem('skyline_active_dashboard_tab', activeTab) } catch { /* noop */ }
  }, [activeTab])
  // hard RBAC guard on the client too
  useEffect(() => {
    if (!tabs.some(t => t.key === activeTab)) setActiveTab('overview')
  }, [tabs, activeTab])

  const go = (k: TabKey) => { setActiveTab(k); setMobileOpen(false) }
  const memberId = user.memberId
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const current = tabs.find(t => t.key === activeTab)

  return (
    <div className="dash-root h-screen w-screen bg-white text-neutral-900 flex antialiased overflow-hidden"
      style={{ fontFamily: 'var(--font-display, "TT Firs Neue", sans-serif)' }}>
      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/40 z-40 md:hidden" />}

      {/* Sidebar: styled in Odoo Purple (#714B67) to match landing page */}
      <aside className={`fixed md:relative inset-y-0 left-0 w-60 bg-[#714B67] border-r border-[#5d3b54] text-white flex flex-col justify-between z-50 shrink-0 transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex flex-col flex-1 overflow-y-auto">
          <div className="px-6 h-16 flex items-center justify-center relative border-b border-white/15 shrink-0">
            <button onClick={onNavigateHome} className="bg-transparent border-none cursor-pointer p-0" aria-label="Skyline home">
              <img src="/logo.png" alt="Skyline" className="h-8 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
            </button>
            <button onClick={() => setMobileOpen(false)} className="md:hidden absolute right-4 bg-transparent border-none text-white/80 cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
          <nav className="px-3 py-4 space-y-1">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">Workspace</p>
            {tabs.map(t => {
              const Icon = t.icon
              const active = activeTab === t.key
              return (
                <button key={t.key} onClick={() => go(t.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] border-none cursor-pointer text-left transition-all ${active ? 'bg-white text-[#714B67] font-bold shadow-md' : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white font-medium'}`}>
                  <Icon className={`w-4 h-4 ${active ? 'text-[#714B67]' : 'text-white/70'}`} />
                  <span>{t.label}</span>
                  {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-[#714B67]" />}
                </button>
              )
            })}
          </nav>
        </div>
        <div className="p-3 border-t border-white/15 shrink-0 space-y-1.5">
          <button onClick={() => setSettingsOpen(true)} className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 cursor-pointer text-left transition-colors">
            <span className="w-9 h-9 rounded-full bg-white text-[#714B67] flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-white truncate">{user.name}</span>
              <span className="block text-[11px] text-white/70 capitalize">{role}</span>
            </span>
            <Settings className="w-3.5 h-3.5 text-white/70" />
          </button>
          <div className="flex gap-1.5 pt-1">
            <button onClick={onNavigateHome} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white bg-transparent border-none cursor-pointer transition-colors"><Home className="w-3.5 h-3.5" />Home</button>
            <button onClick={onLogout} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-rose-200 hover:bg-rose-500/20 bg-transparent border-none cursor-pointer transition-colors"><LogOut className="w-3.5 h-3.5" />Sign out</button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <header className="shrink-0 h-16 bg-white border-b border-neutral-200 px-4 sm:px-8 flex items-center justify-between gap-4 relative z-40">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMobileOpen(true)} className="md:hidden bg-transparent border-none text-neutral-600 cursor-pointer"><Menu className="w-5 h-5" /></button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold leading-tight truncate">{current?.label ?? 'Dashboard'}</h1>
              <p className="text-[11px] text-neutral-500 hidden sm:block">Skyline Student Association {isStaff ? 'Command Center' : 'Portal'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {role === 'Guest' && (
              <button
                onClick={() => go('membership')}
                className="px-3 py-1 rounded-full bg-[#714B67]/15 hover:bg-[#714B67]/25 text-[#714B67] text-xs font-bold border border-[#714B67]/30 cursor-pointer flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#714B67]" />
                <span className="hidden md:inline">Activate Membership</span>
                <span className="md:hidden">Upgrade</span>
              </button>
            )}
            <span title={isLive ? 'Connected: changes appear instantly' : 'Reconnecting to the live server…'}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${isLive ? 'border-emerald-200 text-emerald-700' : 'border-amber-300 text-amber-700 animate-pulse'}`}>
              {isLive ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="hidden sm:inline">{isLive ? 'Live Sync' : 'Reconnecting...'}</span>
            </span>
            <NotificationBell onOpenLink={() => go('announcements')} />
            <button onClick={() => setSettingsOpen(true)} className="flex items-center gap-2 bg-transparent border-none cursor-pointer pl-1" aria-label="Account settings">
              <span className="w-8 h-8 rounded-full bg-[#714B67] text-white flex items-center justify-center text-xs font-semibold">{initials}</span>
              <span className="text-xs font-medium hidden sm:inline">{user.name.split(' ')[0]}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-8">
            {activeTab === 'overview' && (
              <OverviewPanel
                onExplore={() => go(tabs.find(t => t.key === 'events') ? 'events' : tabs[1]?.key ?? 'overview')}
                exploreLabel={isStaff ? 'Explore club activities' : 'Browse events'}
              />
            )}
            {activeTab === 'member_portal' && (
              <MemberPortalPanel
                user={user}
                onGoToEvents={() => go('events')}
                onGoToShop={() => go('shop')}
              />
            )}
            {activeTab === 'events' && (
              <EventsPanel
                memberId={memberId}
                memberName={user.name}
                memberEmail={user.email}
                isMember={role !== 'Guest'}
                isOfficer={role === 'Officer' || role === 'Admin'}
                user={user}
              />
            )}
            {activeTab === 'shop' && <ShopPanel memberId={memberId} memberName={user.name} memberEmail={user.email} isMember={user.isActive} isOfficer={role === 'Officer' || role === 'Admin'} />}
            {activeTab === 'membership' && (
              <MembershipPanel
                memberId={memberId}
                user={user}
                onUserChange={onUserChange}
                duesDiscount={0}
              />
            )}
            {activeTab === 'fundraisers' && <FundraisersPanel memberId={memberId} isOfficer={isStaff} />}
            {activeTab === 'announcements' && <AnnouncementsPanel isOfficer={role === 'Officer' || role === 'Admin'} />}
            {activeTab === 'members' && <MembersPanel isAdmin={role === 'Admin'} />}
            {activeTab === 'checkin' && <CheckInPanel memberId={memberId} />}
            {activeTab === 'finance' && <FinancePanel isTreasurer={role === 'Treasurer' || role === 'Admin'} isOfficer={isStaff} memberId={memberId} selfMemberId={memberId} />}
            {activeTab === 'admin' && role === 'Admin' && <AdminPanel />}
            {activeTab === 'reports' && isStaff && <ReportsPanel />}
          </div>
        </main>
      </div>

      {settingsOpen && <SettingsModal user={user} role={role} tabs={tabs} onClose={() => setSettingsOpen(false)} onLogout={onLogout} onUserChange={onUserChange} />}
    </div>
  )
}

function SettingsModal({ user, role, tabs, onClose, onLogout, onUserChange }: {
  user: UserAccount; role: UserRole; tabs: NavTab[]; onClose: () => void; onLogout: () => void; onUserChange: (u: UserAccount) => void
}) {
  const [tab, setTab] = useState<'profile' | 'access' | 'security'>('profile')
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await updateProfile(user.memberId, { name: name.trim(), phone: phone.trim() })
      onUserChange({ ...user, name: name.trim(), phone: phone.trim() || null })
      setMsg({ ok: true, text: 'Profile changes saved successfully.' })
    } catch (err) { setMsg({ ok: false, text: errorMessage(err) }) } finally { setBusy(false) }
  }
  const savePw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw.length < 8) {
      setMsg({ ok: false, text: 'New password must be at least 8 characters long.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await changePassword(curPw.trim() || undefined, newPw)
      setCurPw(''); setNewPw('')
      setMsg({ ok: true, text: 'Password successfully updated.' })
    } catch (err) { setMsg({ ok: false, text: errorMessage(err) }) } finally { setBusy(false) }
  }
  const input = 'w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 bg-white text-sm text-neutral-900 focus:outline-none focus:border-[#714B67] transition-all shadow-sm'

  return (
    <div className="fixed inset-0 z-[70] bg-white overflow-y-auto animate-fadeIn">
      <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 sm:px-12 h-16 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 rounded-xl bg-transparent hover:bg-neutral-100 border-none cursor-pointer transition-colors" aria-label="Close"><X className="w-5 h-5 text-neutral-700" /></button>
          <h2 className="text-base font-bold text-neutral-900">Account settings</h2>
        </div>
        <button onClick={onClose} className="px-5 py-2 rounded-xl bg-[#714B67] hover:bg-[#5d3b54] text-white text-xs font-bold border-none cursor-pointer transition-all shadow-md">Done</button>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div className="flex items-center gap-5 pb-8 border-b border-neutral-200">
          <span className="w-16 h-16 rounded-2xl bg-[#714B67] text-white flex items-center justify-center text-xl font-bold shadow-md">{user.name[0]}</span>
          <div>
            <p className="text-xl font-bold text-neutral-900">{user.name}</p>
            <p className="text-sm text-neutral-500">{user.email} · Member #{user.memberId}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-block px-3 py-1 rounded-full bg-[#714B67]/10 text-[#714B67] text-[11px] font-bold uppercase tracking-wider">{role}</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Google Calendar Synced
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-6 border-b border-neutral-200">
          {([['profile', 'Profile'], ['access', 'Roles & permissions'], ['security', 'Security']] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); setMsg(null) }}
              className={`pb-3 text-sm font-bold bg-transparent border-0 border-b-2 cursor-pointer transition-all ${tab === k ? 'border-[#714B67] text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-700'}`}>{l}</button>
          ))}
        </div>
        {msg && (
          <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-semibold ${msg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'}`}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <X className="w-4 h-4 text-rose-600" />}
            {msg.text}
          </div>
        )}

        {tab === 'profile' && (
          <form onSubmit={saveProfile} className="space-y-4 max-w-md">
            <label className="block text-xs font-bold text-neutral-700">Full name
              <input className={input + ' mt-1.5 font-normal'} value={name} onChange={e => setName(e.target.value)} required />
            </label>
            <label className="block text-xs font-bold text-neutral-700">Phone number
              <input className={input + ' mt-1.5 font-normal'} placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} maxLength={20} />
            </label>
            <label className="block text-xs font-bold text-neutral-700">Email address
              <input className={input + ' mt-1.5 font-normal bg-neutral-100 text-neutral-500 cursor-not-allowed'} value={user.email} disabled />
            </label>
            {user.studentId && (
              <label className="block text-xs font-bold text-neutral-700">Student ID / Enrollment
                <input className={input + ' mt-1.5 font-normal bg-neutral-100 text-neutral-500 cursor-not-allowed'} value={user.studentId} disabled />
              </label>
            )}
            <div className="pt-2">
              <button disabled={busy} className="px-6 py-2.5 rounded-xl bg-[#714B67] hover:bg-[#5d3b54] text-white text-xs font-bold border-none cursor-pointer disabled:opacity-50 transition-all shadow-md">
                {busy ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
        {tab === 'access' && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">Your access level is enforced on the server for every API request.</p>
            {user.roles.length > 0 && <p className="text-xs font-semibold text-[#714B67]">Assigned Positions: {user.roles.join(', ')}</p>}
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 pt-2">
              {tabs.map(t => (
                <li key={t.key} className="flex items-center gap-2.5 text-sm py-2 border-b border-neutral-100 text-neutral-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">{t.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tab === 'security' && (
          <div className="space-y-6 max-w-md">
            <form onSubmit={savePw} className="space-y-4">
              <label className="block text-xs font-bold text-neutral-700">Current password
                <input type="password" placeholder="Leave blank if signed in via Google / OTP" className={input + ' mt-1.5 font-normal'} value={curPw} onChange={e => setCurPw(e.target.value)} autoComplete="current-password" />
              </label>
              <label className="block text-xs font-bold text-neutral-700">New password (min 8)
                <input type="password" minLength={8} required placeholder="Enter minimum 8 characters" className={input + ' mt-1.5 font-normal'} value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" />
              </label>
              <div className="pt-2">
                <button disabled={busy} className="px-6 py-2.5 rounded-xl bg-[#714B67] hover:bg-[#5d3b54] text-white text-xs font-bold border-none cursor-pointer disabled:opacity-50 transition-all shadow-md">
                  {busy ? 'Updating...' : 'Update password'}
                </button>
              </div>
            </form>
            <div className="pt-4 border-t border-neutral-200">
              <button onClick={() => { onClose(); onLogout() }} className="px-5 py-2.5 rounded-xl border border-rose-300 text-rose-700 text-xs font-bold bg-white cursor-pointer hover:bg-rose-50 transition-colors">
                Sign out of all sessions
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
