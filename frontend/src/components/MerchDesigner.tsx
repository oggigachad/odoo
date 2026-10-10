import { useEffect, useRef, useState } from 'react'
import { Upload, Palette, Check, Type, Trash2, Move } from 'lucide-react'
import { API_BASE, getToken } from '../apiClient'

type Garment = 'tshirt' | 'hoodie' | 'tote'
type View = 'front' | 'back'

interface Layer {
  id: number
  kind: 'text' | 'logo'
  view: View
  x: number
  y: number
  size: number // text px or logo width
  color: string
  text: string
  img?: HTMLImageElement
  clean?: HTMLCanvasElement // logo with its white background removed
  transparent: boolean
}

const GARMENTS: { key: Garment; label: string }[] = [
  { key: 'tshirt', label: 'T-shirt' },
  { key: 'hoodie', label: 'Hoodie' },
  { key: 'tote', label: 'Tote bag' },
]

// Silhouettes drawn on a 400 x 400 canvas
const PATHS: Record<Garment, string> = {
  tshirt: 'M130 40 L60 80 L20 150 L75 175 L95 150 L95 360 L305 360 L305 150 L325 175 L380 150 L340 80 L270 40 C250 70 150 70 130 40 Z',
  hoodie: 'M140 50 L60 90 L15 310 L78 325 L100 190 L100 360 L300 360 L300 190 L322 325 L385 310 L340 90 L260 50 C240 85 160 85 140 50 Z',
  tote: 'M70 130 L330 130 L345 370 L55 370 Z',
}

const SWATCHES = ['#ffffff', '#111111', '#714B67', '#1d4ed8', '#047857', '#b91c1c', '#d97706', '#6b7280']

// Where each print position sits on the 400 x 400 mock-up
const PLACEMENTS: { key: string; label: string; view: View; x: number; y: number }[] = [
  { key: 'chest', label: 'Chest', view: 'front', x: 200, y: 175 },
  { key: 'left-chest', label: 'Left chest', view: 'front', x: 255, y: 140 },
  { key: 'right-shoulder', label: 'Shoulder', view: 'front', x: 105, y: 100 },
  { key: 'back-top', label: 'Back (upper)', view: 'back', x: 200, y: 120 },
  { key: 'back', label: 'Back (centre)', view: 'back', x: 200, y: 215 },
]

function removeWhite(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const g = c.getContext('2d')!
  g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, c.width, c.height)
  for (let i = 0; i < d.data.length; i += 4) {
    const min = Math.min(d.data[i], d.data[i + 1], d.data[i + 2])
    if (min > 235) d.data[i + 3] = 0
    else if (min > 200) d.data[i + 3] = Math.round(d.data[i + 3] * (235 - min) / 35)
  }
  g.putImageData(d, 0, 0)
  return c
}

interface Props {
  onDone: (result: { url: string; garment: string }) => void
  onError: (msg: string) => void
}

