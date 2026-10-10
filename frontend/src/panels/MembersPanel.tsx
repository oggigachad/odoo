import { createPortal } from 'react-dom'
import { useState, useEffect, useCallback } from 'react'
import { Check, AlertCircle, Phone, Mail, GraduationCap, Calendar, Shield, X, User, ExternalLink } from 'lucide-react'
import { api } from '../apiClient'
import { useLiveRefresh } from '../useRealtimeUpdates'

interface Member {
  id: number
  name: string
  email: string
  phone?: string
  student_id?: string
  joined_on: string
  is_active: boolean
  valid_until?: string | null
  semester_name?: string | null
  membership_type?: string | null
  roles: string[]
}

interface LookupResult {
  member_id: number
  name: string
  email: string
  has_active_membership: boolean
  membership_type?: string
}

const FONT = { fontFamily: '"TT Firs Neue", sans-serif' }

export default function MembersPanel({ isAdmin }: { isAdmin?: boolean }) {
  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'list' | 'lookup'>('list')
  const [filter, setFilter] = useState<'all' | 'active' | 'guests'>('all')
  const [search, setSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)

  // Lookup state
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const load = useCallback(async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '100', offset: '0' })
      if (q) params.set('q', q)
      if (filter === 'active') params.set('active', 'true')
      else if (filter === 'guests') params.set('active', 'false')

      const [data, lead] = await Promise.all([
        api<{ items: any[]; total: number }>(`/members?${params}`),
        api<{ member_id: number; position: string }[]>('/leadership'),
      ])

      setMembers(
        data.items.map(m => ({
          id: m.member_id,
          name: m.full_name,
          email: m.email,
          phone: m.phone ?? undefined,
          student_id: m.student_id ?? undefined,
          joined_on: m.joined_on,
          is_active: !!m.is_active,
          valid_until: m.valid_until ?? null,
          semester_name: m.semester_name ?? null,
          membership_type: m.membership_type ?? null,
          roles: lead.filter(l => l.member_id === m.member_id).map(l => l.position),
        }))
      )
      setTotal(data.total)
    } catch {
      setError('Could not load members.')
      setMembers([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load(search)
  }, [load, search])

  useLiveRefresh(['members'], () => load(search))

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    load(search)
  }

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lookupQuery.trim()) return
    setLookupLoading(true)
    setLookupError(null)
    setLookupResult(null)
    try {
      const r = await api<any>(`/members/lookup?q=${encodeURIComponent(lookupQuery)}`)
      setLookupResult({
        member_id: r.member_id,
        name: r.full_name,
        email: r.email ?? '',
        has_active_membership: !!r.is_active,
        membership_type: r.membership_type ?? undefined,
      })
    } catch (e: any) {
      setLookupError(e?.detail ?? 'Member not found.')
    } finally {
      setLookupLoading(false)
    }
  }

  const activeCount = members.filter(m => m.is_active).length
  const guestCount = members.filter(m => !m.is_active).length

  return (
    <div style={FONT} className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header & Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-neutral-200">
        <div className="flex gap-2">
          {([['list', 'Member & Student Directory'], ['lookup', 'Door Lookup']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border-none ${
                tab === key
                  ? 'bg-[#714B67] text-white shadow-md'
                  : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'list' && (
          <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl">
            {(
              [
                ['all', `All (${total})`],
                ['active', `Members (${activeCount})`],
                ['guests', `Non-Members (${guestCount})`],
              ] as const
            ).map(([fKey, fLabel]) => (
              <button
                key={fKey}
                onClick={() => setFilter(fKey)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                  filter === fKey ? 'bg-white text-[#714B67] shadow-sm font-bold' : 'bg-transparent text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {fLabel}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {tab === 'list' ? (
        <>
          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex gap-2.5">
            <input
              type="text"
              placeholder="Search by name, email, phone number, or student ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-50 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs shadow-sm transition-all"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#714B67] hover:bg-[#5d3b54] text-white text-xs font-bold cursor-pointer transition-all border-none shadow-sm"
            >
              Search
            </button>
          </form>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-16 bg-neutral-50 rounded-2xl border border-dashed border-neutral-300">
              <User className="w-8 h-8 mx-auto text-neutral-400 mb-2" />
              <p className="text-neutral-600 text-sm font-bold">No members or registered students found.</p>
              <p className="text-neutral-400 text-xs mt-1">Try modifying your search or filter criteria.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden shadow-sm">
              <div className="hidden sm:grid grid-cols-12 px-5 py-3 bg-neutral-50 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                <span className="col-span-5">Name & Email</span>
                <span className="col-span-3">Phone & Student ID</span>
                <span className="col-span-2">Membership Status</span>
                <span className="col-span-2 text-right">Details</span>
              </div>

              {members.map(m => (
                <div
                  key={m.id}
                  onClick={() => setSelectedMember(m)}
                  className="grid grid-cols-1 sm:grid-cols-12 items-center px-5 py-3.5 hover:bg-neutral-50/80 cursor-pointer transition-colors gap-2 sm:gap-0"
                >
                  {/* Name & Email */}
                  <div className="sm:col-span-5 flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-[#714B67]/10 text-[#714B67] flex items-center justify-center text-xs font-bold shrink-0">
                      {m.name[0]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-neutral-900 text-xs font-bold truncate">{m.name}</p>
                      <p className="text-neutral-500 text-[11px] truncate">{m.email}</p>
                    </div>
                  </div>

                  {/* Phone & Student ID */}
                  <div className="sm:col-span-3 min-w-0">
                    <p className="text-neutral-800 text-xs font-medium truncate flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-neutral-400 shrink-0" />
                      {m.phone ? m.phone : <span className="text-neutral-400 italic">No phone</span>}
                    </p>
                    {m.student_id && (
                      <p className="text-neutral-500 text-[11px] truncate flex items-center gap-1.5 mt-0.5">
                        <GraduationCap className="w-3 h-3 text-neutral-400 shrink-0" />
                        {m.student_id}
                      </p>
                    )}
                  </div>

                  {/* Status & Roles */}
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        m.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${m.is_active ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                      {m.is_active ? 'Active' : 'Non-Member'}
                    </span>
                    {m.roles.map(r => (
                      <span
                        key={r}
                        className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-[#714B67]/10 text-[#714B67] border border-[#714B67]/20 uppercase"
                      >
                        {r}
                      </span>
                    ))}
                  </div>

                  {/* View Details Action */}
                  <div className="sm:col-span-2 text-right">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        setSelectedMember(m)
                      }}
                      className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-[#714B67] hover:text-white text-neutral-700 text-[11px] font-bold border-none cursor-pointer transition-all"
                    >
                      View Profile
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Door Lookup */
        <div className="space-y-4 max-w-xl">
          <p className="text-neutral-600 text-xs">
            Enter a student’s email address or phone number to instantly verify active membership standing at an event entrance.
          </p>
          <form onSubmit={handleLookup} className="flex gap-2.5">
            <input
              type="text"
              placeholder="Email or phone number..."
              value={lookupQuery}
              onChange={e => setLookupQuery(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-50 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs shadow-sm"
            />
            <button
              type="submit"
              disabled={lookupLoading}
              className="px-5 py-2.5 rounded-xl bg-[#714B67] hover:bg-[#5d3b54] text-white text-xs font-bold transition disabled:opacity-40 cursor-pointer border-none shadow-sm"
            >
              {lookupLoading ? 'Verifying...' : 'Verify'}
            </button>
          </form>

          {lookupError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold text-center">
              {lookupError}
            </div>
          )}

          {lookupResult && (
            <div
              className={`p-6 rounded-2xl border-2 transition-all ${
                lookupResult.has_active_membership
                  ? 'bg-emerald-50/80 border-emerald-300'
                  : 'bg-amber-50/80 border-amber-300'
              }`}
            >
              <div className="flex items-center gap-3.5 mb-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg shadow-sm ${
                    lookupResult.has_active_membership
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 text-white'
                  }`}
                >
                  {lookupResult.has_active_membership ? <Check className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                </div>
                <div>
                  <p className="font-bold text-base text-neutral-900">{lookupResult.name}</p>
                  <p className="text-neutral-500 text-xs">{lookupResult.email}</p>
                </div>
              </div>
              <p
                className={`text-sm font-bold ${
                  lookupResult.has_active_membership ? 'text-emerald-800' : 'text-amber-800'
                }`}
              >
                {lookupResult.has_active_membership
                  ? `Active Member in Good Standing (${lookupResult.membership_type ?? 'Standard'})`
                  : 'No active membership dues found. Non-Member / Guest rate applies'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Member Detailed Inspection Modal ───────────────────────────────── */}
      {selectedMember && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-neutral-100 relative">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-neutral-200">
              <div className="flex items-center gap-4">
                <span className="w-14 h-14 rounded-2xl bg-[#714B67] text-white flex items-center justify-center text-xl font-bold shadow-md">
                  {selectedMember.name[0]}
                </span>
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">{selectedMember.name}</h3>
                  <p className="text-xs text-neutral-500">{selectedMember.email}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        selectedMember.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${selectedMember.is_active ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                      {selectedMember.is_active ? 'Active Member' : 'Non-Member / Guest'}
                    </span>
                    {selectedMember.membership_type && (
                      <span className="text-[11px] font-semibold text-[#714B67]">
                        · {selectedMember.membership_type}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedMember(null)}
                className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 border-none cursor-pointer transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Field Details Entered in Signup */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-[#714B67]" /> Phone Number
                </p>
                <p className="text-neutral-900 font-bold text-sm mt-1">
                  {selectedMember.phone ? selectedMember.phone : <span className="text-neutral-400 font-normal">Not provided</span>}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <GraduationCap className="w-3 h-3 text-[#714B67]" /> Student ID / Roll No
                </p>
                <p className="text-neutral-900 font-bold text-sm mt-1">
                  {selectedMember.student_id ? selectedMember.student_id : <span className="text-neutral-400 font-normal">Not provided</span>}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Mail className="w-3 h-3 text-[#714B67]" /> College / Registered Email
                </p>
                <p className="text-neutral-900 font-semibold text-xs mt-1 truncate" title={selectedMember.email}>
                  {selectedMember.email}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-[#714B67]" /> Joined Date
                </p>
                <p className="text-neutral-900 font-semibold text-xs mt-1">
                  {selectedMember.joined_on}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-[#714B67]" /> Active Validity
                </p>
                <p className="text-neutral-900 font-semibold text-xs mt-1">
                  {selectedMember.valid_until ? `Valid until ${selectedMember.valid_until}` : 'No active validity period'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <User className="w-3 h-3 text-[#714B67]" /> Database Member ID
                </p>
                <p className="text-neutral-900 font-mono font-bold text-xs mt-1">
                  #{selectedMember.id}
                </p>
              </div>
            </div>

            {/* Leadership & Permissions */}
            {selectedMember.roles.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-[#714B67]/5 border border-[#714B67]/20">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#714B67] mb-1.5">Leadership Positions Held</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedMember.roles.map(r => (
                    <span key={r} className="px-2.5 py-1 rounded-lg bg-[#714B67] text-white text-xs font-bold shadow-sm">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-neutral-200">
              <div className="flex gap-2">
                {selectedMember.phone && (
                  <a
                    href={`tel:${selectedMember.phone}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold no-underline transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" /> Call
                  </a>
                )}
                <a
                  href={`mailto:${selectedMember.email}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold no-underline transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" /> Email
                </a>
              </div>

              <button
                onClick={() => setSelectedMember(null)}
                className="px-6 py-2 rounded-xl bg-[#714B67] hover:bg-[#5d3b54] text-white text-xs font-bold border-none cursor-pointer transition-all shadow-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}
