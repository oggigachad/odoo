import { useState, useEffect, useCallback } from 'react'
import { money, digits } from '../numeric'
import { Check, Search, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../apiClient'
import { useLiveRefresh } from '../useRealtimeUpdates'

interface UserRow {
  member_id: number
  full_name: string
  email: string
  phone: string | null
  student_id: string | null
  joined_on: string
  positions: string[]
  access_level: string
  member_until: string | null
  is_member: boolean
  tickets: number
  orders: number
  paid_total: number
}
interface Leadership { leadership_role_id: number; member_id: number; position: string; term_year: number }
interface Semester { semester_id: number; name: string; starts_on: string; ends_on: string }
interface Tier { membership_type_id: number; name: string; dues_amount: string; is_offered: boolean }

const FONT = { fontFamily: '"TT Firs Neue", sans-serif' }
const input = 'px-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs focus:outline-none focus:border-[#714B67]'
const btn = 'px-4 py-2 rounded-lg bg-[#714B67] text-white text-xs font-semibold border-none cursor-pointer disabled:opacity-40'

export default function AdminPanel() {
  const [tab, setTab] = useState<'people' | 'semesters' | 'tiers'>('people')
  const [users, setUsers] = useState<UserRow[]>([])
  const [positions, setPositions] = useState<string[]>([])
  const [leadership, setLeadership] = useState<Leadership[]>([])
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [pick, setPick] = useState<Record<number, string>>({})
  const [semForm, setSemForm] = useState({ name: '', starts_on: '', ends_on: '' })
  const [tierForm, setTierForm] = useState({ name: '', dues_amount: '' })

  const year = new Date().getFullYear()
  const flash = (m: string) => { setOk(m); setTimeout(() => setOk(null), 3500) }

  const load = useCallback(async () => {
    try {
      const [u, l, s, t] = await Promise.all([
        api<{ items: UserRow[]; assignable_positions: string[] }>(`/admin/users?q=${encodeURIComponent(search.trim())}`),
        api<Leadership[]>(`/leadership?term_year=${year}`),
        api<Semester[]>('/semesters'),
        api<Tier[]>('/membership-types?all_types=true'),
      ])
      setUsers(u.items); setPositions(u.assignable_positions); setLeadership(l); setSemesters(s); setTiers(t)
      setError(null)
    } catch (e) { setError(errorMessage(e, 'Could not load admin data.')) } finally { setLoading(false) }
  }, [search, year])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useLiveRefresh(['members'], load)

  const assign = async (memberId: number) => {
    const position = pick[memberId]
    if (!position) return
    try {
      await api('/leadership', { method: 'POST', body: JSON.stringify({ member_id: memberId, position, term_year: year }) })
      flash(`${position} assigned.`)
      setPick(p => ({ ...p, [memberId]: '' }))
      load()
    } catch (e) { setError(errorMessage(e)) }
  }
  const remove = async (roleId: number) => {
    try { await api(`/leadership/${roleId}`, { method: 'DELETE' }); flash('Role removed.'); load() } catch (e) { setError(errorMessage(e)) }
  }
  const addSemester = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await api('/semesters', { method: 'POST', body: JSON.stringify(semForm) }); flash('Semester created.'); setSemForm({ name: '', starts_on: '', ends_on: '' }); load() } catch (er) { setError(errorMessage(er)) }
  }
  const addTier = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await api('/membership-types', { method: 'POST', body: JSON.stringify({ name: tierForm.name, dues_amount: tierForm.dues_amount, is_offered: true }) }); flash('Tier created.'); setTierForm({ name: '', dues_amount: '' }); load() } catch (er) { setError(errorMessage(er)) }
  }
  const toggleTier = async (t: Tier) => {
    try { await api(`/membership-types/${t.membership_type_id}`, { method: 'PATCH', body: JSON.stringify({ name: t.name, dues_amount: t.dues_amount, is_offered: !t.is_offered }) }); load() } catch (er) { setError(errorMessage(er)) }
  }
  const runReminders = async () => {
    try { const r = await api<{ reminders_queued: number; event_reminders: number }>('/admin/run-reminders', { method: 'POST' }); flash(`Sent ${r.reminders_queued} renewal and ${r.event_reminders} event reminders.`) } catch (e) { setError(errorMessage(e)) }
  }

  return (
    <div style={FONT} className="space-y-6 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {([['people', 'People & roles'], ['semesters', 'Semesters'], ['tiers', 'Membership tiers']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer ${tab === k ? 'bg-[#714B67] text-white' : 'bg-neutral-100 text-neutral-600'}`}>{l}</button>
          ))}
        </div>
        <button onClick={runReminders} className="px-3.5 py-2 rounded-lg border border-neutral-300 bg-white text-xs font-semibold cursor-pointer hover:border-neutral-900">Send reminders now</button>
      </div>

      {ok && <p className="text-xs text-emerald-700 flex items-center gap-1.5"><Check className="w-4 h-4" />{ok}</p>}
      {error && <p className="text-xs text-rose-700">{error} <button className="underline bg-transparent border-none cursor-pointer text-rose-700" onClick={() => setError(null)}>Dismiss</button></p>}
      {loading && <div className="flex justify-center py-12"><div className="w-7 h-7 rounded-full border-2 border-[#714B67] border-t-transparent animate-spin" /></div>}

      {!loading && tab === 'people' && (
        <div className="space-y-4">
          <p className="text-xs text-neutral-500">Everyone who has signed up. Give Officer, Treasurer and other positions here, they apply immediately. Staff sign up with a student email first, then you assign the role.</p>
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input className={input + ' w-full pl-9'} placeholder="Search name, email or student ID" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {users.length === 0 ? <p className="text-sm text-neutral-400 py-8 text-center">No users match.</p> : (
            <ul className="divide-y divide-neutral-100 border-t border-neutral-200">
              {users.map(u => {
                const open = expanded === u.member_id
                const mine = leadership.filter(l => l.member_id === u.member_id)
                return (
                  <li key={u.member_id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <button onClick={() => setExpanded(open ? null : u.member_id)} className="text-left bg-transparent border-none cursor-pointer min-w-0 flex-1">
                        <span className="block text-sm font-semibold truncate">{u.full_name}</span>
                        <span className="block text-[11px] text-neutral-500 truncate">{u.email}{u.student_id ? ` · ${u.student_id}` : ''}</span>
                      </button>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#714B67]/10 text-[#714B67] text-[10px] font-semibold">{u.access_level}</span>
                        {u.is_member && <span className="px-2.5 py-0.5 rounded-full border border-emerald-200 text-emerald-700 text-[10px] font-semibold">Member until {u.member_until}</span>}
                      </div>
                    </div>
                    {open && (
                      <div className="mt-3 pl-1 space-y-3 text-xs">
                        <div className="grid sm:grid-cols-4 gap-x-6 gap-y-1 text-neutral-600">
                          <span>Phone: <b className="text-neutral-900">{u.phone || '–'}</b></span>
                          <span>Joined: <b className="text-neutral-900">{u.joined_on}</b></span>
                          <span>Tickets / orders: <b className="text-neutral-900">{u.tickets} / {u.orders}</b></span>
                          <span>Paid so far: <b className="text-neutral-900">₹{u.paid_total.toLocaleString('en-IN')}</b></span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-neutral-500">{year} positions:</span>
                          {mine.length === 0 && <span className="text-neutral-400">none</span>}
                          {mine.map(l => (
                            <span key={l.leadership_role_id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-neutral-300">
                              {l.position}
                              <button onClick={() => remove(l.leadership_role_id)} title="Remove" className="bg-transparent border-none cursor-pointer text-neutral-400 hover:text-rose-700 p-0"><Trash2 className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <select className={input} value={pick[u.member_id] ?? ''} onChange={e => setPick(p => ({ ...p, [u.member_id]: e.target.value }))}>
                            <option value="">Assign a position…</option>
                            {positions.filter(p => !mine.some(l => l.position === p)).map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <button className={btn} disabled={!pick[u.member_id]} onClick={() => assign(u.member_id)}>Assign</button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {!loading && tab === 'semesters' && (
        <div className="space-y-5 max-w-2xl">
          <p className="text-xs text-neutral-500">Memberships run for a semester. Reminders go out 30 and 7 days before a member's semester ends.</p>
          <form onSubmit={addSemester} className="flex flex-wrap gap-2 items-end">
            <input required className={input} placeholder="Fall 2026" value={semForm.name} onChange={e => setSemForm(f => ({ ...f, name: e.target.value }))} />
            <input required type="date" className={input} value={semForm.starts_on} onChange={e => setSemForm(f => ({ ...f, starts_on: e.target.value }))} />
            <input required type="date" className={input} value={semForm.ends_on} onChange={e => setSemForm(f => ({ ...f, ends_on: e.target.value }))} />
            <button className={btn}>Add semester</button>
          </form>
          <ul className="divide-y divide-neutral-100 border-t border-neutral-200">
            {semesters.map(s => <li key={s.semester_id} className="py-2.5 text-sm flex justify-between"><b>{s.name}</b><span className="text-neutral-500 text-xs">{s.starts_on} to {s.ends_on}</span></li>)}
            {semesters.length === 0 && <li className="py-6 text-sm text-neutral-400">No semesters yet.</li>}
          </ul>
        </div>
      )}

      {!loading && tab === 'tiers' && (
        <div className="space-y-5 max-w-2xl">
          <form onSubmit={addTier} className="flex flex-wrap gap-2 items-end">
            <input required className={input} placeholder="Tier name, e.g. Annual" value={tierForm.name} onChange={e => setTierForm(f => ({ ...f, name: e.target.value }))} />
            <input required className={input} placeholder="Dues in ₹" inputMode="decimal" value={tierForm.dues_amount} onChange={e => setTierForm(f => ({ ...f, dues_amount: money(e.target.value) }))} />
            <button className={btn}>Add tier</button>
          </form>
          <ul className="divide-y divide-neutral-100 border-t border-neutral-200">
            {tiers.map(t => (
              <li key={t.membership_type_id} className="py-2.5 text-sm flex items-center justify-between">
                <span><b>{t.name}</b> <span className="text-neutral-500 text-xs">₹{t.dues_amount}</span></span>
                <button onClick={() => toggleTier(t)} className={`px-3 py-1 rounded-full text-[11px] font-semibold border cursor-pointer bg-white ${t.is_offered ? 'border-emerald-200 text-emerald-700' : 'border-neutral-300 text-neutral-500'}`}>{t.is_offered ? 'Offered' : 'Hidden'}</button>
              </li>
            ))}
            {tiers.length === 0 && <li className="py-6 text-sm text-neutral-400">No tiers yet. Create one so people can join.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
