import EventFormAccess from '../components/EventFormAccess'
import { money, digits } from '../numeric'
import { useState, useEffect, useCallback } from 'react'
import { Check, X, Calendar, Trash2 } from 'lucide-react'
import { api, API_BASE, ticketPdfUrl, ticketQrUrl } from '../apiClient'
import { useLiveRefresh } from '../useRealtimeUpdates'
import { processRazorpayPayment } from '../razorpayPayment'
import type { UserAccount } from '../authService'

function buildGoogleCalendarUrl(title: string, startsAt: string, venue?: string, desc?: string): string {
  try {
    const start = new Date(startsAt)
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
    const format = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '')
    const dates = `${format(start)}/${format(end)}`
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates,
      details: desc ?? 'Skyline Student Association Event',
      location: venue ?? 'Skyline Campus',
    })
    return `https://calendar.google.com/calendar/render?${params.toString()}`
  } catch {
    return 'https://calendar.google.com'
  }
}

interface TicketType {
  ticket_type_id: number
  event_id: number
  name: string
  description?: string | null
  member_price: string
  non_member_price: string
  seat_limit: number
  non_member_seat_limit: number
  max_per_member?: number | null
  max_per_guest?: number | null
  seats_left: number
  non_member_seats_left: number
  sold: number
}

interface Event {
  event_id: number
  title: string
  description?: string
  venue?: string
  starts_at: string
  ticket_types: TicketType[]
}

interface MyTicket {
  ticket_id: number
  event_id?: number | null
  ticket_type_id: number
  holder_name: string
  holder_email?: string
  price_paid: string
  ticket_code: string
  qr_payload: string
  manual_code: string
  event_title?: string
  event_starts_at?: string
  venue?: string
  ticket_type_name?: string
  purchased_at: string
  checked_in_at?: string
  is_valid: boolean
}

interface TicketHolderInput {
  holder_name: string
  holder_email?: string
}

interface Props {
  memberId?: number
  memberName?: string
  memberEmail?: string
  isMember?: boolean
  isOfficer?: boolean
  user?: UserAccount
}

const FONT = { fontFamily: '"TT Firs Neue", sans-serif' }

/* ── Create-event form state ── */
interface NewEventForm {
  title: string
  description: string
  venue: string
  form_url: string
  starts_at: string
  ticket_types: { name: string; description: string; member_price: string; non_member_price: string; seat_limit: string; non_member_seat_limit: string; max_per_member: string; max_per_guest: string }[]
}

const BLANK_EVENT: NewEventForm = {
  title: '', description: '', venue: '', form_url: '', starts_at: '',
  ticket_types: [{ name: 'General', description: '', member_price: '0.00', non_member_price: '10.00', seat_limit: '100', non_member_seat_limit: '20', max_per_member: '', max_per_guest: '' }],
}