/** Design studio: pick an item and colour, drop text and logos on the front or back, drag them into place, export as the product picture. */
export default function MerchDesigner({ onDone, onError }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [garment, setGarment] = useState<Garment>('tshirt')
  const [color, setColor] = useState('#714B67')
  const [view, setView] = useState<View>('front')
  const [layers, setLayers] = useState<Layer[]>([
    { id: 1, kind: 'text', view: 'front', x: 200, y: 175, size: 30, color: '#ffffff', text: 'SKYLINE', transparent: false },
  ])
  const [selected, setSelected] = useState<number | null>(1)
  const [transparentBg, setTransparentBg] = useState(false)
  const [saving, setSaving] = useState(false)
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null)
  const nextId = useRef(2)

  const draw = (g: CanvasRenderingContext2D, v: View, ox: number, withBg: boolean, showSelection: boolean) => {
    g.save()
    g.translate(ox, 0)
    if (withBg) { g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, 400, 400) }
    const shape = new Path2D(PATHS[garment])
    g.save()
    g.shadowColor = 'rgba(0,0,0,0.18)'
    g.shadowBlur = 14
    g.shadowOffsetY = 5
    g.fillStyle = color
    g.fill(shape)
    g.restore()
    g.strokeStyle = 'rgba(0,0,0,0.25)'
    g.lineWidth = 1.5
    g.stroke(shape)
    if (garment === 'hoodie') {
      g.fillStyle = 'rgba(0,0,0,0.1)'
      g.beginPath(); g.ellipse(200, v === 'front' ? 60 : 70, 52, 26, 0, 0, Math.PI * 2); g.fill()
      if (v === 'front') { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.strokeRect(140, 290, 120, 55) }
    }
    if (garment === 'tshirt' && v === 'back') {
      g.fillStyle = 'rgba(0,0,0,0.08)'
      g.beginPath(); g.ellipse(200, 52, 38, 12, 0, 0, Math.PI * 2); g.fill()
    }
    if (garment === 'tote') {
      g.strokeStyle = 'rgba(0,0,0,0.45)'
      g.lineWidth = 7
      g.beginPath(); g.moveTo(125, 132); g.bezierCurveTo(125, 40, 275, 40, 275, 132); g.stroke()
    }
    for (const l of layers.filter(x => x.view === v)) {
      if (l.kind === 'logo' && l.img) {
        const src: CanvasImageSource = l.transparent && l.clean ? l.clean : l.img
        const w = l.size
        const h = (l.img.naturalHeight / l.img.naturalWidth) * w
        g.drawImage(src, l.x - w / 2, l.y - h / 2, w, h)
        if (showSelection && l.id === selected) { g.strokeStyle = '#714B67'; g.setLineDash([5, 4]); g.strokeRect(l.x - w / 2, l.y - h / 2, w, h); g.setLineDash([]) }
      } else if (l.kind === 'text' && l.text) {
        g.fillStyle = l.color
        g.font = `bold ${l.size}px Arial, sans-serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(l.text, l.x, l.y)
        if (showSelection && l.id === selected) {
          const w = g.measureText(l.text).width
          g.strokeStyle = '#714B67'; g.setLineDash([5, 4]); g.strokeRect(l.x - w / 2 - 4, l.y - l.size / 2 - 3, w + 8, l.size + 6); g.setLineDash([])
        }
      }
    }
    g.restore()
  }

  useEffect(() => {
    const g = canvas.current?.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, 400, 400)
    draw(g, view, 0, true, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garment, color, view, layers, selected])

  const box = (l: Layer, g: CanvasRenderingContext2D) => {
    if (l.kind === 'logo' && l.img) {
      const w = l.size, h = (l.img.naturalHeight / l.img.naturalWidth) * w
      return { w, h }
    }
    g.font = `bold ${l.size}px Arial, sans-serif`
    return { w: g.measureText(l.text).width + 8, h: l.size + 6 }
  }

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 400, y: ((e.clientY - r.top) / r.height) * 400 }
  }

  const onDown = (e: React.PointerEvent) => {
    const g = canvas.current!.getContext('2d')!
    const p = pos(e)
    const hit = [...layers].reverse().find(l => {
      if (l.view !== view) return false
      const b = box(l, g)
      return Math.abs(p.x - l.x) <= b.w / 2 && Math.abs(p.y - l.y) <= b.h / 2
    })
    if (hit) {
      setSelected(hit.id)
      drag.current = { id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y }
      canvas.current!.setPointerCapture(e.pointerId)
    } else setSelected(null)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const p = pos(e)
    const d = drag.current
    setLayers(ls => ls.map(l => (l.id === d.id ? { ...l, x: Math.max(0, Math.min(400, p.x - d.dx)), y: Math.max(0, Math.min(400, p.y - d.dy)) } : l)))
  }
  const onUp = () => { drag.current = null }

  const update = (id: number, patch: Partial<Layer>) => setLayers(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)))
  const sel = layers.find(l => l.id === selected) ?? null

  const addText = () => {
    const id = nextId.current++
    setLayers(ls => [...ls, { id, kind: 'text', view, x: 200, y: 200, size: 28, color: '#ffffff', text: 'Your text', transparent: false }])
    setSelected(id)
  }
  const addLogo = (file: File | undefined) => {
    if (!file) return
    const img = new Image()
    img.onload = () => {
      const id = nextId.current++
      setLayers(ls => [...ls, { id, kind: 'logo', view, x: 200, y: 190, size: 90, color: '#ffffff', text: '', img, clean: removeWhite(img), transparent: false }])
      setSelected(id)
    }
    img.src = URL.createObjectURL(file)
  }
  const place = (p: (typeof PLACEMENTS)[number]) => {
    if (selected == null) return
    setView(p.view)
    update(selected, { view: p.view, x: p.x, y: p.y })
  }

  const save = async () => {
    setSaving(true)
    try {
      const out = document.createElement('canvas')
      out.width = 800
      out.height = 400
      const g = out.getContext('2d')!
      draw(g, 'front', 0, !transparentBg, false)
      draw(g, 'back', 400, !transparentBg, false)
      const blob: Blob | null = await new Promise(res => out.toBlob(res, 'image/png'))
      if (!blob) throw new Error('Could not export the design.')
      const body = new FormData()
      body.append('file', new File([blob], 'design.png', { type: 'image/png' }))
      const res = await fetch(`${API_BASE}/products/image?design=true`, { method: 'POST', body, headers: { Authorization: `Bearer ${getToken() ?? ''}` }, credentials: 'include' })
      if (!res.ok) throw new Error('Upload failed.')
      const data = await res.json()
      onDone({ url: data.url, garment: GARMENTS.find(x => x.key === garment)?.label ?? '' })
    } catch (e: any) {
      onError(e?.message ?? 'Could not save the design.')
    } finally {
      setSaving(false)
    }
  }

  const label = 'block text-[10px] font-semibold text-neutral-500 mb-1'
  const field = 'px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 border border-neutral-300 focus:outline-none text-xs w-full'
  const chip = (on: boolean) => `px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer ${on ? 'bg-[#714B67] text-white' : 'bg-neutral-100 text-neutral-600'}`

  return (
    <div className="grid md:grid-cols-2 gap-5 p-4 border border-neutral-200 rounded-2xl">
      <div className="space-y-2">
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setView('front')} className={chip(view === 'front')}>Front</button>
          <button type="button" onClick={() => setView('back')} className={chip(view === 'back')}>Back</button>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-neutral-500"><Move className="w-3 h-3" />Drag text or logos to move them</span>
        </div>
        <canvas ref={canvas} width={400} height={400} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          className="w-full max-w-[380px] mx-auto rounded-xl border border-neutral-200 touch-none cursor-move block" />
      </div>
      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-xs font-bold text-neutral-700"><Palette className="w-3.5 h-3.5 text-[#714B67]" />Design studio</p>
        <div>
          <span className={label}>Item</span>
          <div className="flex gap-1.5 flex-wrap">
            {GARMENTS.map(x => <button key={x.key} type="button" onClick={() => setGarment(x.key)} className={chip(garment === x.key)}>{x.label}</button>)}
          </div>
        </div>
        <div>
          <span className={label}>Colour</span>
          <div className="flex gap-1.5 items-center flex-wrap">
            {SWATCHES.map(s => (
              <button key={s} type="button" aria-label={`Colour ${s}`} onClick={() => setColor(s)}
                className="w-6 h-6 rounded-full border border-neutral-300 cursor-pointer flex items-center justify-center" style={{ background: s }}>
                {color === s && <Check className="w-3 h-3" style={{ color: s === '#ffffff' ? '#111' : '#fff' }} />}
              </button>
            ))}
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-7 h-7 p-0 border-none bg-transparent cursor-pointer" aria-label="Custom colour" />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={addText} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-700 border-none cursor-pointer"><Type className="w-3.5 h-3.5" />Add text</button>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-700 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />Add logo or image
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { addLogo(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>

        {sel ? (
          <div className="p-3 rounded-xl border border-neutral-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-700">{sel.kind === 'text' ? 'Selected text' : 'Selected logo'}</span>
              <button type="button" onClick={() => { setLayers(ls => ls.filter(l => l.id !== sel.id)); setSelected(null) }}
                className="inline-flex items-center gap-1 text-[11px] text-rose-700 bg-transparent border-none cursor-pointer"><Trash2 className="w-3 h-3" />Remove</button>
            </div>
            {sel.kind === 'text' && (
              <div className="flex gap-2">
                <input value={sel.text} maxLength={24} onChange={e => update(sel.id, { text: e.target.value })} className={field} />
                <input type="color" value={sel.color} onChange={e => update(sel.id, { color: e.target.value })} className="w-9 h-9 p-0 border-none bg-transparent cursor-pointer" aria-label="Text colour" />
              </div>
            )}
            <label className="block"><span className={label}>Size</span>
              <input type="range" min={sel.kind === 'text' ? 12 : 30} max={sel.kind === 'text' ? 70 : 220} value={sel.size} onChange={e => update(sel.id, { size: +e.target.value })} className="w-full" />
            </label>
            {sel.kind === 'logo' && (
              <label className="flex items-center gap-2 text-[11px] text-neutral-700 cursor-pointer">
                <input type="checkbox" checked={sel.transparent} onChange={e => update(sel.id, { transparent: e.target.checked })} />
                Make the white background transparent
              </label>
            )}
            <div>
              <span className={label}>Print position</span>
              <div className="flex gap-1.5 flex-wrap">
                {PLACEMENTS.map(p => <button key={p.key} type="button" onClick={() => place(p)} className={chip(false)}>{p.label}</button>)}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-neutral-500">Click a text or logo on the garment to edit it, or add a new one.</p>
        )}

        <label className="flex items-center gap-2 text-[11px] text-neutral-700 cursor-pointer">
          <input type="checkbox" checked={transparentBg} onChange={e => setTransparentBg(e.target.checked)} />
          Export with a transparent background
        </label>
        <button type="button" onClick={save} disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-[#714B67] text-white font-bold text-xs border-none cursor-pointer disabled:opacity-40">
          {saving ? 'Saving...' : 'Use this design as the product picture'}
        </button>
      </div>
    </div>
  )
}
