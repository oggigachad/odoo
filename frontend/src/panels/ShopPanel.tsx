import { createPortal } from 'react-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import { money, digits } from '../numeric'
import {
  Check,
  X,
  ShoppingBag,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  Tag,
  Package,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Move,
  Upload,
  Palette,
  Trash2,
} from 'lucide-react'
import { api, API_BASE, API_ORIGIN, errorMessage, getToken } from '../apiClient'
import MerchDesigner from '../components/MerchDesigner'
import { processRazorpayPayment } from '../razorpayPayment'
import { useLiveRefresh } from '../useRealtimeUpdates'

interface Variant {
  variant_id: number
  product_id: number
  size: string
  stock_quantity: number
}

interface Product {
  product_id: number
  name: string
  description?: string
  image_url?: string | null
  price: string // non-member price
  member_price: string
  non_member_limit: number
  non_member_units_left: number
  variants: Variant[]
}

interface OrderItem {
  variant_id: number
  product_name: string
  size: string
  quantity: number
  unit_price: string
}

interface Order {
  order_id: number
  member_id?: number
  buyer_name?: string
  buyer_email?: string
  status: string
  total_amount: string
  ordered_at: string
  items: OrderItem[]
}

interface Props {
  memberId?: number
  memberName?: string
  memberEmail?: string
  isMember?: boolean
  isOfficer?: boolean
}

const FONT = { fontFamily: '"TT Firs Neue", sans-serif' }

interface Cart {
  [variantId: number]: number // variantId → qty
}

/**
 * Interactive Product Zoom Viewer
 * Supports:
 * - Hover-to-magnify (smooth 2.2x zoom lens centered on mouse position)
 * - Explicit zoom controls (+ / - buttons from 1x to 3.5x)
 * - Scroll-wheel zoom
 * - Click-and-drag pan when zoomed in
 * - Fullscreen inspection dialog for micro-detail scrutiny
 */
function ProductZoomViewer({
  src,
  alt,
}: {
  src?: string | null
  alt: string
}) {
  const [zoomLevel, setZoomLevel] = useState(1)
  const [isHovering, setIsHovering] = useState(false)
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      dragStart.current = { x: e.clientX, y: e.clientY }
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
      return
    }

    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    setOrigin({ x, y })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY }
    }
  }

  const handleMouseUp = () => setIsDragging(false)
  const handleMouseLeave = () => {
    setIsHovering(false)
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 0.3 : -0.3
    setZoomLevel((prev) => {
      const next = Math.max(1, Math.min(3.5, Number((prev + delta).toFixed(2))))
      if (next === 1) setPan({ x: 0, y: 0 })
      return next
    })
  }

  const zoomIn = () => setZoomLevel((prev) => Math.min(3.5, Number((prev + 0.5).toFixed(1))))
  const zoomOut = () =>
    setZoomLevel((prev) => {
      const next = Math.max(1, Number((prev - 0.5).toFixed(1)))
      if (next === 1) setPan({ x: 0, y: 0 })
      return next
    })
  const resetZoom = () => {
    setZoomLevel(1)
    setPan({ x: 0, y: 0 })
    setOrigin({ x: 50, y: 50 })
  }

  const currentScale = zoomLevel > 1 ? zoomLevel : isHovering ? 2.2 : 1
  const transformStyle =
    zoomLevel > 1
      ? {
          transform: `scale(${zoomLevel}) translate(${pan.x / zoomLevel}px, ${pan.y / zoomLevel}px)`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out',
        }
      : {
          transform: `scale(${currentScale})`,
          transformOrigin: `${origin.x}% ${origin.y}%`,
          transition: 'transform 0.2s cubic-bezier(0.2, 0, 0.2, 1)',
        }

  return (
    <div className="space-y-3">
      {/* Main Zoom Container */}
      <div
        ref={containerRef}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className={`relative overflow-hidden rounded-3xl bg-neutral-100 border border-neutral-200 aspect-square flex items-center justify-center select-none shadow-sm ${
          zoomLevel > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'
        }`}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            style={transformStyle}
            draggable={false}
            className="w-full h-full object-contain pointer-events-none"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-neutral-400">
            <ShoppingBag className="w-20 h-20 mb-3 text-neutral-300" />
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">No Image Uploaded</p>
            <p className="text-[11px] text-neutral-400 mt-1">Merchandise preview mockup</p>
          </div>
        )}

        {/* Hover / Pan status indicator */}
        {src && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none transition-opacity duration-200">
            <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[10px] font-semibold tracking-wide shadow-md whitespace-nowrap">
              {zoomLevel > 1 ? 'Drag to pan around details · Scroll to zoom' : 'Hover to magnify details (2.2x)'}
            </span>
          </div>
        )}

        {/* Floating Top Controls Toolbar */}
        {src && (
          <div className="absolute top-3 right-3 flex items-center gap-1 p-1 rounded-2xl bg-white/90 backdrop-blur-md border border-neutral-200 shadow-md z-10">
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoomLevel <= 1}
              title="Zoom out"
              className="p-1.5 rounded-xl hover:bg-neutral-100 disabled:opacity-30 cursor-pointer border-none bg-transparent transition-colors"
            >
              <ZoomOut className="w-4 h-4 text-neutral-700" />
            </button>
            <span className="font-mono text-[11px] font-bold px-1.5 min-w-[42px] text-center text-neutral-700">
              {Math.round(currentScale * 100)}%
            </span>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoomLevel >= 3.5}
              title="Zoom in"
              className="p-1.5 rounded-xl hover:bg-neutral-100 disabled:opacity-30 cursor-pointer border-none bg-transparent transition-colors"
            >
              <ZoomIn className="w-4 h-4 text-neutral-700" />
            </button>
            <div className="h-4 w-px bg-neutral-200 mx-0.5" />
            <button
              type="button"
              onClick={resetZoom}
              title="Reset Zoom"
              className="p-1.5 rounded-xl hover:bg-neutral-100 cursor-pointer border-none bg-transparent transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-neutral-600" />
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              title="Fullscreen Inspection"
              className="p-1.5 rounded-xl hover:bg-neutral-100 cursor-pointer border-none bg-transparent transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5 text-neutral-600" />
            </button>
          </div>
        )}
      </div>

      {/* Fullscreen Inspector Modal */}
      {isExpanded && src && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6 animate-fadeIn">
          <div className="w-full flex items-center justify-between text-white z-10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white/80">High-Resolution Inspector</span>
              <span className="text-xs text-white/40">·</span>
              <span className="text-xs text-white/90 font-semibold">{alt}</span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer border-none transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            className="flex-1 w-full max-w-4xl flex items-center justify-center overflow-hidden my-4 relative cursor-grab active:cursor-grabbing"
          >
            <img
              src={src}
              alt={alt}
              style={{
                transform: `scale(${zoomLevel > 1 ? zoomLevel : 1.5}) translate(${pan.x / (zoomLevel > 1 ? zoomLevel : 1.5)}px, ${pan.y / (zoomLevel > 1 ? zoomLevel : 1.5)}px)`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              }}
              draggable={false}
              className="max-h-[75vh] max-w-full object-contain pointer-events-none"
            />
          </div>

          <div className="flex items-center gap-2 p-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white z-10">
            <button
              onClick={zoomOut}
              disabled={zoomLevel <= 1}
              className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 cursor-pointer border-none bg-transparent text-white"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="font-mono text-xs font-bold px-2">{Math.round((zoomLevel > 1 ? zoomLevel : 1.5) * 100)}%</span>
            <button
              onClick={zoomIn}
              disabled={zoomLevel >= 3.5}
              className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 cursor-pointer border-none bg-transparent text-white"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={resetZoom}
              className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer border-none bg-transparent text-white"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <span className="text-[11px] text-white/70 px-2 border-l border-white/20">
              Drag to pan · Scroll wheel to zoom
            </span>
          </div>
        </div>
      , document.body)}
    </div>
  )
}

