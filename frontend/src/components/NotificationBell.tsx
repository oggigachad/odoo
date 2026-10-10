import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, BellRing, Calendar, Megaphone, CreditCard, Award } from 'lucide-react'
import { api } from '../apiClient'
import { useLiveRefresh } from '../useRealtimeUpdates'

interface Item { id: number; kind: string; title: string; body: string | null; link: string | null; created_at: string; read: boolean }

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  announcement: Megaphone, renewal: Award, event: Calendar, payment: CreditCard,
}
const PREF_KEY = 'skyline_os_notifications'

function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * The bell: live notifications from the server (announcements, renewal and event reminders, payments).
 * When the member switches on "Desktop alerts", new items also pop up as real operating-system notifications,
 * even while the tab is in the background.
 */
export default function NotificationBell({ onOpenLink }: { onOpenLink?: (link: string) => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [osOn, setOsOn] = useState<boolean>(() => {
    try { return localStorage.getItem(PREF_KEY) === '1' && 'Notification' in window && Notification.permission === 'granted' } catch { return false }
  })
  const seen = useRef<Set<number> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api<{ unread: number; items: Item[] }>('/notifications')
      if (seen.current === null) {
        seen.current = new Set(res.items.map(i => i.id)) // first load: do not replay history as pop-ups
      } else {
        for (const it of res.items) {
          if (!seen.current.has(it.id)) {
            seen.current.add(it.id)
            if (!it.read && osOn && 'Notification' in window && Notification.permission === 'granted') {
              const n = new Notification(it.title, { body: it.body ?? undefined, icon: '/icon-192.png', tag: `skyline-${it.id}` })
              n.onclick = () => { window.focus(); setOpen(true); n.close() }
            }
          }
        }
      }
      setItems(res.items)
      setUnread(res.unread)
    } catch { /* keep what we have */ }
  }, [osOn])

  useEffect(() => { load() }, [load])
  useLiveRefresh(['notifications', 'announcements'], load)

  const toggleOs = async () => {
    if (!('Notification' in window)) return
    if (osOn) {
      setOsOn(false)
      try { localStorage.setItem(PREF_KEY, '0') } catch { /* noop */ }
      return
    }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (perm === 'granted') {
      setOsOn(true)
      try { localStorage.setItem(PREF_KEY, '1') } catch { /* noop */ }
      new Notification('Desktop alerts are on', { body: 'You will be notified about announcements, renewals and events.', icon: '/icon-192.png' })
    }
  }

  const markAll = async () => {
    await api('/notifications/read', { method: 'POST', body: JSON.stringify({}) }).catch(() => {})
    load()
  }

  const canOs = typeof window !== 'undefined' && 'Notification' in window

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="relative p-2 rounded-lg bg-transparent hover:bg-neutral-100 border-none cursor-pointer text-neutral-700">
        {unread > 0 ? <BellRing className="w-4 h-4 text-[#714B67]" /> : <Bell className="w-4 h-4" />}
        {unread > 0 && <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-600 text-white text-[9px] font-semibold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-[22rem] max-w-[92vw] bg-white border border-neutral-200 rounded-2xl shadow-[0_18px_50px_rgba(0,0,0,0.18)] z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
              <p className="text-xs font-semibold">Notifications</p>
              {unread > 0 && <button onClick={markAll} className="text-[11px] text-[#714B67] font-semibold bg-transparent border-none cursor-pointer">Mark all read</button>}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? <p className="px-4 py-8 text-xs text-neutral-500 text-center">You are all caught up.</p> : items.map(n => {
                const Icon = ICONS[n.kind] ?? Bell
                return (
                  <button key={n.id} onClick={() => { setOpen(false); if (n.link && onOpenLink) onOpenLink(n.link); api('/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [n.id] }) }).then(load).catch(() => {}) }}
                    className={`w-full text-left px-4 py-3 border-none border-b border-neutral-100 cursor-pointer flex gap-3 ${n.read ? 'bg-white' : 'bg-[#714B67]/5'} hover:bg-neutral-50`}>
                    <Icon className="w-4 h-4 mt-0.5 text-[#714B67] shrink-0" />
                    <span className="min-w-0">
                      <span className={`block text-xs ${n.read ? 'font-medium' : 'font-semibold'} truncate`}>{n.title}</span>
                      {n.body && <span className="block text-[11px] text-neutral-600 line-clamp-2">{n.body}</span>}
                      <span className="block text-[10px] text-neutral-400 mt-0.5">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            {canOs && (
              <label className="px-4 py-3 border-t border-neutral-200 flex items-center justify-between text-xs cursor-pointer">
                <span>Desktop alerts <span className="text-neutral-400">(real notifications)</span></span>
                <input type="checkbox" checked={osOn} onChange={toggleOs} className="accent-[#714B67] w-4 h-4" />
              </label>
            )}
          </div>
        </>
      )}
    </div>
  )
}
