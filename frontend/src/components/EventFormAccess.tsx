import { useState } from 'react'
import { ClipboardList, ExternalLink } from 'lucide-react'
import { api, API_BASE, getToken } from '../apiClient'

/** After paying, ticket holders get the organiser's registration link (e.g. a Google Form) as a button and a QR code. */
export default function EventFormAccess({ eventId }: { eventId: number }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const toggle = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (url) return
    try {
      const data = await api<{ url: string }>(`/events/${eventId}/form`)
      setUrl(data.url)
      const res = await fetch(`${API_BASE}/events/${eventId}/form-qr.png`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` }, credentials: 'include' })
      if (res.ok) setQr(URL.createObjectURL(await res.blob()))
    } catch (e: any) {
      setMsg(e?.message ?? 'No registration form for this event.')
    }
  }

  return (
    <div className="w-full">
      <button onClick={toggle} className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-[#714B67] bg-transparent border-none cursor-pointer p-0">
        <ClipboardList className="w-3 h-3 text-[#714B67]" />Registration form
      </button>
      {open && (
        <div className="mt-2 flex items-center gap-3">
          {qr && <img src={qr} alt="Registration form QR" className="w-24 h-24" />}
          {url
            ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#714B67] hover:underline">Open form <ExternalLink className="w-3 h-3" /></a>
            : <span className="text-xs text-neutral-500">{msg ?? 'Loading...'}</span>}
        </div>
      )}
    </div>
  )
}
