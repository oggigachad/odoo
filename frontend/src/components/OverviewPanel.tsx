import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { api, errorMessage } from '../apiClient'
import { useLiveRefresh } from '../useRealtimeUpdates'
import RangeCalendar from './RangeCalendar'

interface Series { key: string; label: string }
interface Bucket { label: string; values: Record<string, number>; total: number }
interface Block { series: Series[]; buckets: Bucket[]; ranking: { label: string; amount: number }[] }
interface Summary {
  scope: 'club' | 'personal'
  range: { start: string; end: string; bucket: string }
  cards: {
    sales: { label: string; value: number; day_value: number; day_ratio: number | null; week_ratio: number | null; footer_label: string }
    visits: { label: string; value: number; day_value: number; footer_label: string; spark: number[] }
    payments: { label: string; value: number; footer_label: string; footer_value: string; bars: number[] }
    effect: { label: string; percent: number; text: string; footer_label: string; footer_value: string; footer_ok: boolean }
  }
  sales: Block
  visits: Block
}

type RangeKey = 'day' | 'week' | 'month' | 'year'
const SERIES_COLORS = ['#714B67', '#38bdf8', '#c9a7bd', '#94a3b8']

const pad = (n: number) => String(n).padStart(2, '0')
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function boundsFor(range: RangeKey) {
  const end = new Date()
  const start = new Date()
  if (range === 'week') start.setDate(end.getDate() - 6)
  else if (range === 'month') start.setDate(end.getDate() - 29)
  else if (range === 'year') start.setDate(end.getDate() - 364)
  return { start: isoLocal(start), end: isoLocal(end) }
}

const rupee = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const compact = (n: number) =>
  n >= 100000 ? `${(n / 100000).toFixed(n >= 1000000 ? 0 : 1)}L` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n))

