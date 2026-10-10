import { useState, useEffect, useCallback } from 'react'
import { Check, X, Megaphone, Bell, Calendar, User } from 'lucide-react'
import { api } from '../apiClient'
import { useLiveRefresh } from '../useRealtimeUpdates'

interface Announcement {
  announcement_id?: number
  id?: number
  title: string
  body: string
  posted_at?: string
  created_at?: string
  author_name?: string
}

const FONT = { fontFamily: '"TT Firs Neue", sans-serif' }

export default function AnnouncementsPanel({ isOfficer }: { isOfficer?: boolean }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [form, setForm] = useState({ title: '', body: '' })
  const [submitting, setSubmitting] = useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null)

  const [emailNotice, setEmailNotice] = useState<string | null>(null)
  const [sendEmail, setSendEmail] = useState(true)

  const load = useCallback(async () => {
    try {
      setAnnouncements(await api<Announcement[]>('/announcements'))
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load announcements.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useLiveRefresh(['announcements'], load)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.body.trim()) { setError('Title and body are required.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await api<Announcement & { email_status?: string }>('/announcements', {
        method: 'POST',
        body: JSON.stringify({ ...form, send_email: sendEmail }),
      })
      setSuccessMsg('Announcement published.')
      setEmailNotice(
        res.email_status === 'skipped_smtp_unconfigured'
          ? 'Announcement published, outbound SMTP queue skipped (SMTP credentials not configured).'
          : res.email_status === 'skipped_queue_unavailable'
          ? 'Announcement published, but the email queue is unavailable right now.'
          : res.email_status === 'queued' ? 'Emails are being delivered to all members.' : null,
      )
      setComposing(false)
      setForm({ title: '', body: '' })
      load()
      setTimeout(() => { setSuccessMsg(null); setEmailNotice(null) }, 8000)
    } catch (err: any) {
      setError(err?.message ?? 'Could not publish the announcement.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={FONT} className="space-y-4 animate-fadeIn">
      {/* Officer compose button */}
      {isOfficer && !composing && (
        <div className="flex justify-between items-center p-4 border-b border-neutral-200">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[#714B67]" />
              Official Broadcasts
            </h3>
            <p className="text-[11px] text-neutral-500">Keep student club members notified of vital updates</p>
          </div>
          <button
            onClick={() => setComposing(true)}
            className="px-4 py-2 rounded-xl bg-[#714B67] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#5d3d54] transition shadow-lg"
          >
            + New Announcement
          </button>
        </div>
      )}

      {/* Compose form */}
      {composing && (
        <form
          onSubmit={handleSubmit}
          className=" p-5 space-y-3 border-b border-neutral-200"
        >
          <h3 className="font-bold text-neutral-900 text-sm flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-700" />
            Broadcast to all members
          </h3>
          <input
            type="text"
            required
            placeholder="Subject / Title *"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs"
          />
          <textarea
            required
            placeholder="Announcement body..."
            rows={4}
            value={form.body}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs resize-none"
          />
          <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="accent-[#714B67]" />
            Also email every registered member
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-[#714B67] text-white text-xs font-bold hover:bg-[#5d3d54] transition disabled:opacity-40"
            >
              {submitting ? 'Sending...' : 'Broadcast'}
            </button>
            <button
              type="button"
              onClick={() => { setComposing(false); setForm({ title: '', body: '' }) }}
              className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-600 text-xs font-bold hover:text-neutral-900 hover:bg-neutral-100 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {emailNotice && (
        <div className="px-3 py-2 rounded-full border border-amber-300 text-amber-700 text-[11px] font-medium inline-block">{emailNotice}</div>
      )}
      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#714B67] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : announcements.length === 0 ? (
        <p className="text-neutral-500 text-sm text-center py-12">No announcements yet.</p>
      ) : (
        <div className="space-y-3">
          {announcements.map((a, idx) => {
            const id = a.announcement_id || a.id || idx
            const rawDate = a.posted_at || a.created_at || new Date().toISOString()
            const dateStr = new Date(rawDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })

            return (
              <div
                key={id}
                onClick={() => setSelectedAnnouncement(a)}
                className=" p-5 transition-all cursor-pointer group border-b border-neutral-200"
              >
                <div className="flex justify-between items-start gap-3 mb-2">
                  <h3 className="font-bold text-neutral-900 text-sm group-hover:text-[#714B67] transition-colors flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
                    {a.title}
                  </h3>
                  <span className="text-[11px] text-neutral-500 whitespace-nowrap flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-neutral-500" />
                    {dateStr}
                  </span>
                </div>
                <p className="text-neutral-700 text-xs leading-relaxed line-clamp-2">
                  {a.body}
                </p>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-neutral-200 text-[11px]">
                  <span className="text-neutral-500 flex items-center gap-1">
                    <User className="w-3 h-3 text-neutral-500" />
                    {a.author_name ? a.author_name : 'Executive Board'}
                  </span>
                  <span className="text-[#714B67] group-hover:underline font-semibold">
                    Read announcement →
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full-screen Announcement Modal */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
          <div className="bg-white border border-neutral-300 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl relative text-left">
            <button
              onClick={() => setSelectedAnnouncement(null)}
              className="absolute top-5 right-5 p-2 rounded-full bg-neutral-100 hover:bg-neutral-100 text-neutral-700 hover:text-neutral-900 transition cursor-pointer border-none"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-xs text-[#714B67] font-bold uppercase tracking-wider mb-2">
              <Megaphone className="w-4 h-4" />
              <span>Campus Announcement</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-neutral-900 leading-snug mb-3">
              {selectedAnnouncement.title}
            </h2>

            <div className="flex items-center gap-4 text-xs text-neutral-500 mb-6 pb-4 border-b border-neutral-200">
              <span>
                By <b className="text-neutral-700">{selectedAnnouncement.author_name || 'Executive Board'}</b>
              </span>
              <span>•</span>
              <span>
                {new Date(selectedAnnouncement.posted_at || selectedAnnouncement.created_at || new Date()).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
            </div>

            <div className="text-neutral-700 text-sm leading-relaxed whitespace-pre-line space-y-4">
              {selectedAnnouncement.body}
            </div>

            <div className="mt-8 pt-6 border-t border-neutral-200 flex justify-end">
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="px-6 py-2.5 rounded-xl bg-[#714B67] text-neutral-900 font-bold text-xs hover:bg-white/90 transition shadow-lg"
              >
                Close Announcement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
