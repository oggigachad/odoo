import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { api, API_BASE, getToken, errorMessage } from '../apiClient'
import { useLiveRefresh } from '../useRealtimeUpdates'

interface Column { key: string; label: string; kind: 'text' | 'money' | 'int' | 'percent' | 'date' }
interface Report {
  key: string
  title: string
  description: string
  generated_at: string
  columns: Column[]
  rows: Record<string, any>[]
  totals: Record<string, number>
}

const FONT = { fontFamily: '"TT Firs Neue", sans-serif' }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const rupee = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })

function fmt(v: any, kind: Column['kind']) {
  if (v === null || v === undefined || v === '') return '–'
  if (kind === 'money') return rupee(v)
  if (kind === 'percent') return `${v}%`
  if (kind === 'int') return Number(v).toLocaleString('en-IN')
  return String(v)
}

export default function ReportsPanel() {
  const [list, setList] = useState<{ key: string; title: string }[]>([])
  const [active, setActive] = useState('event-profit')
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [start, setStart] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return iso(d) })
  const [end, setEnd] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return iso(d) })

  useEffect(() => { api<{ key: string; title: string }[]>('/reports').then(setList).catch(e => setError(errorMessage(e))) }, [])

  const load = useCallback(async () => {
    try {
      setReport(await api<Report>(`/reports/${active}?start=${start}&end=${end}`))
      setError(null)
    } catch (e) { setError(errorMessage(e, 'Could not build this report.')) } finally { setLoading(false) }
  }, [active, start, end])
  useEffect(() => { setLoading(true); load() }, [load])
  useLiveRefresh(['events', 'shop', 'finance', 'members', 'fundraisers'], load)

  const download = async (fmt: 'csv' | 'xlsx' | 'pdf') => {
    const res = await fetch(`${API_BASE}/reports/${active}?format=${fmt}&start=${start}&end=${end}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` }, credentials: 'include',
    })
    if (!res.ok) { setError('Could not export this report.'); return }
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `skyline-${active}.${fmt}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const input = 'px-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs focus:outline-none focus:border-[#714B67]'

  return (
    <div style={FONT} className="space-y-6 animate-fadeIn">
      <div className="flex flex-wrap gap-2">
        {list.map(r => (
          <button key={r.key} onClick={() => setActive(r.key)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer transition-colors ${active === r.key ? 'bg-[#714B67] text-white' : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900'}`}>
            {r.title}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <h2 className="text-lg font-semibold">{report?.title ?? 'Report'}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">{report?.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11px] text-neutral-500">From <input type="date" className={input} value={start} onChange={e => setStart(e.target.value)} /></label>
          <label className="text-[11px] text-neutral-500">To <input type="date" className={input} value={end} onChange={e => setEnd(e.target.value)} /></label>
          {(['csv', 'xlsx', 'pdf'] as const).map(f => (
            <button key={f} onClick={() => download(f)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#714B67] text-white text-xs font-semibold border-none cursor-pointer">
              <Download className="w-3.5 h-3.5" />{f === 'xlsx' ? 'Excel' : f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-rose-700">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-7 h-7 rounded-full border-2 border-[#714B67] border-t-transparent animate-spin" /></div>
      ) : report && (
        <>
          {Object.keys(report.totals).length > 0 && (
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              {Object.entries(report.totals).map(([k, v]) => {
                const money = /revenue|expenses|profit|raised|balance|money|dues|owed|claimed|outstanding|paid_revenue/.test(k) && !/members|sold|attended|expiring/.test(k)
                return (
                  <div key={k}>
                    <p className="text-[11px] uppercase tracking-wide text-neutral-500">{k.replace(/_/g, ' ')}</p>
                    <p className={`text-xl font-semibold ${/profit|balance/.test(k) ? (v < 0 ? 'text-rose-700' : 'text-emerald-700') : ''}`}>{money ? rupee(v) : Number(v).toLocaleString('en-IN')}</p>
                  </div>
                )
              })}
            </div>
          )}
          {report.rows.length === 0 ? (
            <p className="text-sm text-neutral-400 py-10 text-center">Nothing to report for this period yet. This fills in as the club runs.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-300 text-left text-neutral-500">
                    {report.columns.map(c => <th key={c.key} className={`py-2 pr-4 font-semibold ${c.kind === 'text' || c.kind === 'date' ? '' : 'text-right'}`}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50">
                      {report.columns.map(c => {
                        const v = r[c.key]
                        const neg = c.key === 'profit' && Number(v) < 0
                        return <td key={c.key} className={`py-2.5 pr-4 ${c.kind === 'text' || c.kind === 'date' ? '' : 'text-right tabular-nums'} ${neg ? 'text-rose-700 font-semibold' : c.key === 'profit' ? 'text-emerald-700 font-semibold' : ''}`}>{fmt(v, c.kind)}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] text-neutral-400">Generated {new Date(report.generated_at).toLocaleString()}. Updates live as the club records payments.</p>
        </>
      )}
    </div>
  )
}
