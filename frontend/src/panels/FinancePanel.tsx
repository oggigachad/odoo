import { useState, useEffect, useCallback } from 'react'
import { money, digits } from '../numeric'
import { Check } from 'lucide-react'
import { api, API_ORIGIN, getToken, ApiError } from '../apiClient'
import { useLiveRefresh } from '../useRealtimeUpdates'

interface Expense {
  expense_id: number
  member_id: number
  volunteer_name?: string
  description: string
  amount: string          // "42.00"
  receipt_url?: string
  event_id?: number
  fundraiser_id?: number
  incurred_on: string
  submitted_at: string
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'reimbursed'
  reimbursed_at?: string
}

interface TreasurerSummaryItem {
  direction: string   // "in" | "out"
  item: string
  total: string       // "860.00"
}

interface ClubBalance {
  total_in: string
  total_out: string
  balance: string
}

interface Props {
  isTreasurer: boolean
  isOfficer: boolean
  memberId: number
  selfMemberId?: number  // used to prevent self-expense approval
}

/** ISSUE-007: shrink receipt photos in the browser (max 1600x1200, WebP) before upload */
async function prepareReceipt(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / bmp.width, 1200 / bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/webp', 0.82))
  return blob ? new File([blob], 'receipt.webp', { type: 'image/webp' }) : file
}

interface PendingItem { kind: 'membership' | 'order' | 'ticket'; category: string; ref_id: number; member_id: number | null; buyer: string; label: string; amount: string }

const FONT = { fontFamily: '"TT Firs Neue", sans-serif' }
const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-sky-50 text-sky-700 border-sky-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  reimbursed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}
const CASH_CATEGORIES = ['dues', 'ticket', 'merchandise', 'fundraiser'] as const

