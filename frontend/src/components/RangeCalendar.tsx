import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'

interface Props {
  start: string // yyyy-mm-dd
  end: string
  onChange: (start: string, end: string) => void
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Date-range picker. The popover is `fixed`-positioned from the trigger's bounding box and sits at z-[60],
 * so it always renders above charts, rankings and sticky bars (the old inline popover was clipped behind them).
 */
export default function RangeCalendar({ start, end, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => { const d = parse(end); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [pending, setPending] = useState<string | null>(null) // first click of a new range
  const [hover, setHover] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const reposition = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const width = 300
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width))
    setPos({ top: r.bottom + 8, left })
  }

  useEffect(() => {
    if (!open) return
    reposition()
    const onDoc = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
      setPending(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setPending(null) } }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1)
    const offset = first.getDay()
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
    const out: (string | null)[] = Array(offset).fill(null)
    for (let d = 1; d <= days; d++) out.push(iso(new Date(view.getFullYear(), view.getMonth(), d)))
    return out
  }, [view])

  const lo = pending ? (hover && hover < pending ? hover : pending) : start
  const hi = pending ? (hover && hover > pending ? hover : pending) : end
  const today = iso(new Date())

  const pick = (day: string) => {
    if (!pending) { setPending(day); setHover(day); return }
    const [a, b] = day < pending ? [day, pending] : [pending, day]
    onChange(a, b)
    setPending(null)
    setOpen(false)
  }

  const preset = (days: number) => {
    const e = new Date()
    const s = new Date()
    s.setDate(e.getDate() - (days - 1))
    onChange(iso(s), iso(e))
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-300 hover:border-neutral-500 bg-white text-xs text-neutral-800 cursor-pointer transition-colors"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays className="w-3.5 h-3.5 text-[#714B67]" />
        <span>{start}</span>
        <span className="text-neutral-400">–</span>
        <span>{end}</span>
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Choose date range"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 300 }}
          className="z-[60] bg-white border border-neutral-200 rounded-2xl shadow-[0_18px_50px_rgba(0,0,0,0.18)] p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
              className="p-1.5 rounded-lg hover:bg-neutral-100 border-none bg-transparent cursor-pointer text-neutral-700" aria-label="Previous month">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-neutral-900">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
            <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
              className="p-1.5 rounded-lg hover:bg-neutral-100 border-none bg-transparent cursor-pointer text-neutral-700" aria-label="Next month">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[10px] uppercase tracking-wide text-neutral-400 mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => pending && setHover(pending)}>
            {cells.map((day, i) => {
              if (!day) return <span key={i} />
              const inRange = day >= lo && day <= hi
              const edge = day === lo || day === hi
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  onMouseEnter={() => pending && setHover(day)}
                  className={`h-8 text-xs border-none cursor-pointer transition-colors ${
                    edge
                      ? 'bg-[#714B67] text-white font-semibold rounded-lg'
                      : inRange
                      ? 'bg-[#714B67]/10 text-neutral-900'
                      : 'bg-transparent text-neutral-800 hover:bg-neutral-100 rounded-lg'
                  } ${day === today && !edge ? 'font-bold text-[#714B67]' : ''}`}
                >
                  {Number(day.slice(8))}
                </button>
              )
            })}
          </div>

          <p className="text-[11px] text-neutral-500 mt-3 min-h-[16px]">
            {pending ? 'Now pick the end date' : 'Pick a start date, then an end date'}
          </p>
          <div className="flex gap-1.5 mt-2 pt-3 border-t border-neutral-200">
            {[['7 days', 7], ['30 days', 30], ['90 days', 90], ['1 year', 365]].map(([label, n]) => (
              <button key={label as string} type="button" onClick={() => preset(n as number)}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-none cursor-pointer">
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
