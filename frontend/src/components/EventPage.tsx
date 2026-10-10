import { useEffect, useState } from 'react'
import { Calendar, MapPin, Ticket } from 'lucide-react'
import { api, errorMessage } from '../apiClient'
import { processRazorpayPayment } from '../razorpayPayment'
import type { UserAccount } from '../authService'
import { useLiveRefresh } from '../useRealtimeUpdates'

interface TicketType {
  ticket_type_id: number; name: string; description?: string | null; member_price: string; non_member_price: string
  seats_left: number; non_member_seats_left: number; non_member_seat_limit: number
  max_per_member?: number | null; max_per_guest?: number | null
}
interface EventInfo { event_id: number; title: string; description?: string; venue?: string; starts_at: string; ticket_types: TicketType[] }

/**
 * Where an event poster QR lands. Works on a phone: see the details, sign in, book, pay.
 * The poster QR is a plain link (#event/<id>); the ticket QR you receive afterwards is the signed, scan-only one.
 */
export default function EventPage({ eventId, user, onSignIn, onOpenTickets, onHome }: {
  eventId: number
  user: UserAccount | null
  onSignIn: () => void
  onOpenTickets: () => void
  onHome: () => void
}) {
  const [ev, setEv] = useState<EventInfo | null>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [booked, setBooked] = useState(false)

  const load = () => api<EventInfo>(`/events/${eventId}`).then(setEv).catch(() => setMissing(true))
  useEffect(() => { load() }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps
  useLiveRefresh(['events'], load)

  const book = async (tt: TicketType) => {
    if (!user) { onSignIn(); return }
    setBusy(tt.ticket_type_id)
    setMsg(null)
    try {
      const res = await api<{ tickets: { ticket_id: number }[]; total_amount: string; requires_payment: boolean }>('/tickets/purchase', {
        method: 'POST',
        body: JSON.stringify({ ticket_type_id: tt.ticket_type_id, holders: [{ holder_name: user.name, holder_email: user.email }] }),
      })
      const total = parseFloat(res.total_amount)
      if (res.requires_payment && total > 0) {
        await processRazorpayPayment({
          category: 'ticket', amount: total.toFixed(2), description: `Ticket: ${ev?.title}`, user,
          ticket_ids: res.tickets.map(t => t.ticket_id),
          onSuccess: () => { setBooked(true); setMsg({ ok: true, text: 'Payment received. Your ticket is ready.' }); load() },
          onError: m => setMsg({ ok: false, text: `${m} Your seat is held for 15 minutes: open My Tickets to pay again.` }),
        })
      } else {
        setBooked(true)
        setMsg({ ok: true, text: 'You are booked. Your ticket is ready.' })
        load()
      }
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e, 'Could not book this ticket.') })
    } finally { setBusy(null) }
  }

  const when = ev ? new Date(ev.starts_at) : null
  return (
    <div className="min-h-screen bg-[#714B67] px-4 py-8 flex flex-col items-center" style={{ fontFamily: 'var(--font-display, "TT Firs Neue", sans-serif)' }}>
      <button onClick={onHome} className="mb-6 bg-transparent border-none cursor-pointer p-0">
        <img src="/logo.png" alt="Skyline" className="h-8 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
      </button>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-[0_24px_60px_rgba(0,0,0,0.35)] p-6 sm:p-8 text-neutral-900">
        {missing ? (
          <p className="text-sm text-neutral-600 text-center py-10">This event could not be found. It may have been removed.</p>
        ) : !ev ? (
          <div className="flex justify-center py-12"><div className="w-7 h-7 rounded-full border-2 border-[#714B67] border-t-transparent animate-spin" /></div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold leading-tight">{ev.title}</h1>
            <div className="mt-3 space-y-1.5 text-sm text-neutral-600">
              <p className="flex items-center gap-2"><Calendar className="w-4 h-4 text-[#714B67]" />{when!.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}</p>
              {ev.venue && <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-[#714B67]" />{ev.venue}</p>}
            </div>
            {ev.description && <p className="mt-4 text-sm text-neutral-700 leading-relaxed whitespace-pre-line">{ev.description}</p>}

            <h2 className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Tickets</h2>
            <ul className="divide-y divide-neutral-100 border-t border-neutral-200">
              {ev.ticket_types.map(tt => {
                const member = user?.isActive ?? false
                const price = member ? tt.member_price : tt.non_member_price
                const left = member ? tt.seats_left : tt.non_member_seats_left
                const cap = member ? tt.max_per_member : tt.max_per_guest
                const memberOnly = tt.non_member_seat_limit === 0 && !member
                const disabled = left <= 0 || memberOnly || busy !== null
                return (
                  <li key={tt.ticket_type_id} className="py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{tt.name}</p>
                      {tt.description && <p className="text-[11px] text-neutral-600 mt-0.5">{tt.description}</p>}
                      <p className="text-[11px] text-neutral-500">
                        {memberOnly ? 'Members only' : left <= 0 ? 'Sold out' : `${left} seats left`}
                        {cap ? ` · max ${cap} per person` : ''}
                        {!user && tt.member_price !== tt.non_member_price ? ` · members pay ₹${tt.member_price}` : ''}
                      </p>
                    </div>
                    <button disabled={disabled && !!user} onClick={() => book(tt)}
                      className="px-4 py-2.5 rounded-xl bg-[#714B67] text-white text-xs font-semibold border-none cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shrink-0">
                      <Ticket className="w-3.5 h-3.5" />
                      {busy === tt.ticket_type_id ? 'Booking…' : !user ? 'Sign in to book' : parseFloat(price) === 0 ? 'Book free' : `Book · ₹${price}`}
                    </button>
                  </li>
                )
              })}
            </ul>
            {msg && <p className={`mt-4 text-xs ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</p>}
            {(booked || user) && (
              <button onClick={onOpenTickets} className="mt-5 w-full py-3 rounded-xl border border-neutral-300 hover:border-neutral-900 bg-white text-xs font-semibold cursor-pointer">
                {booked ? 'Open my ticket (QR + PDF)' : 'Go to my dashboard'}
              </button>
            )}
          </>
        )}
      </div>
      <p className="mt-6 text-[11px] text-white/60">Skyline Student Association</p>
    </div>
  )
}