export default function ShopPanel({
  memberId,
  memberName = '',
  memberEmail = '',
  isMember,
  isOfficer,
}: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [myOrders, setMyOrders] = useState<Order[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'shop' | 'myorders' | 'manage' | 'addproduct'>('shop')
  const [cart, setCart] = useState<Cart>({})
  const [quantityToBuy, setQuantityToBuy] = useState(1)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Product detail view state (now renders in-place, fitting the window up to the side navbar)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [modalSelectedVariantId, setModalSelectedVariantId] = useState<number | null>(null)

  // New product form
  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    price: '',
    member_price: '',
    non_member_limit: '0',
    max_per_member: '',
    max_per_guest: '',
    image_url: '',
  })
  const [newVariants, setNewVariants] = useState([{ size: '', stock_quantity: '' }])
  const [creatingProduct, setCreatingProduct] = useState(false)

  // Guest checkout modal state
  const [guestName, setGuestName] = useState(memberName)
  const [guestEmail, setGuestEmail] = useState(memberEmail)

  const load = useCallback(async () => {
    try {
      const prods = await api<Product[]>('/products')
      setProducts(prods)
    } catch (e: any) {
      setError(e?.detail ?? 'Could not reach the backend.')
    }

    if (memberId) {
      try {
        const orders = await api<Order[]>('/me/orders')
        setMyOrders(orders)
      } catch {
        setMyOrders([])
      }
    }
    if (isOfficer) {
      try {
        const all = await api<Order[]>('/orders')
        setAllOrders(all)
      } catch {
        setAllOrders([])
      }
    }
    setLoading(false)
  }, [memberId, isOfficer])

  useEffect(() => {
    load()
  }, [load])
  useLiveRefresh(['shop'], load)

  const flash = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const totalCartItems = Object.values(cart).reduce((a, b) => a + b, 0)

  // Checkout review & pay modal state
  const [checkout, setCheckout] = useState<Cart | null>(null)
  const [checkoutBusy, setCheckoutBusy] = useState(false)

  useEffect(() => {
    if (!checkout) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [checkout])

  const variantIndex = (() => {
    const m = new Map<number, { product: Product; variant: Variant }>()
    products.forEach((pr) => pr.variants.forEach((v) => m.set(v.variant_id, { product: pr, variant: v })))
    return m
  })()
  const unitPrice = (pr: Product) => parseFloat(isMember ? pr.member_price : pr.price)
  const checkoutLines = Object.entries(checkout ?? {})
    .filter(([, q]) => q > 0)
    .map(([vid, qty]) => ({ vid: Number(vid), qty, ...variantIndex.get(Number(vid)) }))
    .filter((l) => l.product && l.variant) as { vid: number; qty: number; product: Product; variant: Variant }[]
  const checkoutTotal = checkoutLines.reduce((t, l) => t + unitPrice(l.product) * l.qty, 0)

  const openCheckout = (lines: Cart) => {
    if (!Object.values(lines).some((q) => q > 0)) return
    setError(null)
    setCheckout({ ...lines })
  }

  const setLineQty = (vid: number, qty: number) => {
    const max = variantIndex.get(vid)?.variant.stock_quantity ?? 0
    setCheckout((c) => ({ ...(c ?? {}), [vid]: Math.max(0, Math.min(qty, max)) }))
  }

  const confirmCheckout = async (payNow: boolean) => {
    if (checkoutLines.length === 0) return
    const buyerName = (guestName || memberName).trim()
    const buyerEmail = (guestEmail || memberEmail).trim()
    if (!memberId && (!buyerName || !buyerEmail)) {
      setError('Enter your name and email so we can reach you about the order.')
      return
    }
    setCheckoutBusy(true)
    setError(null)
    let order: Order
    try {
      order = await api<Order>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          member_id: memberId ?? null,
          buyer_name: memberId ? undefined : buyerName,
          buyer_email: memberId ? undefined : buyerEmail,
          items: checkoutLines.map((l) => ({ variant_id: l.vid, quantity: l.qty })),
        }),
      })
    } catch (e) {
      setCheckoutBusy(false)
      setError(errorMessage(e, 'Could not place the order.'))
      return
    }

    setCart({})
    setCheckout(null)
    load()
    if (!payNow) {
      setCheckoutBusy(false)
      flash(`Order #${order.order_id} placed. Pay from My Orders within 15 minutes to keep your items.`)
      setSelectedProduct(null)
      return
    }
    await processRazorpayPayment({
      category: 'merchandise',
      amount: parseFloat(order.total_amount).toFixed(2),
      description: `Merchandise order #${order.order_id}`,
      user: {
        id: String(memberId ?? 0),
        memberId: memberId ?? 0,
        name: buyerName,
        email: buyerEmail,
        role: isMember ? 'Member' : 'Guest',
        roles: [],
        isActive: !!isMember,
      },
      order_id: order.order_id,
      onSuccess: () => {
        setCheckoutBusy(false)
        flash(`Payment received. Order #${order.order_id} is paid.`)
        load()
        setSelectedProduct(null)
        setTab('myorders')
      },
      onError: (m) => {
        setCheckoutBusy(false)
        setError(`${m} Order #${order.order_id} is held for 15 minutes: pay from My Orders.`)
        load()
        setSelectedProduct(null)
        setTab('myorders')
      },
    })
  }

  const payOrder = async (o: { order_id: number; total_amount: string }) => {
    await processRazorpayPayment({
      category: 'merchandise',
      amount: parseFloat(o.total_amount).toFixed(2),
      description: `Merchandise order #${o.order_id}`,
      user: {
        id: String(memberId),
        memberId: memberId ?? 0,
        name: memberName,
        email: memberEmail,
        role: isMember ? 'Member' : 'Guest',
        roles: [],
        isActive: !!isMember,
      },
      order_id: o.order_id,
      onSuccess: () => {
        flash('Payment received. Your order is paid.')
        load()
      },
      onError: (m) => setError(m),
    })
  }

  const handleCancelOrder = async (orderId: number) => {
    try {
      await api(`/orders/${orderId}/cancel`, { method: 'POST' })
      flash('Order cancelled.')
      load()
    } catch (e: any) {
      setError(e?.detail ?? 'Cancel failed.')
    }
  }

  const [showDesigner, setShowDesigner] = useState(false)
  const [editDesigner, setEditDesigner] = useState(false)

  const attachImage = async (productId: number, url: string) => {
    try {
      await api(`/products/${productId}/image`, { method: 'PATCH', body: JSON.stringify({ image_url: url }) })
      setSelectedProduct((sp) => (sp && sp.product_id === productId ? { ...sp, image_url: url } : sp))
      setEditDesigner(false)
      flash('Product picture updated.')
      load()
    } catch (e: any) {
      setError(e?.message ?? 'Could not update the picture.')
    }
  }

  const replacePhoto = async (productId: number, file: File | undefined) => {
    if (!file) return
    const body = new FormData()
    body.append('file', file)
    try {
      const res = await fetch(`${API_BASE}/products/image`, {
        method: 'POST',
        body,
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
        credentials: 'include',
      })
      if (!res.ok) throw new Error()
      await attachImage(productId, (await res.json()).url)
    } catch {
      setError('Could not upload the image (PNG, JPEG or WebP up to 5 MB).')
    }
  }

  const thumbSrc = (u?: string | null) =>
    u ? imgSrc(u.replace('/products/', '/products/t_').replace(/\.(png|jpg|jpeg|webp)$/i, '.webp')) : ''
  const imgSrc = (u?: string | null) => (u ? (u.startsWith('http') ? u : `${API_ORIGIN}${u}`) : '')

  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return
    const body = new FormData()
    body.append('file', file)
    try {
      const res = await fetch(`${API_BASE}/products/image`, {
        method: 'POST',
        body,
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
        credentials: 'include',
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setNewProduct((f) => ({ ...f, image_url: data.url }))
    } catch {
      setError('Could not upload the image (PNG, JPEG or WebP up to 5 MB).')
    }
  }

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProduct.name || !newProduct.price) {
      setError('Name and price required.')
      return
    }
    setCreatingProduct(true)
    try {
      const prod = await api<Product>('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: newProduct.name,
          description: newProduct.description || undefined,
          price: newProduct.price,
          member_price: newProduct.member_price || newProduct.price,
          non_member_limit: parseInt(newProduct.non_member_limit) || 0,
          max_per_member: newProduct.max_per_member ? parseInt(newProduct.max_per_member) : null,
          max_per_guest: newProduct.max_per_guest ? parseInt(newProduct.max_per_guest) : null,
          image_url: newProduct.image_url || undefined,
        }),
      })
      for (const v of newVariants) {
        if (v.size) {
          await api(`/products/${prod.product_id}/variants`, {
            method: 'POST',
            body: JSON.stringify({ size: v.size, stock_quantity: parseInt(v.stock_quantity) || 0 }),
          })
        }
      }
      flash(`Product "${prod.name}" created!`)
      setNewProduct({
        name: '',
        description: '',
        price: '',
        member_price: '',
        non_member_limit: '0',
        max_per_member: '',
        max_per_guest: '',
        image_url: '',
      })
      setShowDesigner(false)
      setNewVariants([{ size: '', stock_quantity: '' }])
      setTab('shop')
      load()
    } catch (e: any) {
      setError(e?.detail ?? 'Create product failed.')
    } finally {
      setCreatingProduct(false)
    }
  }

  const openProductModal = (product: Product) => {
    setSelectedProduct(product)
    setQuantityToBuy(1)
    if (product.variants.length > 0) {
      setModalSelectedVariantId(product.variants[0].variant_id)
    } else {
      setModalSelectedVariantId(null)
    }
  }

  const tabs = [
    { key: 'shop' as const, label: `Shop${totalCartItems > 0 ? ` (${totalCartItems})` : ''}` },
    ...(memberId ? [{ key: 'myorders' as const, label: 'My Orders' }] : []),
    ...(isOfficer
      ? [
          { key: 'manage' as const, label: 'All Orders' },
          { key: 'addproduct' as const, label: '+ Add Merchandise' },
        ]
      : []),
  ]

  return (
    <div style={FONT} className="space-y-5 animate-fadeIn">
      {/* ── Sub tabs ── */}
      <div className="flex gap-2 flex-wrap items-center justify-between border-b border-neutral-200 pb-3">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key)
                setSelectedProduct(null)
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border-none cursor-pointer ${
                tab === t.key && !selectedProduct
                  ? 'bg-[#714B67] text-white shadow-md'
                  : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {totalCartItems > 0 && !selectedProduct && (
          <button
            onClick={() => openCheckout(cart)}
            className="px-4 py-2 rounded-xl bg-[#714B67] text-white text-xs font-bold shadow-md hover:bg-[#5d3d54] transition border-none cursor-pointer flex items-center gap-2"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Cart ({totalCartItems})</span>
          </button>
        )}
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center justify-between">
          <span>{error}</span>
          <button className="underline cursor-pointer bg-transparent border-none text-rose-700 font-bold" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PRODUCT DETAIL VIEW: Fits window up to the side navbar just like sections!
          Includes High-Resolution Zoom, Pan, Magnifier, & Variant Picker
         ══════════════════════════════════════════════════════════════════════ */}
      {selectedProduct ? (
        <div className="space-y-6 animate-fadeIn pb-12 w-full">
          {/* Breadcrumb / Navigation bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-200">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <button
                onClick={() => setSelectedProduct(null)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-100 hover:bg-[#714B67] hover:text-white text-neutral-800 text-xs font-bold transition-all cursor-pointer border-none shadow-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Shop</span>
              </button>
              <span className="text-neutral-300">/</span>
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                Merchandise
              </span>
              <span className="text-neutral-300">/</span>
              <span className="text-xs font-black text-neutral-900 truncate max-w-[220px] sm:max-w-md">
                {selectedProduct.name}
              </span>
            </div>

            {totalCartItems > 0 && (
              <button
                onClick={() => openCheckout(cart)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#714B67] text-white text-xs font-bold hover:bg-[#5d3d54] transition shadow-md border-none cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Checkout ({totalCartItems})</span>
              </button>
            )}
          </div>

          {/* 2-Column Responsive Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Product Image Gallery & Zoom Viewer */}
            <div className="lg:col-span-7 space-y-4">
              <ProductZoomViewer
                src={selectedProduct.image_url ? imgSrc(selectedProduct.image_url) : null}
                alt={selectedProduct.name}
              />

              {/* Officer tools for updating image / design */}
              {isOfficer && (
                <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#714B67]" />
                    <span className="text-xs font-bold text-neutral-800">Officer Controls</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-neutral-300 text-xs font-bold text-neutral-800 hover:border-[#714B67] cursor-pointer shadow-sm transition-all">
                      <Upload className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Upload Picture</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          replacePhoto(selectedProduct.product_id, e.target.files?.[0])
                          e.target.value = ''
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditDesigner((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-neutral-300 text-xs font-bold text-neutral-800 hover:border-[#714B67] cursor-pointer shadow-sm transition-all"
                    >
                      <Palette className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Studio Designer</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Permanently remove "${selectedProduct.name}" from the shop?`)) return
                        try {
                          await api(`/products/${selectedProduct.product_id}`, { method: 'DELETE' })
                          setSelectedProduct(null)
                          flash('Product removed.')
                          load()
                        } catch (e: any) {
                          setError(e?.message ?? 'Could not remove the product.')
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 hover:bg-rose-100 cursor-pointer shadow-sm transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Merch Designer Drawer for Officers */}
              {isOfficer && editDesigner && (
                <div className="bg-white rounded-3xl border border-neutral-200 p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                    <h4 className="font-bold text-sm text-neutral-900 flex items-center gap-2">
                      <Palette className="w-4 h-4 text-[#714B67]" />
                      Custom Merchandise Studio
                    </h4>
                    <button
                      onClick={() => setEditDesigner(false)}
                      className="p-1 rounded-lg hover:bg-neutral-100 border-none bg-transparent cursor-pointer"
                    >
                      <X className="w-4 h-4 text-neutral-500" />
                    </button>
                  </div>
                  <MerchDesigner
                    onError={(m) => setError(m)}
                    onDone={async ({ url }) => attachImage(selectedProduct.product_id, url)}
                  />
                </div>
              )}
            </div>

            {/* Right Column: Product Specs, Variants & Ordering Actions */}
            <div className="lg:col-span-5 space-y-6 bg-white p-6 sm:p-8 rounded-3xl border border-neutral-200 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#714B67] bg-[#714B67]/15 border border-[#714B67]/25 px-2.5 py-0.5 rounded-full">
                    Official Campus Gear
                  </span>
                  {selectedProduct.non_member_limit > 0 && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                      Limit {selectedProduct.non_member_limit} per guest
                    </span>
                  )}
                </div>

                <h2 className="text-2xl sm:text-3xl font-black text-neutral-900 leading-tight">
                  {selectedProduct.name}
                </h2>

                {/* Pricing row with member rate & savings */}
                <div className="flex items-baseline gap-3 pt-1">
                  <span className="text-3xl font-black text-[#714B67]">
                    ₹{isMember ? selectedProduct.member_price : selectedProduct.price}
                  </span>
                  {isMember && parseFloat(selectedProduct.member_price) < parseFloat(selectedProduct.price) && (
                    <span className="text-sm text-neutral-400 line-through font-semibold">
                      ₹{selectedProduct.price}
                    </span>
                  )}
                  {isMember && parseFloat(selectedProduct.member_price) < parseFloat(selectedProduct.price) && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Member Savings: ₹{(parseFloat(selectedProduct.price) - parseFloat(selectedProduct.member_price)).toFixed(2)}
                    </span>
                  )}
                </div>

                <p className="text-neutral-600 text-xs sm:text-sm leading-relaxed pt-1">
                  {selectedProduct.description ||
                    'Authentic student association merchandise engineered for club volunteers, members, and student supporters.'}
                </p>
              </div>

              {/* Variant / Size Selection */}
              <div className="space-y-3 pt-2 border-t border-neutral-100">
                <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Select Size / Variant:</span>
                  <span className="text-[11px] text-neutral-500 font-normal">
                    {selectedProduct.variants.find((v) => v.variant_id === modalSelectedVariantId)?.stock_quantity ?? 0} in stock
                  </span>
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {selectedProduct.variants.map((v) => {
                    const isSelected = modalSelectedVariantId === v.variant_id
                    const oos = v.stock_quantity === 0
                    const inCart = cart[v.variant_id] ?? 0

                    return (
                      <button
                        key={v.variant_id}
                        disabled={oos}
                        type="button"
                        onClick={() => {
                          setModalSelectedVariantId(v.variant_id)
                          setQuantityToBuy(1)
                        }}
                        className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center transition-all cursor-pointer ${
                          oos
                            ? 'border-neutral-200 bg-neutral-50 text-neutral-300 cursor-not-allowed'
                            : isSelected
                            ? 'border-[#714B67] bg-[#714B67]/15 text-[#714B67] ring-2 ring-[#714B67]/30 shadow-sm'
                            : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50'
                        }`}
                      >
                        <span className="text-sm font-black">{v.size}</span>
                        <span className="text-[10px] font-normal opacity-70 mt-0.5">
                          {oos ? 'Sold out' : `${v.stock_quantity} left`}
                          {inCart > 0 && ` · ${inCart} in cart`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Quantity Selector */}
              {modalSelectedVariantId && (
                <div className="space-y-2 pt-2 border-t border-neutral-100">
                  <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider block">Quantity</label>
                  <div className="inline-flex items-center gap-3 p-1.5 rounded-2xl border border-neutral-200 bg-neutral-50">
                    <button
                      type="button"
                      disabled={quantityToBuy <= 1}
                      onClick={() => setQuantityToBuy((q) => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-xl bg-white border border-neutral-200 text-neutral-800 font-bold hover:bg-neutral-100 disabled:opacity-30 cursor-pointer"
                    >
                      -
                    </button>
                    <span className="font-bold text-sm min-w-[28px] text-center text-neutral-900">{quantityToBuy}</span>
                    <button
                      type="button"
                      disabled={
                        quantityToBuy >=
                        (selectedProduct.variants.find((v) => v.variant_id === modalSelectedVariantId)?.stock_quantity ?? 1)
                      }
                      onClick={() => setQuantityToBuy((q) => q + 1)}
                      className="w-8 h-8 rounded-xl bg-white border border-neutral-200 text-neutral-800 font-bold hover:bg-neutral-100 disabled:opacity-30 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Primary Call-to-action Buttons */}
              <div className="pt-4 border-t border-neutral-200 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    disabled={
                      !modalSelectedVariantId ||
                      (selectedProduct.variants.find((v) => v.variant_id === modalSelectedVariantId)?.stock_quantity ?? 0) === 0
                    }
                    onClick={() => {
                      if (modalSelectedVariantId) {
                        const cur = cart[modalSelectedVariantId] ?? 0
                        const max = selectedProduct.variants.find((v) => v.variant_id === modalSelectedVariantId)?.stock_quantity ?? 1
                        const next = Math.min(max, cur + quantityToBuy)
                        setCart((c) => ({ ...c, [modalSelectedVariantId]: next }))
                        flash(`Added ${quantityToBuy} × ${selectedProduct.name} to cart.`)
                      }
                    }}
                    className="flex-1 py-3.5 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-bold text-xs border border-neutral-300 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-30 shadow-sm"
                  >
                    <Tag className="w-4 h-4 text-[#714B67]" />
                    <span>Add to Cart</span>
                  </button>

                  <button
                    type="button"
                    disabled={
                      checkoutBusy ||
                      !modalSelectedVariantId ||
                      (selectedProduct.variants.find((v) => v.variant_id === modalSelectedVariantId)?.stock_quantity ?? 0) === 0
                    }
                    onClick={() => {
                      if (modalSelectedVariantId) openCheckout({ [modalSelectedVariantId]: quantityToBuy })
                    }}
                    className="flex-1 py-3.5 rounded-2xl bg-[#714B67] hover:bg-[#5d3d54] text-white font-bold text-xs shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-30 border-none"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Buy Now</span>
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center gap-3 text-xs text-neutral-600">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>
                    Pickup in person at the Student Union desk or at club general meetings. 100% genuine club merchandise.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : loading && tab !== 'addproduct' ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#714B67] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'shop' ? (
        <div className="space-y-4">
          {products.length === 0 ? (
            <p className="text-neutral-500 text-sm text-center py-12">No merchandise available yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {products.map((p) => {
                  const price = isMember ? p.member_price : p.price
                  const savings = parseFloat(p.price) - parseFloat(p.member_price)
                  const totalStock = p.variants.reduce((acc, v) => acc + v.stock_quantity, 0)

                  return (
                    <div
                      key={p.product_id}
                      onClick={() => openProductModal(p)}
                      className="rounded-3xl border border-neutral-200 overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer group flex flex-col justify-between bg-white"
                    >
                      <div>
                        <div className="aspect-square bg-neutral-100 flex flex-col items-center justify-center relative overflow-hidden border-b border-neutral-100">
                          {p.image_url ? (
                            <img
                              src={thumbSrc(p.image_url)}
                              alt={p.name}
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.src = imgSrc(p.image_url)
                              }}
                              className="w-full h-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <ShoppingBag className="w-14 h-14 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
                          )}
                          <span className="absolute bottom-3 right-3 text-[10px] bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-white font-semibold">
                            {totalStock > 0 ? `${totalStock} in stock` : 'Out of stock'}
                          </span>
                        </div>
                        <div className="p-5">
                          <div className="flex justify-between items-start mb-1.5">
                            <h3 className="font-bold text-neutral-900 text-sm group-hover:text-[#714B67] transition-colors leading-snug">
                              {p.name}
                            </h3>
                            <span className="font-black text-[#714B67] text-sm shrink-0 ml-2">₹{price}</span>
                          </div>
                          {isMember && savings > 0 && (
                            <p className="text-emerald-700 text-[10px] font-bold mb-1">
                              Member exclusive (Save ₹{savings.toFixed(2)})
                            </p>
                          )}
                          {p.description && (
                            <p className="text-neutral-500 text-xs mb-3 line-clamp-2 leading-relaxed">
                              {p.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="p-5 pt-0">
                        <div className="flex items-center justify-between text-xs text-neutral-600 border-t border-neutral-100 pt-3">
                          <span className="text-[11px] font-bold text-[#714B67]">Inspect & Select Sizes</span>
                          <ArrowRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-1 group-hover:text-[#714B67] transition-all" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {totalCartItems > 0 && (
                <div className="sticky bottom-4 flex justify-end z-20">
                  <button
                    onClick={() => openCheckout(cart)}
                    disabled={checkoutBusy}
                    className="px-6 py-3 rounded-2xl bg-[#714B67] text-white font-bold text-sm shadow-2xl hover:bg-[#5d3d54] transition disabled:opacity-40 flex items-center gap-2 border-none cursor-pointer"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>{`Checkout (${totalCartItems} items)`}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : tab === 'myorders' ? (
        myOrders.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-12">No orders yet.</p>
        ) : (
          <div className="space-y-3">
            {myOrders.map((o) => (
              <div key={o.order_id} className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    {o.items.map((it, i) => (
                      <p key={i} className="text-neutral-900 text-xs font-bold">
                        {it.product_name} — {it.size} × {it.quantity}
                      </p>
                    ))}
                    <p className="text-neutral-500 text-[10px] mt-1">{new Date(o.ordered_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-[#714B67]">₹{o.total_amount}</p>
                    <span
                      className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                        o.status === 'paid'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : o.status === 'cancelled'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {o.status}
                    </span>
                    {o.status === 'placed' && (
                      <>
                        <button
                          onClick={() => payOrder(o)}
                          className="block mt-2 ml-auto px-3.5 py-1.5 rounded-xl bg-[#714B67] text-white text-[11px] font-bold border-none cursor-pointer hover:bg-[#5d3d54]"
                        >
                          Pay online
                        </button>
                        <button
                          onClick={() => handleCancelOrder(o.order_id)}
                          className="block mt-1 ml-auto text-[10px] text-rose-700 hover:underline bg-transparent border-none cursor-pointer"
                        >
                          Cancel order
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'manage' ? (
        /* Officer — all orders */
        allOrders.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-12">No orders yet.</p>
        ) : (
          <div className="space-y-3">
            {allOrders.map((o) => (
              <div key={o.order_id} className="p-5 rounded-2xl bg-white border border-neutral-200 flex justify-between items-center shadow-sm">
                <div>
                  <p className="text-neutral-900 text-xs font-bold">{o.buyer_name ?? `Member #${o.member_id}`}</p>
                  <p className="text-neutral-500 text-[10px]">
                    {o.items.map((it) => `${it.product_name} ${it.size}×${it.quantity}`).join(', ')}
                  </p>
                  <p className="text-neutral-400 text-[10px]">{new Date(o.ordered_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-[#714B67]">₹{o.total_amount}</p>
                  <span
                    className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                      o.status === 'paid'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : o.status === 'cancelled'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {o.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* ── Add Product Form (Officer) ── */
        <form onSubmit={handleCreateProduct} className="space-y-4 p-6 rounded-3xl bg-white border border-neutral-200 shadow-sm">
          <h3 className="font-bold text-neutral-900 text-sm">Add New Merchandise</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              placeholder="Product name *"
              value={newProduct.name}
              onChange={(e) => setNewProduct((f) => ({ ...f, name: e.target.value }))}
              className="px-3 py-2.5 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs"
            />
            <input
              required
              placeholder="Non-member price in INR *"
              inputMode="decimal"
              value={newProduct.price}
              onChange={(e) => setNewProduct((f) => ({ ...f, price: money(e.target.value) }))}
              className="px-3 py-2.5 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs"
            />
            <input
              placeholder="Member price in INR (blank = same)"
              inputMode="decimal"
              value={newProduct.member_price}
              onChange={(e) => setNewProduct((f) => ({ ...f, member_price: money(e.target.value) }))}
              className="px-3 py-2.5 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs"
            />
            <input
              placeholder="Units open to non-members (0 = members only)"
              inputMode="numeric"
              value={newProduct.non_member_limit}
              onChange={(e) => setNewProduct((f) => ({ ...f, non_member_limit: digits(e.target.value) }))}
              className="px-3 py-2.5 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs"
            />
            <input
              placeholder="Max per member (blank = no limit)"
              inputMode="numeric"
              value={newProduct.max_per_member}
              onChange={(e) => setNewProduct((f) => ({ ...f, max_per_member: digits(e.target.value) }))}
              className="px-3 py-2.5 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs"
            />
            <input
              placeholder="Max per guest (blank = no limit)"
              inputMode="numeric"
              value={newProduct.max_per_guest}
              onChange={(e) => setNewProduct((f) => ({ ...f, max_per_guest: digits(e.target.value) }))}
              className="px-3 py-2.5 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs"
            />
            <textarea
              placeholder="Description (optional)"
              rows={2}
              value={newProduct.description}
              onChange={(e) => setNewProduct((f) => ({ ...f, description: e.target.value }))}
              className="px-3 py-2.5 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs resize-none col-span-2"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-neutral-700">Product Image</p>
            <div className="flex gap-2 items-center flex-wrap">
              <label className="px-3 py-2 rounded-xl bg-neutral-100 text-xs font-bold text-neutral-700 hover:bg-neutral-200 cursor-pointer border border-neutral-300 transition-colors">
                Upload image file
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => uploadPhoto(e.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                onClick={() => setShowDesigner((v) => !v)}
                className="px-3 py-2 rounded-xl bg-neutral-100 text-xs font-bold text-neutral-700 hover:bg-neutral-200 cursor-pointer border border-neutral-300 transition-colors"
              >
                Design it in Studio
              </button>
              {newProduct.image_url && <span className="text-xs text-emerald-700 font-semibold">Image attached</span>}
            </div>
          </div>

          {showDesigner && (
            <div className="p-4 border border-neutral-300 rounded-2xl bg-neutral-50">
              <MerchDesigner
                onError={(m) => setError(m)}
                onDone={({ url }) => {
                  setNewProduct((f) => ({ ...f, image_url: url }))
                  setShowDesigner(false)
                }}
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-xs font-bold text-neutral-700 uppercase tracking-wider">Sizes & Initial Stock</p>
              <button
                type="button"
                onClick={() => setNewVariants((v) => [...v, { size: '', stock_quantity: '' }])}
                className="text-[#714B67] text-xs font-bold hover:underline bg-transparent border-none cursor-pointer"
              >
                + Add size
              </button>
            </div>
            {newVariants.map((v, i) => (
              <div key={i} className="flex gap-2">
                <input
                  placeholder="Size (e.g. S, M, L, XL, One size)"
                  value={v.size}
                  onChange={(e) =>
                    setNewVariants((arr) => {
                      const a = [...arr]
                      a[i] = { ...a[i], size: e.target.value }
                      return a
                    })
                  }
                  className="flex-1 px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs"
                />
                <input
                  placeholder="Stock qty"
                  value={v.stock_quantity}
                  onChange={(e) =>
                    setNewVariants((arr) => {
                      const a = [...arr]
                      a[i] = { ...a[i], stock_quantity: digits(e.target.value) }
                      return a
                    })
                  }
                  className="w-28 px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs"
                />
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={creatingProduct}
            className="px-6 py-2.5 rounded-xl bg-[#714B67] text-white font-bold text-xs hover:bg-[#5d3d54] transition disabled:opacity-40 border-none cursor-pointer shadow-md"
          >
            {creatingProduct ? 'Creating...' : 'Add Product'}
          </button>
        </form>
      )}

      {/* ── Checkout Review & Payment Modal ─────────────────────────────────── */}
      {checkout &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="bg-white border border-neutral-200 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-neutral-900 text-sm">Review your order</h3>
                <button
                  onClick={() => setCheckout(null)}
                  aria-label="Close"
                  className="p-1 rounded-lg bg-transparent border-none cursor-pointer text-neutral-400 hover:text-neutral-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {error && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 font-medium">
                  {error}
                </p>
              )}
              {checkoutLines.length === 0 ? (
                <p className="text-xs text-neutral-500 py-4 text-center">Nothing left in order.</p>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {checkoutLines.map((l) => (
                    <div key={l.vid} className="py-3 flex items-center gap-3">
                      {l.product.image_url ? (
                        <img
                          src={thumbSrc(l.product.image_url)}
                          alt=""
                          className="w-12 h-12 rounded-xl object-contain bg-neutral-100 p-1 border border-neutral-200"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center">
                          <ShoppingBag className="w-5 h-5 text-neutral-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-neutral-900 truncate">{l.product.name}</p>
                        <p className="text-[11px] text-neutral-500">
                          Size {l.variant.size} · ₹{unitPrice(l.product).toFixed(2)} each
                          {isMember ? ' (member price)' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setLineQty(l.vid, l.qty - 1)}
                          aria-label="One fewer"
                          className="w-6 h-6 rounded-md bg-neutral-100 border-none cursor-pointer text-neutral-700 font-bold"
                        >
                          -
                        </button>
                        <span className="w-5 text-center text-xs font-semibold">{l.qty}</span>
                        <button
                          onClick={() => setLineQty(l.vid, l.qty + 1)}
                          disabled={l.qty >= l.variant.stock_quantity}
                          aria-label="One more"
                          className="w-6 h-6 rounded-md bg-neutral-100 border-none cursor-pointer text-neutral-700 font-bold disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>
                      <p className="w-20 text-right text-xs font-black text-neutral-900">
                        ₹{(unitPrice(l.product) * l.qty).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {!memberId && (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Full name *"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs"
                  />
                  <input
                    type="email"
                    placeholder="Email address *"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs"
                  />
                </div>
              )}
              <div className="flex items-center justify-between border-t border-neutral-200 pt-3">
                <span className="text-xs font-semibold text-neutral-600">Total</span>
                <span className="text-lg font-black text-[#714B67]">₹{checkoutTotal.toFixed(2)}</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  onClick={() => confirmCheckout(true)}
                  disabled={checkoutBusy || checkoutLines.length === 0}
                  className="flex-1 py-3 rounded-xl bg-[#714B67] text-white text-xs font-bold border-none cursor-pointer hover:bg-[#5d3d54] transition disabled:opacity-40 shadow-md"
                >
                  {checkoutBusy ? 'Working...' : `Pay ₹${checkoutTotal.toFixed(2)} online`}
                </button>
                <button
                  onClick={() => confirmCheckout(false)}
                  disabled={checkoutBusy || checkoutLines.length === 0}
                  className="flex-1 py-3 rounded-xl bg-neutral-100 text-neutral-700 text-xs font-bold border border-neutral-300 cursor-pointer disabled:opacity-40 hover:bg-neutral-200"
                >
                  Reserve, pay later
                </button>
              </div>
              <p className="text-[10px] text-neutral-400 leading-normal">
                Reserved items are held for 15 minutes. You can also pay cash to an officer at pickup.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
