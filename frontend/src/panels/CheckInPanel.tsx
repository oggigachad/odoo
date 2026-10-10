import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, Camera, CameraOff, WifiOff, RefreshCw } from 'lucide-react'
import jsQR from 'jsqr'
import { api, errorMessage } from '../apiClient'
import { useLiveRefresh } from '../useRealtimeUpdates'
import { downloadManifest, offlineAdmit, getQueue, syncQueue } from '../offlineCheckin'

interface EventItem { event_id: number; title: string; venue?: string }
interface CheckInResponse { status: string; ticket_code: string; holder_name: string; event_title: string; checked_in_at: string; is_member?: boolean; membership_type?: string | null; member_valid_until?: string | null }
interface LogEntry { at: string; name: string; ok: boolean; note: string }

const FONT = { fontFamily: '"TT Firs Neue", sans-serif' }

export default function CheckInPanel(_props: { memberId: number }) {
  const [events, setEvents] = useState<EventItem[]>([])
  const [eventId, setEventId] = useState(0)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const [queued, setQueued] = useState(0)
  const [cached, setCached] = useState<number | null>(null)
  const [camera, setCamera] = useState<'off' | 'on' | 'denied'>('off')
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastScan = useRef<{ v: string; t: number }>({ v: '', t: 0 })
  const eventIdRef = useRef(0)
  eventIdRef.current = eventId

  const push = (e: Omit<LogEntry, 'at'>) =>
    setLog(l => [{ at: new Date().toLocaleTimeString(), ...e }, ...l].slice(0, 12))

  const loadEvents = useCallback(async () => {
    try {
      const evs = await api<EventItem[]>('/events')
      setEvents(evs)
      setEventId(cur => cur || evs[0]?.event_id || 0)
    } catch { /* offline: keep what we have */ }
  }, [])
  useEffect(() => { loadEvents() }, [loadEvents])
  useLiveRefresh(['events'], loadEvents)

  const refreshQueue = useCallback(async () => setQueued((await getQueue()).length), [])

  // Pre-download the signed attendee manifest so scanning keeps working with no signal
  const cacheManifest = useCallback(async () => {
    if (!eventIdRef.current || !navigator.onLine) return
    try { setCached((await downloadManifest(eventIdRef.current)).tickets.length) } catch { /* keep old cache */ }
  }, [])
  useEffect(() => { cacheManifest() }, [eventId, cacheManifest])
  useLiveRefresh(['events'], cacheManifest)

  const flush = useCallback(async () => {
    if (!navigator.onLine) return
    try {
      const r = await syncQueue()
      if (r.synced) push({ name: `${r.synced} offline scan(s)`, ok: true, note: 'Synced to server' })
      r.conflicts.forEach(c => push({ name: c.name, ok: false, note: `Sync conflict: ${c.message}` }))
    } catch { /* retry on next tick */ }
    refreshQueue()
  }, [refreshQueue])

  useEffect(() => {
    const on = () => { setOnline(true); flush(); cacheManifest() }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    refreshQueue(); flush()
    const t = setInterval(flush, 30000)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t) }
  }, [flush, cacheManifest, refreshQueue])

  const admit = useCallback(async (value: string) => {
    const id = eventIdRef.current
    if (!value.trim() || !id) return
    setBusy(true)
    try {
      if (navigator.onLine) {
        try {
          const res = await api<CheckInResponse>('/checkin', { method: 'POST', body: JSON.stringify({ ticket_code: value.trim(), event_id: id }) })
          push({ name: res.holder_name, ok: true, note: `Admitted · ${res.event_title} · ${res.is_member ? `Member (${res.membership_type ?? 'active'}${res.member_valid_until ? `, valid until ${res.member_valid_until}` : ''})` : 'Not a member (non-member price applies)'}` })
          return
        } catch (e: any) {
          if (e?.status !== 0) { push({ name: value.slice(0, 18), ok: false, note: errorMessage(e, 'Check-in denied') }); return }
          // status 0 = network dropped mid-request: fall through to offline mode
        }
      }
      const r = await offlineAdmit(id, value)
      if (r.ok) push({ name: r.ticket.holder_name, ok: true, note: `Admitted offline · ${r.ticket.is_member ? `Member (${r.ticket.membership_type ?? 'active'})` : 'Not a member'} · will sync` })
      else push({ name: value.slice(0, 18), ok: false, note: r.reason })
      refreshQueue()
    } finally { setBusy(false) }
  }, [refreshQueue])

  // Camera QR scanning
  useEffect(() => {
    if (camera !== 'on') return
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const tick = () => {
      const v = videoRef.current
      if (stopped || !v) return
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        canvas.width = v.videoWidth; canvas.height = v.videoHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(v, 0, 0)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const hit = jsQR(img.data, img.width, img.height)
        const now = Date.now()
        if (hit?.data && !(hit.data === lastScan.current.v && now - lastScan.current.t < 4000)) {
          lastScan.current = { v: hit.data, t: now }
          admit(hit.data)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => {
        if (stopped) { s.getTracks().forEach(t => t.stop()); return }
        stream = s
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}) }
        raf = requestAnimationFrame(tick)
      })
      .catch(() => setCamera('denied')) // e.g. plain-http LAN address: use manual entry below (ISSUE-006)
    if (!navigator.mediaDevices) setCamera('denied')
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()) }
  }, [camera, admit])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await admit(code)
    setCode('')
  }

  return (
    <div style={FONT} className="max-w-xl mx-auto space-y-6 animate-fadeIn">
      <div className="text-center">
        <h2 className="font-semibold text-lg">Event door check-in</h2>
        <p className="text-neutral-500 text-xs mt-1">Scan the ticket QR or type the 8-character manual code.</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 text-[11px]">
        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${online ? 'border-emerald-200 text-emerald-700' : 'border-amber-300 text-amber-700'}`}>
          {online ? <Check className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{online ? 'Online' : 'Offline mode'}
        </span>
        <span className="text-neutral-500">{cached === null ? 'Attendee list not cached yet' : `${cached} tickets cached for offline`}</span>
        {queued > 0 && (
          <button onClick={flush} className="flex items-center gap-1 text-[#714B67] font-semibold bg-transparent border-none cursor-pointer">
            <RefreshCw className="w-3 h-3" />{queued} waiting to sync
          </button>
        )}
      </div>

      <select value={eventId} onChange={e => setEventId(Number(e.target.value))}
        className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 bg-white text-sm focus:outline-none focus:border-[#714B67]">
        {events.length === 0 && <option value={0}>No events yet. Create one in Events first.</option>}
        {events.map(ev => <option key={ev.event_id} value={ev.event_id}>{ev.title}{ev.venue ? ` (${ev.venue})` : ''}</option>)}
      </select>

      <div>
        {camera === 'on' ? (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-8 border-2 border-white/80 rounded-xl pointer-events-none" />
            <button onClick={() => setCamera('off')} className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-white text-neutral-900 text-xs font-semibold border-none cursor-pointer">Stop camera</button>
          </div>
        ) : (
          <button onClick={() => setCamera('on')} disabled={!eventId}
            className="w-full py-3 rounded-lg border border-dashed border-neutral-300 hover:border-[#714B67] bg-white text-sm text-neutral-700 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40">
            {camera === 'denied' ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            {camera === 'denied' ? 'Camera unavailable (needs HTTPS or localhost). Use manual entry.' : 'Start camera scanner'}
          </button>
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input value={code} onChange={e => setCode(e.target.value)} autoComplete="off" placeholder="Manual code, e.g. A1B2C3D4"
          className="flex-1 px-4 py-3 rounded-lg border border-neutral-300 bg-white text-sm font-mono tracking-wider focus:outline-none focus:border-[#714B67]" />
        <button disabled={busy || !code.trim() || !eventId} className="px-6 rounded-lg bg-[#714B67] text-white text-xs font-semibold border-none cursor-pointer disabled:opacity-40">
          {busy ? '…' : 'Admit'}
        </button>
      </form>

      {log.length > 0 && (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-200">
          {log.map((l, i) => (
            <li key={i} className="py-2.5 flex items-start justify-between gap-3 text-xs">
              <span><b className={l.ok ? 'text-emerald-700' : 'text-rose-700'}>{l.name}</b><span className="block text-neutral-500">{l.note}</span></span>
              <span className="text-neutral-400 shrink-0">{l.at}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
