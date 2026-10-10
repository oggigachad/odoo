/**
 * Offline door check-in store (IndexedDB).
 *
 * - `manifest`: per-event attendee list downloaded while online. Each entry carries the server-signed
 *   QR payload, so an offline scan is verified against the signature the server issued.
 * - `queue`: admissions captured offline, replayed through POST /checkin/batch when connectivity returns.
 */
import { api } from './apiClient'

export interface ManifestTicket {
  ticket_code: string
  qr_payload: string
  manual_code: string
  holder_name: string
  is_member?: boolean
  membership_type?: string | null
  ticket_type_name: string
  checked_in: boolean
}
export interface Manifest { event_id: number; title: string; generated_at: string; tickets: ManifestTicket[] }
export interface QueuedScan { id?: number; event_id: number; ticket_code: string; scanned_at: string; holder_name: string }

const DB = 'skyline_checkin'
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore('manifest', { keyPath: 'event_id' })
      db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const r = fn(db.transaction(store, mode).objectStore(store))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  }))
}

export async function downloadManifest(eventId: number): Promise<Manifest> {
  const m = await api<Manifest>(`/events/${eventId}/manifest`)
  await tx('manifest', 'readwrite', s => s.put(m))
  return m
}
export const getManifest = (eventId: number) => tx<Manifest | undefined>('manifest', 'readonly', s => s.get(eventId))
export const saveManifest = (m: Manifest) => tx('manifest', 'readwrite', s => s.put(m))
export const queueScan = (q: QueuedScan) => tx('queue', 'readwrite', s => s.add(q))
export const getQueue = () => tx<QueuedScan[]>('queue', 'readonly', s => s.getAll())
export const removeQueued = (id: number) => tx('queue', 'readwrite', s => s.delete(id))

export type OfflineResult =
  | { ok: true; ticket: ManifestTicket }
  | { ok: false; reason: string }

/** Verify a scanned/typed value against the cached manifest; marks it admitted locally and queues the sync. */
export async function offlineAdmit(eventId: number, raw: string): Promise<OfflineResult> {
  const m = await getManifest(eventId)
  if (!m) return { ok: false, reason: 'No offline data for this event. Connect once to download the attendee list.' }
  const v = raw.trim()
  const t = m.tickets.find(x =>
    x.qr_payload === v || x.ticket_code === v.toLowerCase() || x.manual_code === v.toUpperCase())
  if (!t) return { ok: false, reason: 'Ticket not found for this event (or QR is not a genuine Skyline ticket).' }
  if (t.checked_in) return { ok: false, reason: `${t.holder_name} has already been checked in.` }
  t.checked_in = true
  await saveManifest(m)
  await queueScan({ event_id: eventId, ticket_code: t.qr_payload, scanned_at: new Date().toISOString(), holder_name: t.holder_name })
  return { ok: true, ticket: t }
}

/** Replay queued scans. Returns per-scan failures the staff should know about. */
export async function syncQueue(): Promise<{ synced: number; conflicts: { name: string; message: string }[] }> {
  const queue = await getQueue()
  let synced = 0
  const conflicts: { name: string; message: string }[] = []
  const byEvent = new Map<number, QueuedScan[]>()
  queue.forEach(q => byEvent.set(q.event_id, [...(byEvent.get(q.event_id) ?? []), q]))
  for (const [event_id, scans] of byEvent) {
    const res = await api<{ results: { ok: boolean; message?: string }[] }>('/checkin/batch', {
      method: 'POST',
      body: JSON.stringify({ event_id, scans: scans.map(s => ({ ticket_code: s.ticket_code, scanned_at: s.scanned_at })) }),
    })
    for (let i = 0; i < scans.length; i++) {
      await removeQueued(scans[i].id!)
      if (res.results[i]?.ok) synced++
      else conflicts.push({ name: scans[i].holder_name, message: res.results[i]?.message ?? 'Rejected' })
    }
  }
  return { synced, conflicts }
}