function niceMax(v: number) {
  if (v <= 0) return 4
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

function Ratio({ label, value }: { label: string; value: number | null }) {
  if (value === null) return <span className="text-neutral-400">{label} –</span>
  const up = value >= 0
  return (
    <span className={up ? 'text-emerald-700' : 'text-rose-700'}>
      {label} {Math.abs(value)}% {up ? '▲' : '▼'}
    </span>
  )
}

export default function OverviewPanel({ onExplore, exploreLabel }: { onExplore: () => void; exploreLabel: string }) {
  const [range, setRange] = useState<RangeKey>('year')
  const [start, setStart] = useState(() => boundsFor('year').start)
  const [end, setEnd] = useState(() => boundsFor('year').end)
  const [tab, setTab] = useState<'sales' | 'visits'>('sales')
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const tz = -new Date().getTimezoneOffset()
      const res = await api<Summary>(`/dashboard/summary?start=${start}&end=${end}&tz_offset=${tz}`)
      setData(res)
      setError(null)
    } catch (e) {
      setError(errorMessage(e, 'Could not load the dashboard.'))
    } finally {
      setLoading(false)
    }
  }, [start, end])

  useEffect(() => { load() }, [load])
  useLiveRefresh(['dashboard', 'events', 'shop', 'finance', 'members'], load)

  const pickRange = (r: RangeKey) => {
    const b = boundsFor(r)
    setRange(r)
    setStart(b.start)
    setEnd(b.end)
  }
  const customRange = (s: string, e: string) => { setStart(s); setEnd(e); setRange('year'); setCustom(true) }
  const [custom, setCustom] = useState(false)

  const block = data ? data[tab] : null
  const isSales = tab === 'sales'
  const max = useMemo(() => {
    if (!block) return 4
    let m = 0
    block.buckets.forEach(b => block.series.forEach(s => { m = Math.max(m, b.values[s.key] || 0) }))
    return niceMax(m)
  }, [block])
  const empty = !!block && block.buckets.every(b => b.total === 0)

  if (loading) {
    return <div className="flex justify-center py-24"><div className="w-7 h-7 rounded-full border-2 border-[#714B67] border-t-transparent animate-spin" /></div>
  }
  if (error || !data) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-rose-700">{error ?? 'No data.'}</p>
        <button onClick={load} className="mt-3 px-4 py-2 rounded-lg bg-[#714B67] text-white text-xs font-semibold border-none cursor-pointer">Retry</button>
      </div>
    )
  }

  const c = data.cards
  const sparkMax = Math.max(1, ...c.visits.spark)
  const barsMax = Math.max(1, ...c.payments.bars)
  const sparkPath = (() => {
    const pts = c.visits.spark.length > 1 ? c.visits.spark : [0, ...c.visits.spark, 0]
    const step = 100 / (pts.length - 1)
    return pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)},${(28 - (v / sparkMax) * 24).toFixed(1)}`).join(' ')
  })()

  return (
    <div className="space-y-10">
      {/* KPI row: plain, separated by hairlines */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x divide-neutral-200 gap-y-8">
        <div className="lg:pr-8">
          <p className="text-xs font-medium text-neutral-500">{c.sales.label}</p>
          <p className="text-3xl font-semibold tracking-tight mt-1.5">{rupee(c.sales.value)}</p>
          <p className="flex gap-3 text-[11px] font-medium mt-2">
            <Ratio label="Week" value={c.sales.week_ratio} />
            <Ratio label="Day" value={c.sales.day_ratio} />
          </p>
          <p className="mt-4 pt-3 border-t border-neutral-200 flex justify-between text-[11px] text-neutral-500">
            <span>{c.sales.footer_label}</span><span className="font-semibold text-neutral-900">{rupee(c.sales.day_value)}</span>
          </p>
        </div>

        <div className="lg:px-8">
          <p className="text-xs font-medium text-neutral-500">{c.visits.label}</p>
          <p className="text-3xl font-semibold tracking-tight mt-1.5">{c.visits.value.toLocaleString('en-IN')}</p>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-8 mt-2 overflow-visible" aria-hidden>
            <path d={`${sparkPath} L 100,30 L 0,30 Z`} fill="#714B67" opacity="0.08" />
            <path d={sparkPath} fill="none" stroke="#714B67" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          </svg>
          <p className="mt-3 pt-3 border-t border-neutral-200 flex justify-between text-[11px] text-neutral-500">
            <span>{c.visits.footer_label}</span><span className="font-semibold text-neutral-900">{c.visits.day_value.toLocaleString('en-IN')}</span>
          </p>
        </div>

        <div className="lg:px-8">
          <p className="text-xs font-medium text-neutral-500">{c.payments.label}</p>
          <p className="text-3xl font-semibold tracking-tight mt-1.5">{rupee(c.payments.value)}</p>
          <div className="flex items-end gap-1 h-8 mt-2" aria-hidden>
            {(c.payments.bars.length ? c.payments.bars : [0]).map((v, i) => (
              <div key={i} className="flex-1 rounded-t-sm bg-[#714B67]" style={{ height: `${Math.max(8, (v / barsMax) * 100)}%`, opacity: 0.25 + 0.75 * (v / barsMax) }} />
            ))}
          </div>
          <p className="mt-3 pt-3 border-t border-neutral-200 flex justify-between text-[11px] text-neutral-500">
            <span>{c.payments.footer_label}</span><span className="font-semibold text-neutral-900">{c.payments.footer_value}</span>
          </p>
        </div>

        <div className="lg:pl-8">
          <p className="text-xs font-medium text-neutral-500">{c.effect.label}</p>
          <p className="text-3xl font-semibold tracking-tight mt-1.5">{c.effect.text}</p>
          <div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden mt-4">
            <div className="h-full rounded-full bg-[#714B67] transition-all duration-700" style={{ width: `${c.effect.percent}%` }} />
          </div>
          <p className="mt-4 pt-3 border-t border-neutral-200 flex justify-between text-[11px] text-neutral-500">
            <span>{c.effect.footer_label}</span>
            <span className={`font-semibold ${c.effect.footer_ok ? 'text-emerald-700' : 'text-amber-700'}`}>{c.effect.footer_value}</span>
          </p>
        </div>
      </section>

      {/* Controls */}
      <section className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-y border-neutral-200 py-3">
        <div className="flex items-center gap-6">
          {(['sales', 'visits'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`pb-1 text-sm font-semibold capitalize bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${
                tab === t ? 'border-[#714B67] text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-900'
              }`}>
              {t === 'sales' ? (data.scope === 'club' ? 'Sales' : 'Spending') : (data.scope === 'club' ? 'Visits' : 'Activity')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center rounded-lg border border-neutral-300 p-0.5">
            {(['day', 'week', 'month', 'year'] as const).map(r => (
              <button key={r} onClick={() => { pickRange(r); setCustom(false) }}
                className={`px-3 py-1 rounded-md text-xs font-medium border-none cursor-pointer transition-colors ${
                  range === r && !custom ? 'bg-[#714B67] text-white' : 'bg-transparent text-neutral-600 hover:text-neutral-900'
                }`}>
                {r === 'day' ? 'Today' : r === 'week' ? '7 days' : r === 'month' ? '30 days' : '1 year'}
              </button>
            ))}
          </div>
          <RangeCalendar start={start} end={end} onChange={customRange} />
        </div>
      </section>

      {/* Chart + ranking */}
      <section className="relative z-20 grid grid-cols-1 lg:grid-cols-3 gap-x-12 gap-y-10">
        <div className="lg:col-span-2 min-w-0">
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold">{isSales ? (data.scope === 'club' ? 'Store sales trend' : 'My spending trend') : (data.scope === 'club' ? 'Campus activity trend' : 'My activity')}</h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">{data.range.start} to {data.range.end}</p>
            </div>
            <span className="text-[11px] text-neutral-500 capitalize">By {data.range.bucket}</span>
          </div>

          <div className="relative h-64 pl-12 pt-8">
            {[1, 0.75, 0.5, 0.25, 0].map(f => (
              <div key={f} className="absolute left-0 right-0 flex items-center" style={{ bottom: `${f * 80}%`, transform: 'translateY(50%)' }}>
                <span className="w-10 pr-2 text-right text-[10px] text-neutral-400 shrink-0">{isSales ? '₹' : ''}{compact(max * f)}</span>
                <span className="flex-1 border-t border-neutral-100" />
              </div>
            ))}
            <div className="absolute inset-0 left-12 flex items-end gap-1 sm:gap-3 pb-6 pt-8">
              {block!.buckets.map((b, i) => (
                <div key={i} className="group/bar relative flex-1 min-w-0 h-full flex items-end justify-center gap-[2px]">
                  {block!.series.map((s, si) => {
                    const v = b.values[s.key] || 0
                    return (
                      <div key={s.key} className="flex-1 max-w-[22px] rounded-t-sm transition-opacity group-hover/bar:opacity-100 opacity-90"
                        style={{ height: `${(v / max) * 80}%`, minHeight: v > 0 ? 3 : 0, background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
                    )
                  })}
                  <span className="absolute -bottom-6 text-[10px] text-neutral-500 whitespace-nowrap">{b.label}</span>
                  <div className="hidden group-hover/bar:block absolute bottom-full mb-3 z-50 pointer-events-none drop-shadow-2xl">
                    <div className="bg-neutral-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-2xl border border-white/10 whitespace-nowrap">
                      <div className="font-semibold border-b border-white/20 pb-1 mb-1">{b.label} · {isSales ? rupee(b.total) : `${b.total} total`}</div>
                      {block!.series.map((s, si) => (
                        <div key={s.key} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-sm" style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
                          {s.label}: {isSales ? rupee(b.values[s.key] || 0) : (b.values[s.key] || 0)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {empty && (
              <div className="absolute inset-0 left-12 bottom-6 flex items-center justify-center pointer-events-none">
                <p className="text-xs text-neutral-400">No {isSales ? 'payments' : 'activity'} in this period yet. It will appear here the moment it happens.</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 mt-4 text-[11px] text-neutral-600">
            {block!.series.map((s, si) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />{s.label}
              </span>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">{isSales ? (data.scope === 'club' ? 'Sales ranking' : 'Where my money went') : (data.scope === 'club' ? 'Attendance ranking' : 'My events')}</h3>
            <span className="text-[10px] uppercase tracking-wide text-neutral-400 font-semibold">{isSales ? 'Total rev' : 'Check-ins'}</span>
          </div>
          {block!.ranking.length === 0 ? (
            <p className="text-xs text-neutral-400 py-6">Nothing to rank for this period yet.</p>
          ) : (
            <ol className="divide-y divide-neutral-100">
              {block!.ranking.map((r, i) => (
                <li key={r.label} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold ${i < 3 ? 'bg-[#714B67] text-white' : 'bg-neutral-100 text-neutral-500'}`}>{i + 1}</span>
                    <span className="truncate text-neutral-800">{r.label}</span>
                  </span>
                  <span className="font-semibold whitespace-nowrap">{isSales ? rupee(r.amount) : r.amount}</span>
                </li>
              ))}
            </ol>
          )}
          <button onClick={onExplore}
            className="mt-5 w-full py-2.5 rounded-lg border border-neutral-300 hover:border-neutral-900 bg-white text-xs font-semibold text-neutral-900 cursor-pointer flex items-center justify-center gap-1.5 transition-colors">
            {exploreLabel}<ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>
    </div>
  )
}
