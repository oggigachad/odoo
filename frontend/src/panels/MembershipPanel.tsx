import { useState, useEffect, useCallback } from 'react'
import { Check, ShieldCheck, Sparkles } from 'lucide-react'
import { api, API_BASE, getToken } from '../apiClient'
import { useLiveRefresh } from '../useRealtimeUpdates'
import { processRazorpayPayment } from '../razorpayPayment'
import type { UserAccount } from '../authService'

interface Semester {
  semester_id: number
  name: string
  starts_on: string
  ends_on: string
}

interface MembershipType {
  membership_type_id: number
  name: string
  dues_amount: string // "500.00"
  is_offered: boolean
}

interface Membership {
  membership_id: number
  member_id: number
  semester_id: number
  membership_type_id: number
  dues_amount: string // "500.00"
  payment_id?: number | null
  semester_name?: string
  membership_type_name?: string
  valid_until?: string
}

interface Props {
  memberId: number
  user?: UserAccount
  onUserChange?: (u: UserAccount) => void
  duesDiscount?: number // % from studentId
}

const FONT = { fontFamily: '"TT Firs Neue", sans-serif' }

export default function MembershipPanel({ memberId, user, onUserChange, duesDiscount = 0 }: Props) {
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [types, setTypes] = useState<MembershipType[]>([])
  const [myMemberships, setMyMemberships] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [selectedSem, setSelectedSem] = useState<number | null>(null)
  const [selectedType, setSelectedType] = useState<number | null>(null)
  const [buying, setBuying] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [sems, mts, mems] = await Promise.all([
        api<Semester[]>('/semesters'),
        api<MembershipType[]>('/membership-types'),
        api<Membership[]>(`/members/${memberId}/memberships`),
      ])
      setSemesters(sems)
      setTypes(mts.filter(t => t.is_offered))
      setMyMemberships(mems)
    } catch {
      setError('Could not load membership data.')
    } finally {
      setLoading(false)
    }
  }, [memberId])

  useEffect(() => { load() }, [load])
  useLiveRefresh(['members', 'finance'], load)

  const chosenType = types.find(t => t.membership_type_id === selectedType)
  const rawPrice = chosenType ? parseFloat(chosenType.dues_amount) : null
  const discountedPrice = rawPrice != null ? rawPrice * (1 - duesDiscount / 100) : null

  const handleBuy = async () => {
    if (!selectedSem || !selectedType || !chosenType) {
      setError('Select a semester and plan.')
      return
    }
    setBuying(true)
    setError(null)
    try {
      // 1. Create membership record in database
      const created = await api<Membership>('/memberships', {
        method: 'POST',
        body: JSON.stringify({
          member_id: memberId,
          semester_id: selectedSem,
          membership_type_id: selectedType,
        }),
      })

      // 2. Process payment securely with Razorpay (exact dues amount in ₹)
      const exactAmount = parseFloat(created.dues_amount).toFixed(2)
      const userProfile: UserAccount = user || {
        id: String(memberId),
        memberId,
        name: 'Student Member',
        email: '',
        role: 'Guest',
        roles: [],
        isActive: false,
      }

      await processRazorpayPayment({
        category: 'dues',
        amount: exactAmount,
        description: `Skyline Membership Dues: ${chosenType.name}`,
        user: userProfile,
        membership_id: created.membership_id,
        onSuccess: (_verifyResult, updatedUser) => {
          setBuying(false)
          setSuccessMsg('Payment verified via Razorpay! Your official membership is now active and the Member Portal is unlocked.')
          setSelectedSem(null)
          setSelectedType(null)
          load()
          if (updatedUser && onUserChange) {
            onUserChange(updatedUser)
          }
          setTimeout(() => setSuccessMsg(null), 8000)
        },
        onError: (errMsg) => {
          setBuying(false)
          setError(errMsg)
        },
      })
    } catch (e: any) {
      setBuying(false)
      setError(e?.detail ?? e?.message ?? 'Purchase failed.')
    }
  }

  const payPending = async (m: Membership) => {
    setBuying(true)
    setError(null)
    const userProfile: UserAccount = user || { id: String(memberId), memberId, name: 'Student Member', email: '', role: 'Guest', roles: [], isActive: false }
    await processRazorpayPayment({
      category: 'dues',
      amount: parseFloat(m.dues_amount).toFixed(2),
      description: `Skyline Membership Dues: ${m.membership_type_name ?? ''}`,
      user: userProfile,
      membership_id: m.membership_id,
      onSuccess: (_r, updatedUser) => {
        setBuying(false)
        setSuccessMsg('Payment verified. Your membership is now active.')
        load()
        if (updatedUser && onUserChange) onUserChange(updatedUser)
        setTimeout(() => setSuccessMsg(null), 8000)
      },
      onError: msg => { setBuying(false); setError(msg) },
    })
  }

  const isAlreadyActive = user?.isActive || myMemberships.some(m => m.payment_id && m.valid_until && new Date(m.valid_until) > new Date())

  return (
    <div style={FONT} className="space-y-5 animate-fadeIn">
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">{error}</div>}

      {isAlreadyActive && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-black text-emerald-900 uppercase tracking-wide">Active Membership Activated</div>
              <div className="text-[11px] text-emerald-700">You have verified member status. You now get member prices on tickets and merchandise.</div>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-200 text-emerald-900 text-xs font-bold shrink-0">
            Active Member
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-[#714B67] border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Purchase Form */}
          <div className="p-6 space-y-4 border border-neutral-200 rounded-2xl bg-white shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-neutral-900 text-sm">
                {isAlreadyActive ? 'Renew / Extend Membership' : 'Unlock Official Membership'}
              </h3>
              <span className="flex items-center gap-1 text-[10px] text-neutral-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Razorpay Secured
              </span>
            </div>

            {duesDiscount > 0 && (
              <div className="p-2.5 rounded-xl bg-[#714B67]/10 border border-[#714B67]/20 text-[#714B67] text-xs font-semibold">
                Student Benefit: {duesDiscount}% discount applied
              </div>
            )}

            {/* Semester picker */}
            <div>
              <label className="text-xs text-neutral-500 font-semibold block mb-2 uppercase tracking-wider">Select Semester</label>
              {semesters.length === 0 ? (
                <p className="text-neutral-400 text-xs">No semesters available yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {semesters.map(s => (
                    <button key={s.semester_id} onClick={() => setSelectedSem(s.semester_id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        selectedSem === s.semester_id
                          ? 'bg-[#714B67] text-white border-[#714B67] shadow-sm'
                          : 'border-neutral-300 text-neutral-600 hover:border-[#714B67] hover:text-neutral-900 bg-transparent'
                      }`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Plan picker */}
            <div>
              <label className="text-xs text-neutral-500 font-semibold block mb-2 uppercase tracking-wider">Select Plan</label>
              {types.length === 0 ? (
                <p className="text-neutral-400 text-xs">No plans available yet.</p>
              ) : (
                <div className="space-y-2">
                  {types.map(t => {
                    const base = parseFloat(t.dues_amount)
                    const final = base * (1 - duesDiscount / 100)
                    return (
                      <button key={t.membership_type_id} onClick={() => setSelectedType(t.membership_type_id)}
                        className={`w-full flex justify-between items-center px-4 py-3 rounded-xl border transition-all text-left cursor-pointer ${
                          selectedType === t.membership_type_id
                            ? 'bg-[#714B67]/10 border-[#714B67] text-neutral-900 shadow-sm'
                            : 'border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:text-neutral-900 bg-transparent'
                        }`}>
                        <div>
                          <span className="font-bold text-xs block text-neutral-900">{t.name}</span>
                          <span className="text-[10px] text-neutral-500">Member prices on tickets and merchandise, plus the member portal</span>
                        </div>
                        <span className="font-black text-[#714B67] text-sm shrink-0">
                          {duesDiscount > 0 ? (
                            <><span className="line-through text-neutral-400 text-xs mr-1">₹{base.toFixed(2)}</span>₹{final.toFixed(2)}</>
                          ) : `₹${base.toFixed(2)}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <button disabled={!selectedSem || !selectedType || buying} onClick={handleBuy}
              className="w-full py-3 rounded-xl bg-[#714B67] hover:bg-[#5d3d54] text-white font-bold text-sm transition shadow-md disabled:opacity-40 disabled:cursor-not-allowed border-none cursor-pointer flex items-center justify-center gap-2">
              {buying ? (
                <span>Opening Razorpay Secure Checkout...</span>
              ) : (
                <span>Pay {discountedPrice != null ? `₹${discountedPrice.toFixed(2)}` : ''} with Razorpay</span>
              )}
            </button>
            <p className="text-center text-[10px] text-neutral-400">
              Payments are verified directly via Razorpay. Membership activates immediately upon payment completion.
            </p>
          </div>

          {/* History */}
          <div className="p-6 border border-neutral-200 rounded-2xl bg-white shadow-sm">
            <h3 className="font-bold text-neutral-900 text-sm mb-4">Membership History</h3>
            {myMemberships.length === 0 ? (
              <p className="text-neutral-500 text-xs">No memberships on record yet.</p>
            ) : (
              <div className="space-y-3">
                {myMemberships.map(m => {
                  const isPaid = Boolean(m.payment_id)
                  const isActive = isPaid && m.valid_until ? new Date(m.valid_until) > new Date() : false
                  return (
                    <div key={m.membership_id} className="border border-neutral-200 rounded-xl p-3 bg-neutral-50/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-neutral-900 text-xs font-bold">{m.semester_name ?? `Semester #${m.semester_id}`}</p>
                          <p className="text-neutral-500 text-xs">{m.membership_type_name ?? `Type #${m.membership_type_id}`}</p>
                          {m.valid_until && <p className="text-neutral-400 text-[10px]">Valid until {m.valid_until}</p>}
                        </div>
                        <p className="font-black text-[#714B67] text-xs">₹{parseFloat(m.dues_amount).toFixed(2)}</p>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isPaid
                            ? 'bg-zinc-100 text-zinc-600 border-zinc-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {isActive ? 'Active Member' : isPaid ? 'Past Semester' : 'Payment Pending'}
                        </span>
                        {!isPaid && (
                          <button onClick={() => payPending(m)} disabled={buying}
                            className="px-3 py-1 rounded-md bg-[#714B67] text-white text-[10px] font-semibold border-none cursor-pointer disabled:opacity-40">Pay now</button>
                        )}
                        {isPaid && (
                          <span className="text-[10px] text-neutral-400 font-mono">
                            Ref: #{m.payment_id}
                          </span>
                        )}
                        {isActive && m.valid_until && (
                          <>
                            <a href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Skyline membership ends: renew')}&dates=${m.valid_until.replace(/-/g, '')}/${m.valid_until.replace(/-/g, '')}&details=${encodeURIComponent('Renew from the Membership tab to keep member pricing.')}`}
                              target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold text-[#714B67] hover:underline">Add renewal reminder to Google Calendar</a>
                            <button onClick={async () => {
                              const res = await fetch(`${API_BASE}/memberships/${m.membership_id}/calendar.ics`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` }, credentials: 'include' })
                              if (!res.ok) return
                              const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = 'skyline-renewal.ics'; a.click(); URL.revokeObjectURL(url)
                            }} className="text-[10px] font-semibold text-neutral-600 hover:underline bg-transparent border-none cursor-pointer p-0">.ics file (30 and 7 day alerts)</button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