export default function EventsPanel({ memberId, memberName = '', memberEmail = '', isMember, isOfficer, user }: Props) {
  const isAdmin = user?.role === 'Admin'
  const [events, setEvents] = useState<Event[]>([])
  const [myTickets, setMyTickets] = useState<MyTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'upcoming' | 'past' | 'mytickets' | 'create'>('upcoming')
  const [purchasing, setPurchasing] = useState<{ typeId: number; eventTitle: string } | null>(null)
  const [holders, setHolders] = useState<TicketHolderInput[]>([{ holder_name: memberName, holder_email: memberEmail }])
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null)
  const [expandedSummary, setExpandedSummary] = useState<number | null>(null)
  const [summaries, setSummaries] = useState<Record<number, { tickets_sold: number; attended: number; ticket_revenue: string }>>({})

  /* create-event form */
  const [newEvent, setNewEvent] = useState<NewEventForm>(BLANK_EVENT)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const ev = await api<Event[]>('/events')
      setEvents(ev)
    } catch (e: any) {
      setError(e?.detail ?? 'Could not reach the backend. Make sure the server is running.')
    }

    if (memberId) {
      try {
        const tickets = await api<MyTicket[]>('/me/tickets')
        setMyTickets(tickets)
      } catch {
        setMyTickets([])
      }
    }
    setLoading(false)
  }, [memberId])

  useEffect(() => { load() }, [load])
  useLiveRefresh(['events', 'dashboard'], load)

  const handlePurchase = async () => {
    if (!purchasing) return
    setError(null)
    try {
      const res = await api<{
        tickets: { ticket_id: number; price_paid: string }[]
        total_amount: string
        requires_payment: boolean
      }>('/tickets/purchase', {
        method: 'POST',
        body: JSON.stringify({ ticket_type_id: purchasing.typeId, holders }),
      })

      const totalVal = parseFloat(res.total_amount)
      if (res.requires_payment && totalVal > 0) {
        // Securely process exact ticket amount via Razorpay
        const ticketIds = res.tickets.map(t => t.ticket_id)
        const userProfile: UserAccount = user || {
          id: String(memberId || 0),
          memberId: memberId || 0,
          name: memberName || 'Student',
          email: memberEmail,
          role: isMember ? 'Member' : 'Guest',
          roles: [],
          isActive: Boolean(isMember),
        }

        await processRazorpayPayment({
          category: 'ticket',
          amount: totalVal.toFixed(2),
          description: `Event Tickets: ${purchasing.eventTitle} (${res.tickets.length} pass${res.tickets.length > 1 ? 'es' : ''})`,
          user: userProfile,
          ticket_ids: ticketIds,
          onSuccess: () => {
            setPurchaseSuccess(`Payment of ₹${totalVal.toFixed(2)} verified via Razorpay! ${res.tickets.length} ticket(s) are active and confirmed in My Tickets.`)
            setTab('mytickets')
            setPurchasing(null)
            setHolders([{ holder_name: memberName, holder_email: '' }])
            load()
            setTimeout(() => setPurchaseSuccess(null), 7000)
          },
          onError: (errMsg) => {
            setError(errMsg)
          },
        })
      } else {
        setPurchaseSuccess(`Tickets for "${purchasing.eventTitle}" reserved successfully!`)
        setTab('mytickets')
        setPurchasing(null)
        setHolders([{ holder_name: memberName, holder_email: '' }])
        load()
        setTimeout(() => setPurchaseSuccess(null), 5000)
      }
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? 'Purchase failed.')
    }
  }

  const loadSummary = async (eventId: number) => {
    if (expandedSummary === eventId) {
      setExpandedSummary(null)
      return
    }
    if (summaries[eventId]) {
      setExpandedSummary(eventId)
      return
    }
    try {
      const s = await api<{ event_id: number; title: string; tickets_sold: number; attended: number; ticket_revenue: string }>(
        `/events/${eventId}/summary`
      )
      setSummaries(prev => ({ ...prev, [eventId]: s }))
      setExpandedSummary(eventId)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the event summary.')
    }
  }

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      await api('/events', {
        method: 'POST',
        body: JSON.stringify({
          title: newEvent.title,
          description: newEvent.description || undefined,
          venue: newEvent.venue || undefined,
          form_url: newEvent.form_url.trim() || undefined,
          starts_at: new Date(newEvent.starts_at).toISOString(),
          ticket_types: newEvent.ticket_types.map(tt => ({
            name: tt.name,
            description: tt.description || undefined,
            member_price: tt.member_price,
            non_member_price: tt.non_member_price,
            seat_limit: parseInt(tt.seat_limit),
            non_member_seat_limit: parseInt(tt.non_member_seat_limit),
            max_per_member: tt.max_per_member ? parseInt(tt.max_per_member) : null,
            max_per_guest: tt.max_per_guest ? parseInt(tt.max_per_guest) : null,
          })),
        }),
      })
      setPurchaseSuccess('Event created successfully!')
      setNewEvent(BLANK_EVENT)
      setTab('upcoming')
      load()
      setTimeout(() => setPurchaseSuccess(null), 4000)
    } catch (e: any) {
      setError(e?.detail ?? 'Failed to create event.')
    } finally {
      setCreating(false)
    }
  }

  const shownEvents = events
    .filter(e => (tab === 'past') === (new Date(e.starts_at).getTime() < Date.now()))
    .sort((a, b) => (tab === 'past' ? new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime() : new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()))

  const allTabs = [
    { key: 'upcoming' as const, label: 'Upcoming Events' },
    { key: 'past' as const, label: 'Past Events' },
    ...(memberId ? [{ key: 'mytickets' as const, label: 'My Tickets' }] : []),
    ...(isOfficer ? [{ key: 'create' as const, label: '+ Create Event' }] : []),
  ]

  return (
    <div style={FONT} className="space-y-5 animate-fadeIn">
      {/* Tab Bar */}
      <div className="flex gap-2 flex-wrap">
        {allTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              tab === t.key
                ? 'bg-[#714B67] text-white shadow-md'
                : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {purchaseSuccess && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{purchaseSuccess}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* ── Create Event Form ── */}
      {tab === 'create' && (
        <form onSubmit={handleCreateEvent} className="space-y-4 p-6 border-b border-neutral-200">
          <h3 className="font-bold text-neutral-900 text-sm">Create New Event</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Event title *" value={newEvent.title}
              onChange={e => setNewEvent(f => ({ ...f, title: e.target.value }))}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs col-span-2" />
            <input placeholder="Venue / Location" value={newEvent.venue}
              onChange={e => setNewEvent(f => ({ ...f, venue: e.target.value }))}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
            <input required type="datetime-local" value={newEvent.starts_at}
              onChange={e => setNewEvent(f => ({ ...f, starts_at: e.target.value }))}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
            <input placeholder="Registration form link, e.g. Google Form (shown as a QR after payment)" value={newEvent.form_url}
              onChange={e => setNewEvent(f => ({ ...f, form_url: e.target.value }))}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs col-span-2" />
            <textarea placeholder="Description" value={newEvent.description} rows={2}
              onChange={e => setNewEvent(f => ({ ...f, description: e.target.value }))}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs resize-none col-span-2" />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-neutral-600 text-xs font-bold uppercase tracking-wider">Ticket Types</p>
              <button type="button" onClick={() => setNewEvent(f => ({ ...f, ticket_types: [...f.ticket_types, { name: '', description: '', member_price: '0.00', non_member_price: '10.00', seat_limit: '50', non_member_seat_limit: '10', max_per_member: '', max_per_guest: '' }] }))}
                className="text-[#714B67] text-xs hover:underline">+ Add type</button>
            </div>
            {newEvent.ticket_types.map((tt, i) => {
              const upd = (idx: number, patch: Partial<typeof tt>) => setNewEvent(f => { const arr = [...f.ticket_types]; arr[idx] = { ...arr[idx], ...patch }; return { ...f, ticket_types: arr } })
              return (
              <div key={i} className="p-3 border-b border-neutral-200 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block text-[10px] font-semibold text-neutral-500">Ticket name
                  <input value={tt.name} placeholder="e.g. General, VIP" onChange={e => upd(i, { name: e.target.value })}
                    className="mt-1 px-2 py-1.5 rounded-lg bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs w-full font-normal" />
                </label>
                <label className="block text-[10px] font-semibold text-neutral-500">Price for members (INR)
                  <input value={tt.member_price} placeholder="0 = free" inputMode="numeric" onChange={e => upd(i, { member_price: e.target.value.replace(/[^0-9.]/g, '') })}
                    className="mt-1 px-2 py-1.5 rounded-lg bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs w-full font-normal" />
                </label>
                <label className="block text-[10px] font-semibold text-neutral-500">Price for non-members (INR)
                  <input value={tt.non_member_price} placeholder="e.g. 250" inputMode="numeric" onChange={e => upd(i, { non_member_price: e.target.value.replace(/[^0-9.]/g, '') })}
                    className="mt-1 px-2 py-1.5 rounded-lg bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs w-full font-normal" />
                </label>
                <label className="block text-[10px] font-semibold text-neutral-500">Total seats
                  <input value={tt.seat_limit} placeholder="e.g. 100" inputMode="numeric" onChange={e => upd(i, { seat_limit: e.target.value.replace(/\D/g, '') })}
                    className="mt-1 px-2 py-1.5 rounded-lg bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs w-full font-normal" />
                </label>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block text-[10px] font-semibold text-neutral-500">Seats open to non-members
                  <input value={tt.non_member_seat_limit} placeholder="0 = members only" inputMode="numeric" onChange={e => upd(i, { non_member_seat_limit: e.target.value.replace(/\D/g, '') })}
                    className="mt-1 px-2 py-1.5 rounded-lg bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs w-full font-normal" />
                </label>
                <label className="block text-[10px] font-semibold text-neutral-500">Max tickets per member
                  <input value={tt.max_per_member} placeholder="blank = no cap" inputMode="numeric" onChange={e => upd(i, { max_per_member: e.target.value.replace(/\D/g, '') })}
                    className="mt-1 px-2 py-1.5 rounded-lg bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs w-full font-normal" />
                </label>
                <label className="block text-[10px] font-semibold text-neutral-500">Max tickets per non-member
                  <input value={tt.max_per_guest} placeholder="blank = no cap" inputMode="numeric" onChange={e => upd(i, { max_per_guest: e.target.value.replace(/\D/g, '') })}
                    className="mt-1 px-2 py-1.5 rounded-lg bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs w-full font-normal" />
                </label>
                </div>
                <label className="block text-[10px] font-semibold text-neutral-500">What this ticket includes (shown to buyers)
                  <input value={tt.description} maxLength={300} placeholder="e.g. Entry plus dinner and a welcome drink" onChange={e => upd(i, { description: e.target.value })}
                    className="mt-1 px-2 py-1.5 rounded-lg bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs w-full font-normal" />
                </label>
              </div>
              )
            })}
          </div>

          <button type="submit" disabled={creating}
            className="px-6 py-2.5 rounded-xl bg-[#714B67] text-white font-bold text-xs hover:bg-[#5d3d54] transition disabled:opacity-40">
            {creating ? 'Creating...' : 'Create Event'}
          </button>
        </form>
      )}

      {/* ── Loading ── */}
      {tab !== 'create' && loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#714B67] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Upcoming Events ── */}
      {(tab === 'upcoming' || tab === 'past') && !loading && (
        shownEvents.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-12">{tab === 'past' ? 'No past events yet.' : 'No upcoming events yet.'}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shownEvents.map(ev => {
              const date = new Date(ev.starts_at)
              const isPast = date.getTime() < Date.now()
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
              const sum = summaries[ev.event_id]

              return (
                <div key={ev.event_id} className=" p-5 transition-all border-b border-neutral-200">
                  <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                    <div>
                      <h3 className="font-bold text-neutral-900 text-sm leading-snug">{ev.title}</h3>
                      <p className="text-neutral-500 text-xs mt-0.5">{dateStr} · {timeStr}</p>
                      {ev.venue && <p className="text-neutral-500 text-xs">{ev.venue}</p>}
                    </div>
                    <a
                      href={buildGoogleCalendarUrl(ev.title, ev.starts_at, ev.venue, ev.description)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-[#714B67] hover:text-white text-neutral-700 text-[11px] font-bold transition no-underline shadow-sm"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Add to Google Calendar
                    </a>
                  </div>
                  {ev.description && <p className="text-neutral-500 text-xs leading-relaxed mb-3 line-clamp-2">{ev.description}</p>}

                  {/* Ticket types */}
                  <div className="space-y-2 mb-3">
                    {ev.ticket_types.map(tt => {
                      const memberOnly = tt.non_member_seat_limit === 0
                      const locked = memberOnly && !isMember
                      const price = isMember ? tt.member_price : tt.non_member_price
                      const seatsLeft = isMember ? tt.seats_left : tt.non_member_seats_left
                      const sold = seatsLeft === 0

                      return (
                        <div key={tt.ticket_type_id} className="flex items-center justify-between text-xs">
                          <span className={locked ? 'text-neutral-400' : 'text-neutral-700'}>
                            {tt.description && <span className="block text-[10px] text-neutral-500 mb-0.5">{tt.description}</span>}
                            {tt.name}{locked ? ' (Members only)' : ''}{(isMember ? tt.max_per_member : tt.max_per_guest) ? ` · max ${isMember ? tt.max_per_member : tt.max_per_guest} per person` : ''}{sold && !locked ? ' — Sold out' : ''}
                          </span>
                          {memberId && !locked && !sold && !isPast && purchasing?.typeId === tt.ticket_type_id ? (
                            <div className="flex flex-col gap-2 w-full mt-2">
                              {holders.map((h, hi) => (
                                <div key={hi} className="flex gap-2">
                                  <input value={h.holder_name} onChange={e => { const a = [...holders]; a[hi] = { ...a[hi], holder_name: e.target.value }; setHolders(a) }}
                                    placeholder="Name *" className="flex-1 px-2 py-1 rounded-lg bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 text-xs" />
                                  <input value={h.holder_email ?? ''} onChange={e => { const a = [...holders]; a[hi] = { ...a[hi], holder_email: e.target.value }; setHolders(a) }}
                                    placeholder="Email" className="flex-1 px-2 py-1 rounded-lg bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 text-xs" />
                                </div>
                              ))}
                              <div className="flex gap-2">
                                <button onClick={() => setHolders(h => [...h, { holder_name: '', holder_email: '' }])}
                                  className="text-[#714B67] text-xs hover:underline">+ Add person</button>
                                <button onClick={handlePurchase}
                                  className="px-3 py-1 rounded-lg bg-[#714B67] text-white font-bold text-xs hover:bg-[#5d3d54] transition">
                                  Confirm
                                </button>
                                <button onClick={() => setPurchasing(null)} className="text-neutral-500 hover:text-neutral-900 p-1 rounded">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            memberId && !locked && !sold && !isPast ? (
                              <button onClick={() => { setPurchasing({ typeId: tt.ticket_type_id, eventTitle: ev.title }); setHolders([{ holder_name: memberName, holder_email: memberEmail }]) }}
                                className="px-3 py-1 rounded-lg bg-[#714B67]/20 text-[#714B67] border border-[#714B67]/30 font-bold text-xs hover:bg-[#714B67] hover:text-white transition">
                                {parseFloat(price) === 0 ? 'Free RSVP' : `Buy · ₹${price}`}
                              </button>
                            ) : (
                              <span className="text-neutral-400">
                                {isPast ? 'Ended' : sold ? 'Sold out' : locked ? 'Members only' : `₹${price}`}
                              </span>
                            )
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Officer: revenue summary */}
                  {isOfficer && (
                    <details className="border-t border-neutral-200 pt-2 mt-2">
                    <summary className="cursor-pointer text-[11px] font-semibold text-[#714B67] select-none">Manage event: prices, limits, QR, form link, delete</summary>
                    <div className="pt-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-4 text-[11px]">
                        <a href={`${API_BASE}/events/${ev.event_id}/qr.png`} download={`event-${ev.event_id}-qr.png`} target="_blank" rel="noreferrer"
                          className="text-[#714B67] font-semibold hover:underline">Event QR (poster)</a>
                        <button onClick={async () => {
                          if (!window.confirm(`Delete "${ev.title}"? This cannot be undone.`)) return
                          try {
                            await api(`/events/${ev.event_id}${isAdmin ? '?force=true' : ''}`, { method: 'DELETE' })
                            setPurchaseSuccess('Event deleted.'); setTimeout(() => setPurchaseSuccess(null), 3000); load()
                          } catch (e: any) { setError(e?.message ?? 'Could not delete the event.') }
                        }} className="inline-flex items-center gap-1 text-rose-700 font-semibold hover:underline bg-transparent border-none cursor-pointer p-0"><Trash2 className="w-3 h-3" />Delete event</button>
                        <span className="inline-flex items-center gap-1">
                          <input id={`fu-${ev.event_id}`} placeholder="Registration form link" className="w-48 px-2 py-1 rounded-md border border-neutral-300 bg-white text-[11px]" />
                          <button onClick={async () => {
                            const v = (document.getElementById(`fu-${ev.event_id}`) as HTMLInputElement).value
                            try {
                              await api(`/events/${ev.event_id}/form`, { method: 'PATCH', body: JSON.stringify({ form_url: v }) })
                              setPurchaseSuccess(v.trim() ? 'Registration form link saved.' : 'Registration form link removed.'); setTimeout(() => setPurchaseSuccess(null), 3000)
                            } catch (e: any) { setError(e?.message ?? 'Could not save the link.') }
                          }} className="px-2 py-1 rounded-md bg-[#714B67] text-white text-[10px] font-semibold border-none cursor-pointer">Save form link</button>
                        </span>
                        <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/#event/${ev.event_id}`)}
                          className="text-[#714B67] font-semibold hover:underline bg-transparent border-none cursor-pointer p-0">Copy event link</button>
                      </div>
                      {ev.ticket_types.map(tt => (
                        <div key={tt.ticket_type_id} className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-600">
                          <span className="w-24 truncate font-semibold">{tt.name}</span>
                          <span>member Rs</span>
                          <input inputMode="decimal" onInput={e => { e.currentTarget.value = money(e.currentTarget.value) }} defaultValue={tt.member_price} id={`pm-${tt.ticket_type_id}`} className="w-16 px-2 py-1 rounded-md border border-neutral-300 bg-white text-xs" />
                          <span>guest Rs</span>
                          <input inputMode="decimal" onInput={e => { e.currentTarget.value = money(e.currentTarget.value) }} defaultValue={tt.non_member_price} id={`pg-${tt.ticket_type_id}`} className="w-16 px-2 py-1 rounded-md border border-neutral-300 bg-white text-xs" />
                          <input defaultValue={tt.description ?? ''} placeholder="Description" maxLength={300} id={`pd-${tt.ticket_type_id}`} className="flex-1 min-w-[160px] px-2 py-1 rounded-md border border-neutral-300 bg-white text-xs" />
                          <button onClick={async () => {
                            const v = (id: string) => (document.getElementById(`${id}-${tt.ticket_type_id}`) as HTMLInputElement).value
                            try {
                              await api(`/ticket-types/${tt.ticket_type_id}`, { method: 'PATCH', body: JSON.stringify({ member_price: v('pm'), non_member_price: v('pg'), description: v('pd') }) })
                              setPurchaseSuccess('Ticket details saved.'); setTimeout(() => setPurchaseSuccess(null), 3000); load()
                            } catch (e: any) { setError(e?.message ?? 'Could not save the ticket.') }
                          }} className="px-2.5 py-1 rounded-md bg-[#714B67] text-white text-[10px] font-semibold border-none cursor-pointer">Save price and description</button>
                          <span className="basis-full" />
                          <span>per member</span>
                          <input inputMode="numeric" onInput={e => { e.currentTarget.value = digits(e.currentTarget.value) }} defaultValue={tt.max_per_member ?? ''} placeholder="none" id={`lm-${tt.ticket_type_id}`} className="w-14 px-2 py-1 rounded-md border border-neutral-300 bg-white text-xs" />
                          <span>per guest</span>
                          <input inputMode="numeric" onInput={e => { e.currentTarget.value = digits(e.currentTarget.value) }} defaultValue={tt.max_per_guest ?? ''} placeholder="none" id={`lg-${tt.ticket_type_id}`} className="w-14 px-2 py-1 rounded-md border border-neutral-300 bg-white text-xs" />
                          <button onClick={async () => {
                            const m = (document.getElementById(`lm-${tt.ticket_type_id}`) as HTMLInputElement).value
                            const g = (document.getElementById(`lg-${tt.ticket_type_id}`) as HTMLInputElement).value
                            try {
                              await api(`/ticket-types/${tt.ticket_type_id}/limits`, { method: 'PATCH', body: JSON.stringify({ max_per_member: m ? parseInt(m) : null, max_per_guest: g ? parseInt(g) : null }) })
                              setPurchaseSuccess('Purchase limits saved.'); setTimeout(() => setPurchaseSuccess(null), 3000); load()
                            } catch (e: any) { setError(e?.message ?? 'Could not save limits.') }
                          }} className="px-2.5 py-1 rounded-md bg-[#714B67] text-white text-[10px] font-semibold border-none cursor-pointer">Save limits</button>
                        </div>
                      ))}
                      {expandedSummary === ev.event_id && sum ? (
                        <div className="flex gap-4 text-xs p-2 border-b border-neutral-200">
                          <span className="text-neutral-600">Sold: <b className="text-neutral-900">{sum.tickets_sold}</b></span>
                          <span className="text-neutral-600">Attended: <b className="text-neutral-900">{sum.attended}</b></span>
                          <span className="text-neutral-600">Revenue: <b className="text-emerald-700">₹{sum.ticket_revenue}</b></span>
                          <button onClick={() => setExpandedSummary(null)} className="text-neutral-500 hover:text-neutral-900 ml-auto text-[10px] underline">hide</button>
                        </div>
                      ) : (
                        <button onClick={() => loadSummary(ev.event_id)} className="text-[#714B67] text-[10px] font-semibold hover:underline">
                          View summary ▾
                        </button>
                      )}
                    </div>
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── My Tickets ── */}
      {tab === 'mytickets' && !loading && (
        myTickets.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-12">No tickets yet. Pick an event to get one.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-2">
            {myTickets.map(tk => (
              <div key={tk.ticket_id} className="flex gap-4 py-5 border-b border-neutral-200">
                <img src={ticketQrUrl(tk.ticket_code, tk.qr_payload)} alt="Ticket QR" width={96} height={96}
                  className={`w-24 h-24 shrink-0 ${tk.is_valid && !tk.checked_in_at ? '' : 'opacity-30'}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{tk.event_title ?? `Ticket #${tk.ticket_id}`}</p>
                  <p className="text-neutral-500 text-xs">{tk.holder_name} · {tk.ticket_type_name}</p>
                  {tk.event_starts_at && <p className="text-neutral-500 text-xs">{new Date(tk.event_starts_at).toLocaleString()}</p>}
                  <p className="text-xs mt-1">Code <span className="font-mono font-semibold">{tk.manual_code}</span> · ₹{tk.price_paid}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                      tk.checked_in_at ? 'border-neutral-300 text-neutral-500' : tk.is_valid ? 'border-emerald-200 text-emerald-700' : 'border-amber-300 text-amber-700'
                    }`}>{tk.checked_in_at ? 'Used' : tk.is_valid ? 'Valid' : 'Awaiting payment'}</span>
                    {!tk.is_valid && !tk.checked_in_at && parseFloat(tk.price_paid) > 0 && (
                      <button
                        onClick={() => processRazorpayPayment({
                          category: 'ticket', amount: parseFloat(tk.price_paid).toFixed(2), description: `Ticket: ${tk.event_title ?? ''}`,
                          user: user || { id: String(memberId), memberId: memberId ?? 0, name: memberName, email: memberEmail, role: isMember ? 'Member' : 'Guest', roles: [], isActive: !!isMember },
                          ticket_ids: [tk.ticket_id],
                          onSuccess: () => { setPurchaseSuccess('Payment received. Your ticket is valid.'); load(); setTimeout(() => setPurchaseSuccess(null), 5000) },
                          onError: m => setError(m),
                        })}
                        className="px-3 py-1 rounded-md bg-[#714B67] text-white text-[10px] font-semibold border-none cursor-pointer">Pay now</button>
                    )}
                    {tk.is_valid && tk.event_id != null && <EventFormAccess eventId={tk.event_id} />}
                    <a href={ticketPdfUrl(tk.ticket_code, tk.qr_payload)} download
                      className="text-xs font-semibold text-[#714B67] hover:underline">Download PDF</a>
                    {tk.event_starts_at && (
                      <a
                        href={buildGoogleCalendarUrl(tk.event_title ?? 'Skyline Event', tk.event_starts_at, tk.venue)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-neutral-700 hover:text-[#714B67] hover:underline flex items-center gap-1 no-underline"
                      >
                        <Calendar className="w-3 h-3 text-[#714B67]" /> Calendar
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