export default function FinancePanel({ isTreasurer, isOfficer, memberId, selfMemberId }: Props) {
  const [balance, setBalance] = useState<ClubBalance | null>(null)
  const [summary, setSummary] = useState<TreasurerSummaryItem[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'balance' | 'expenses' | 'cash'>(isTreasurer ? 'balance' : 'expenses')
  const [updating, setUpdating] = useState<number | null>(null)
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', receipt_url: '', incurred_on: '' })
  const [submitting, setSubmitting] = useState(false)
  const [cashForm, setCashForm] = useState({ category: 'dues' as typeof CASH_CATEGORIES[number], amount: '', member_id: '' })
  const [recordingCash, setRecordingCash] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingItem[]>([])
  const [settling, setSettling] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const canSeeCash = isOfficer || isTreasurer
  const load = useCallback(async () => {
    setError(null)
    try {
      const [bal, sum, exp] = await Promise.all([
        isTreasurer ? api<ClubBalance>('/treasurer/balance') : Promise.resolve(null),
        isTreasurer ? api<TreasurerSummaryItem[]>('/treasurer/summary') : Promise.resolve([] as TreasurerSummaryItem[]),
        api<Expense[]>('/expenses'),
      ])
      setBalance(bal)
      setSummary(sum)
      setExpenses(exp)
      if (canSeeCash) setPending(await api<PendingItem[]>('/payments/pending'))
    } catch {
      setError('Could not load financial data.')
    } finally {
      setLoading(false)
    }
  }, [canSeeCash, isTreasurer])

  useEffect(() => { load() }, [load])
  useLiveRefresh(['finance'], load)

  const flash = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000) }

  const handleExpenseStatus = async (expenseId: number, status: string) => {
    setUpdating(expenseId)
    try {
      await api(`/expenses/${expenseId}?status=${status}`, { method: 'PATCH' })
      setExpenses(prev => prev.map(e => e.expense_id === expenseId ? { ...e, status: status as Expense['status'] } : e))
      flash(`Expense ${status}.`)
    } catch (e: any) {
      setError(e?.detail ?? 'Update failed.')
    } finally {
      setUpdating(null)
    }
  }

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseForm.description || !expenseForm.amount) { setError('Description and amount required.'); return }
    setSubmitting(true)
    try {
      await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          description: expenseForm.description,
          amount: expenseForm.amount,
          receipt_url: expenseForm.receipt_url || undefined,
          incurred_on: expenseForm.incurred_on || undefined,
        }),
      })
      flash('Expense submitted for review!')
      setExpenseForm({ description: '', amount: '', receipt_url: '', incurred_on: '' })
      load()
    } catch (e: any) {
      setError(e?.detail ?? 'Submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const settle = async (it: PendingItem) => {
    const key = `${it.kind}-${it.ref_id}`
    setSettling(key)
    try {
      await api('/payments/cash', {
        method: 'POST',
        body: JSON.stringify({
          category: it.category,
          amount: it.amount,
          member_id: it.member_id ?? undefined,
          membership_id: it.kind === 'membership' ? it.ref_id : undefined,
          order_id: it.kind === 'order' ? it.ref_id : undefined,
          ticket_ids: it.kind === 'ticket' ? [it.ref_id] : undefined,
        }),
      })
      flash(`Payment of ₹${it.amount} recorded for ${it.buyer}.`)
      load()
    } catch (e: any) {
      setError(e?.message ?? 'Could not record payment.')
    } finally { setSettling(null) }
  }

  const handleReceiptFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const prepared = await prepareReceipt(file)
      const body = new FormData()
      body.append('file', prepared)
      const res = await fetch(`${API_ORIGIN}/api/v1/expenses/receipt`, {
        method: 'POST', body, credentials: 'include',
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new ApiError(json?.error?.message ?? 'Upload failed', res.status)
      setExpenseForm(f => ({ ...f, receipt_url: `${API_ORIGIN}${json.url}` }))
      flash(`Receipt attached (${Math.round(prepared.size / 1024)} KB).`)
    } catch (e: any) {
      setError(e?.message ?? 'Receipt upload failed.')
    } finally { setUploading(false) }
  }

  const handleRecordCash = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cashForm.amount) { setError('Amount required.'); return }
    setRecordingCash(true)
    try {
      await api('/payments/cash', {
        method: 'POST',
        body: JSON.stringify({
          category: cashForm.category,
          amount: cashForm.amount,
          member_id: cashForm.member_id ? parseInt(cashForm.member_id) : undefined,
        }),
      })
      flash('Cash payment recorded!')
      setCashForm({ category: 'dues', amount: '', member_id: '' })
      load()
    } catch (e: any) {
      setError(e?.detail ?? 'Record failed.')
    } finally {
      setRecordingCash(false)
    }
  }

  const tabs = [
    ...(isTreasurer ? [{ key: 'balance' as const, label: 'Balance' }] : []),
    { key: 'expenses' as const, label: 'Expenses' },
    ...(canSeeCash ? [{ key: 'cash' as const, label: 'Cash Payments' }] : []),
  ]

  return (
    <div style={FONT} className="space-y-4 animate-fadeIn">
      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              tab === t.key ? 'bg-[#714B67] text-white shadow-md' : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}>{t.label}</button>
        ))}
      </div>

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{error} <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button></div>}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-[#714B67] border-t-transparent rounded-full animate-spin" /></div>
      ) : tab === 'balance' ? (
        <div className="space-y-4">
          {balance && (
            <div className="grid grid-cols-3 gap-3">
              <div className=" p-4 border-b border-neutral-200">
                <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Total In</p>
                <p className="text-2xl font-black text-emerald-700 mt-1">₹{parseFloat(balance.total_in).toFixed(2)}</p>
              </div>
              <div className=" p-4 border-b border-neutral-200">
                <p className="text-[10px] text-rose-700 font-bold uppercase tracking-wider">Total Out</p>
                <p className="text-2xl font-black text-rose-700 mt-1">₹{parseFloat(balance.total_out).toFixed(2)}</p>
              </div>
              <div className=" p-4 border-b border-neutral-200">
                <p className="text-[10px] text-[#714B67] font-bold uppercase tracking-wider">Balance</p>
                <p className="text-2xl font-black text-[#714B67] mt-1">₹{parseFloat(balance.balance).toFixed(2)}</p>
              </div>
            </div>
          )}
          <div className=" p-5 border-b border-neutral-200">
            <h3 className="font-bold text-neutral-900 text-sm mb-4">Revenue Summary</h3>
            <div className="space-y-3">
              {summary.map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-1.5 h-6 rounded-full ${s.direction === 'in' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <div>
                      <p className="text-neutral-700 text-xs font-semibold">{s.item}</p>
                      <p className="text-neutral-400 text-[10px] capitalize">{s.direction === 'in' ? 'Income' : 'Expense'}</p>
                    </div>
                  </div>
                  <span className={`font-black text-sm ${s.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {s.direction === 'out' ? '−' : '+'}₹{parseFloat(s.total).toFixed(2)}
                  </span>
                </div>
              ))}
              {summary.length === 0 && <p className="text-neutral-400 text-xs">No transactions yet.</p>}
            </div>
          </div>
        </div>
      ) : tab === 'expenses' ? (
        <div className="space-y-4">
          {/* Submit expense */}
          <div className=" p-5 border-b border-neutral-200">
            <h3 className="font-bold text-neutral-900 text-sm mb-3">Submit Reimbursement Request</h3>
            <form onSubmit={handleSubmitExpense} className="space-y-2">
              <input type="text" placeholder="What was the expense for?" value={expenseForm.description}
                onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
              <div className="flex gap-2">
                <input type="text" placeholder="Amount in ₹ (e.g. 420.50)" value={expenseForm.amount}
                  onChange={e => setExpenseForm(f => ({ ...f, amount: money(e.target.value) }))}
                  className="w-44 px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
                <input type="date" value={expenseForm.incurred_on} onChange={e => setExpenseForm(f => ({ ...f, incurred_on: e.target.value }))}
                  className="flex-1 px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
              </div>
              <label className="flex items-center gap-3 text-xs text-neutral-600">
                <span className="px-3 py-2 rounded-lg border border-neutral-300 cursor-pointer hover:border-neutral-900">
                  {uploading ? 'Uploading…' : expenseForm.receipt_url ? 'Replace receipt' : 'Attach receipt (photo or PDF)'}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => handleReceiptFile(e.target.files?.[0])} />
                </span>
                {expenseForm.receipt_url && <a href={expenseForm.receipt_url} target="_blank" rel="noreferrer" className="text-[#714B67] hover:underline">Preview</a>}
              </label>
              <button type="submit" disabled={submitting}
                className="px-5 py-2 rounded-xl bg-[#714B67] text-white text-xs font-bold hover:bg-[#5d3d54] transition disabled:opacity-40">
                {submitting ? 'Submitting...' : 'Submit Expense'}
              </button>
            </form>
          </div>

          {/* Expense list */}
          <div className="space-y-2">
            {expenses.length === 0 ? (
              <p className="text-neutral-500 text-xs text-center py-8">No expense requests.</p>
            ) : expenses.map(ex => (
              <div key={ex.expense_id} className=" p-4 border-b border-neutral-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-neutral-900 text-xs">{ex.description}</p>
                    <p className="text-neutral-500 text-[10px]">
                      {ex.volunteer_name ?? `Member #${ex.member_id}`} · {ex.incurred_on}
                    </p>
                    {ex.receipt_url && (
                      <a href={ex.receipt_url} target="_blank" rel="noreferrer" className="text-[#714B67] text-[10px] hover:underline">View Receipt</a>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black text-rose-700 text-sm">−₹{parseFloat(ex.amount).toFixed(2)}</p>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${STATUS_COLORS[ex.status]}`}>{ex.status}</span>
                  </div>
                </div>
                {isTreasurer && (ex.status === 'pending' || ex.status === 'submitted') && (() => {
                  const isSelf = selfMemberId !== undefined && ex.member_id === selfMemberId
                  return (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => !isSelf && handleExpenseStatus(ex.expense_id, 'approved')}
                        disabled={updating === ex.expense_id || isSelf}
                        title={isSelf ? 'Cannot approve your own reimbursement request' : 'Approve'}
                        className={`px-3 py-1 rounded-lg text-neutral-900 text-[10px] font-bold transition ${
                          isSelf ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40'
                        }`}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => !isSelf && handleExpenseStatus(ex.expense_id, 'rejected')}
                        disabled={updating === ex.expense_id || isSelf}
                        title={isSelf ? 'Cannot reject your own reimbursement request' : 'Reject'}
                        className={`px-3 py-1 rounded-lg text-neutral-900 text-[10px] font-bold transition ${
                          isSelf ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-700 disabled:opacity-40'
                        }`}
                      >
                        Reject
                      </button>
                      {isSelf && (
                        <span className="text-[10px] text-amber-700 italic self-center">
                          Cannot approve your own expense
                        </span>
                      )}
                    </div>
                  )
                })()}
                {isTreasurer && ex.status === 'approved' && (
                  <button onClick={() => handleExpenseStatus(ex.expense_id, 'reimbursed')} disabled={updating === ex.expense_id}
                    className="mt-3 px-3 py-1 rounded-lg bg-sky-600 hover:bg-[#5d3d54] text-white text-[10px] font-bold transition disabled:opacity-40">
                    Mark Reimbursed
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Cash Payment Recording */
        <div className="max-w-2xl space-y-8">
          <div>
            <h3 className="font-semibold text-sm mb-1">Awaiting payment</h3>
            <p className="text-neutral-500 text-xs mb-3">Memberships, shop orders and tickets that members have requested. Mark cash received to activate them.</p>
            {pending.length === 0 ? <p className="text-neutral-400 text-xs py-4">Nothing is waiting for payment.</p> : (
              <ul className="divide-y divide-neutral-100 border-t border-neutral-200">
                {pending.map(it => (
                  <li key={`${it.kind}-${it.ref_id}`} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0"><b className="capitalize">{it.kind}</b> · {it.buyer}<span className="block text-neutral-500 truncate">{it.label}</span></span>
                    <span className="flex items-center gap-3 shrink-0">
                      <b>₹{it.amount}</b>
                      <button onClick={() => settle(it)} disabled={settling === `${it.kind}-${it.ref_id}`}
                        className="px-3 py-1.5 rounded-lg bg-[#714B67] text-white text-[11px] font-semibold border-none cursor-pointer disabled:opacity-40">Mark cash received</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className=" p-6 space-y-4 border-b border-neutral-200">
            <h3 className="font-bold text-neutral-900 text-sm">Record Cash Payment</h3>
            <p className="text-neutral-500 text-xs">Record cash collected at the door, merch table, or for dues.</p>
            <form onSubmit={handleRecordCash} className="space-y-3">
              <div>
                <label className="text-xs text-neutral-500 font-semibold block mb-2 uppercase tracking-wider">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CASH_CATEGORIES.map(cat => (
                    <button key={cat} type="button" onClick={() => setCashForm(f => ({ ...f, category: cat }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border capitalize transition-all ${
                        cashForm.category === cat ? 'bg-[#714B67] text-white border-[#714B67]' : 'border-neutral-300 text-neutral-600 hover:border-[#714B67] hover:text-neutral-900'
                      }`}>{cat}</button>
                  ))}
                </div>
              </div>
              <input required type="text" placeholder="Amount (e.g. 25.00)" value={cashForm.amount}
                onChange={e => setCashForm(f => ({ ...f, amount: money(e.target.value) }))}
                className="w-full px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
              <input type="text" inputMode="numeric" placeholder="Member ID (optional)" value={cashForm.member_id}
                onChange={e => setCashForm(f => ({ ...f, member_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
              <button type="submit" disabled={recordingCash}
                className="w-full py-3 rounded-xl bg-[#714B67] text-white font-bold text-sm hover:bg-[#5d3d54] transition disabled:opacity-40">
                {recordingCash ? 'Recording...' : 'Record Cash Payment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
