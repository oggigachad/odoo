import { createPortal } from 'react-dom'
import { useState, useEffect, useCallback } from 'react'
import { money, digits } from '../numeric'
import { Check, X, ShoppingBag, ArrowRight, ShieldCheck, Sparkles, Tag, Package } from 'lucide-react'
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
  price: string          // non-member price
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
  [variantId: number]: number  // variantId → qty
}

export default function ShopPanel({ memberId, memberName = '', memberEmail = '', isMember, isOfficer }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [myOrders, setMyOrders] = useState<Order[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'shop' | 'myorders' | 'manage' | 'addproduct'>('shop')
  const [cart, setCart] = useState<Cart>({})
  const [ordering, setOrdering] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Full screen product details modal state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [modalSelectedVariantId, setModalSelectedVariantId] = useState<number | null>(null)

  // New product form
  const [newProduct, setNewProduct] = useState({ name: '', description: '', price: '', member_price: '', non_member_limit: '0', max_per_member: '', max_per_guest: '', image_url: '' })
  const [newVariants, setNewVariants] = useState([{ size: '', stock_quantity: '' }])
  const [creatingProduct, setCreatingProduct] = useState(false)

  // Guest checkout modal state
  const [guestModal, setGuestModal] = useState(false)
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

  useEffect(() => { load() }, [load])
  useLiveRefresh(['shop'], load)

  const flash = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const totalCartItems = Object.values(cart).reduce((a, b) => a + b, 0)

  // Checkout: review the lines, create the order, then take payment straight away
  const [checkout, setCheckout] = useState<Cart | null>(null)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  useEffect(() => {
    if (!selectedProduct && !checkout) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [selectedProduct, checkout])
  const variantIndex = (() => {
    const m = new Map<number, { product: Product; variant: Variant }>()
    products.forEach(pr => pr.variants.forEach(v => m.set(v.variant_id, { product: pr, variant: v })))
    return m
  })()
  const unitPrice = (pr: Product) => parseFloat(isMember ? pr.member_price : pr.price)
  const checkoutLines = Object.entries(checkout ?? {})
    .filter(([, q]) => q > 0)
    .map(([vid, qty]) => ({ vid: Number(vid), qty, ...variantIndex.get(Number(vid)) }))
    .filter(l => l.product && l.variant) as { vid: number; qty: number; product: Product; variant: Variant }[]
  const checkoutTotal = checkoutLines.reduce((t, l) => t + unitPrice(l.product) * l.qty, 0)

  const openCheckout = (lines: Cart) => {
    if (!Object.values(lines).some(q => q > 0)) return
    setError(null)
    setSelectedProduct(null)
    setCheckout({ ...lines })
  }

  const setLineQty = (vid: number, qty: number) => {
    const max = variantIndex.get(vid)?.variant.stock_quantity ?? 0
    setCheckout(c => ({ ...(c ?? {}), [vid]: Math.max(0, Math.min(qty, max)) }))
  }

  const confirmCheckout = async (payNow: boolean) => {
    if (checkoutLines.length === 0) return
    const buyerName = (guestName || memberName).trim()
    const buyerEmail = (guestEmail || memberEmail).trim()
    if (!memberId && (!buyerName || !buyerEmail)) { setError('Enter your name and email so we can reach you about the order.'); return }
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
          items: checkoutLines.map(l => ({ variant_id: l.vid, quantity: l.qty })),
        }),
      })
    } catch (e) {
      setCheckoutBusy(false)
      setError(errorMessage(e, 'Could not place the order.'))
      return
    }
    // the order exists and its stock is held; whatever happens next, the cart is spent
    setCart({})
    setCheckout(null)
    load()
    if (!payNow) {
      setCheckoutBusy(false)
      flash(`Order #${order.order_id} placed. Pay from My Orders within 15 minutes to keep your items.`)
      return
    }
    await processRazorpayPayment({
      category: 'merchandise',
      amount: parseFloat(order.total_amount).toFixed(2),
      description: `Merchandise order #${order.order_id}`,
      user: { id: String(memberId ?? 0), memberId: memberId ?? 0, name: buyerName, email: buyerEmail, role: isMember ? 'Member' : 'Guest', roles: [], isActive: !!isMember },
      order_id: order.order_id,
      onSuccess: () => { setCheckoutBusy(false); flash(`Payment received. Order #${order.order_id} is paid.`); load(); setTab('myorders') },
      onError: m => { setCheckoutBusy(false); setError(`${m} Order #${order.order_id} is held for 15 minutes: pay from My Orders.`); load(); setTab('myorders') },
    })
  }

  const payOrder = async (o: { order_id: number; total_amount: string }) => {
    await processRazorpayPayment({
      category: 'merchandise',
      amount: parseFloat(o.total_amount).toFixed(2),
      description: `Merchandise order #${o.order_id}`,
      user: { id: String(memberId), memberId: memberId ?? 0, name: memberName, email: memberEmail, role: isMember ? 'Member' : 'Guest', roles: [], isActive: !!isMember },
      order_id: o.order_id,
      onSuccess: () => { flash('Payment received. Your order is paid.'); load() },
      onError: m => setError(m),
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
      setSelectedProduct(sp => (sp && sp.product_id === productId ? { ...sp, image_url: url } : sp))
      setEditDesigner(false)
      flash('Product picture updated.')
      load()
    } catch (e: any) { setError(e?.message ?? 'Could not update the picture.') }
  }
  const replacePhoto = async (productId: number, file: File | undefined) => {
    if (!file) return
    const body = new FormData()
    body.append('file', file)
    try {
      const res = await fetch(`${API_BASE}/products/image`, { method: 'POST', body, headers: { Authorization: `Bearer ${getToken() ?? ''}` }, credentials: 'include' })
      if (!res.ok) throw new Error()
      await attachImage(productId, (await res.json()).url)
    } catch { setError('Could not upload the image (PNG, JPEG or WebP up to 5 MB).') }
  }
  const thumbSrc = (u?: string | null) => (u ? imgSrc(u.replace('/products/', '/products/t_').replace(/\.(png|jpg|jpeg|webp)$/i, '.webp')) : '')
  const imgSrc = (u?: string | null) => (u ? (u.startsWith('http') ? u : `${API_ORIGIN}${u}`) : '')
  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return
    const body = new FormData()
    body.append('file', file)
    try {
      const res = await fetch(`${API_BASE}/products/image`, { method: 'POST', body, headers: { Authorization: `Bearer ${getToken() ?? ''}` }, credentials: 'include' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setNewProduct(f => ({ ...f, image_url: data.url }))
    } catch { setError('Could not upload the image (PNG, JPEG or WebP up to 5 MB).') }
  }

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProduct.name || !newProduct.price) { setError('Name and price required.'); return }
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
      setNewProduct({ name: '', description: '', price: '', member_price: '', non_member_limit: '0', max_per_member: '', max_per_guest: '', image_url: '' }); setShowDesigner(false)
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
    if (product.variants.length > 0) {
      setModalSelectedVariantId(product.variants[0].variant_id)
    } else {
      setModalSelectedVariantId(null)
    }
  }

  const tabs = [
    { key: 'shop' as const, label: `Shop${totalCartItems > 0 ? ` (${totalCartItems})` : ''}` },
    ...(memberId ? [{ key: 'myorders' as const, label: 'My Orders' }] : []),
    ...(isOfficer ? [{ key: 'manage' as const, label: 'All Orders' }, { key: 'addproduct' as const, label: '+ Add Merchandise' }] : []),
  ]

  return (
    <div style={FONT} className="space-y-4 animate-fadeIn">
      {/* Sub tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              tab === t.key ? 'bg-[#714B67] text-white shadow-md' : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{error} <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button></div>}

      {loading && tab !== 'addproduct' ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-[#714B67] border-t-transparent rounded-full animate-spin" /></div>
      ) : tab === 'shop' ? (
        <div className="space-y-4">
          {products.length === 0 ? (
            <p className="text-neutral-500 text-sm text-center py-12">No merchandise available yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map(p => {
                  const price = isMember ? p.member_price : p.price
                  const savings = parseFloat(p.price) - parseFloat(p.member_price)
                  const totalStock = p.variants.reduce((acc, v) => acc + v.stock_quantity, 0)

                  return (
                    <div
                      key={p.product_id}
                      onClick={() => openProductModal(p)}
                      className=" overflow-hidden transition-all hover:-translate-y-1 cursor-pointer group flex flex-col justify-between border-b border-neutral-200"
                    >
                      <div>
                        <div className={`${p.image_url ? 'aspect-square bg-[#f4f1f4]' : 'h-40 bg-gradient-to-br from-[#0284C7]/20 via-[#48223f]/40 to-[#714B67]/30'} flex flex-col items-center justify-center relative overflow-hidden`}>
                          {p.image_url
                            ? <img src={thumbSrc(p.image_url)} alt={p.name} loading="lazy" onError={e => { e.currentTarget.src = imgSrc(p.image_url) }} className="absolute inset-0 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
                            : <ShoppingBag className="w-12 h-12 text-neutral-400 group-hover:text-neutral-600 transition-colors" />}
                          <span className="absolute bottom-2 right-2 text-[10px] bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full text-neutral-700 font-semibold border border-neutral-200">
                            {totalStock > 0 ? `${totalStock} in stock` : 'Out of stock'}
                          </span>
                        </div>
                        <div className="p-4">
                          <div className="flex justify-between items-start mb-1">
                            <h3 className="font-bold text-neutral-900 text-sm group-hover:text-[#714B67] transition-colors">{p.name}</h3>
                            <span className="font-black text-[#714B67] text-sm">₹{price}</span>
                          </div>
                          {isMember && savings > 0 && (
                            <p className="text-emerald-700 text-[10px] font-semibold mb-1">Member exclusive (Save ₹{savings.toFixed(2)})</p>
                          )}
                          {p.description && <p className="text-neutral-500 text-xs mb-3 line-clamp-2 leading-relaxed">{p.description}</p>}
                        </div>
                      </div>

                      <div className="p-4 pt-0">
                        <div className="flex items-center justify-between text-xs text-neutral-600 border-t border-neutral-200 pt-3">
                          <span className="text-[11px] font-semibold text-[#714B67]">View Details & Sizes</span>
                          <ArrowRight className="w-3.5 h-3.5 text-neutral-500 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {totalCartItems > 0 && (
                <div className="sticky bottom-4 flex justify-end z-20">
                  <button onClick={() => openCheckout(cart)} disabled={checkoutBusy}
                    className="px-6 py-3 rounded-2xl bg-[#714B67] text-white font-bold text-sm shadow-2xl hover:bg-[#5d3d54] transition disabled:opacity-40 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4" />
                    <span>{`Checkout (${totalCartItems} items)`}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : tab === 'myorders' ? (
        myOrders.length === 0 ? <p className="text-neutral-500 text-sm text-center py-12">No orders yet.</p> : (
          <div className="space-y-3">
            {myOrders.map(o => (
              <div key={o.order_id} className=" p-4 border-b border-neutral-200">
                <div className="flex justify-between items-start">
                  <div>
                    {o.items.map((it, i) => (
                      <p key={i} className="text-neutral-900 text-xs font-bold">{it.product_name} — {it.size} × {it.quantity}</p>
                    ))}
                    <p className="text-neutral-500 text-[10px] mt-1">{new Date(o.ordered_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-[#714B67]">₹{o.total_amount}</p>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      o.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : o.status === 'cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>{o.status}</span>
                    {o.status === 'placed' && (
                      <>
                      <button onClick={() => payOrder(o)}
                        className="block mt-1.5 ml-auto px-3 py-1 rounded-md bg-[#714B67] text-white text-[10px] font-semibold border-none cursor-pointer">Pay online</button>
                      <button onClick={() => handleCancelOrder(o.order_id)}
                        className="block mt-1 ml-auto text-[10px] text-rose-700 hover:underline">Cancel</button>
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
        allOrders.length === 0 ? <p className="text-neutral-500 text-sm text-center py-12">No orders yet.</p> : (
          <div className="space-y-3">
            {allOrders.map(o => (
              <div key={o.order_id} className=" p-4 flex justify-between items-center border-b border-neutral-200">
                <div>
                  <p className="text-neutral-900 text-xs font-bold">{o.buyer_name ?? `Member #${o.member_id}`}</p>
                  <p className="text-neutral-500 text-[10px]">{o.items.map(it => `${it.product_name} ${it.size}×${it.quantity}`).join(', ')}</p>
                  <p className="text-neutral-400 text-[10px]">{new Date(o.ordered_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-[#714B67]">₹{o.total_amount}</p>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                    o.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : o.status === 'cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>{o.status}</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Add Product form */
        <form onSubmit={handleCreateProduct} className="space-y-4 p-6 border-b border-neutral-200">
          <h3 className="font-bold text-neutral-900 text-sm">Add Merchandise</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Product name *" value={newProduct.name} onChange={e => setNewProduct(f => ({ ...f, name: e.target.value }))}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs col-span-2" />
            <input required placeholder="Guest price (₹) *" value={newProduct.price} onChange={e => setNewProduct(f => ({ ...f, price: money(e.target.value) }))}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
            <input placeholder="Member price (₹)" value={newProduct.member_price} onChange={e => setNewProduct(f => ({ ...f, member_price: money(e.target.value) }))}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
            <input placeholder="Guest unit limit (0=unlimited)" value={newProduct.non_member_limit} onChange={e => setNewProduct(f => ({ ...f, non_member_limit: digits(e.target.value) }))}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
            <input placeholder="Max units per member (blank = no cap)" inputMode="numeric" value={newProduct.max_per_member} onChange={e => setNewProduct(f => ({ ...f, max_per_member: e.target.value.replace(/\D/g, '') }))}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
            <input placeholder="Max units per guest (blank = no cap)" inputMode="numeric" value={newProduct.max_per_guest} onChange={e => setNewProduct(f => ({ ...f, max_per_guest: e.target.value.replace(/\D/g, '') }))}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
            <div className="col-span-2 space-y-2">
              <p className="text-[10px] font-semibold text-neutral-500">Product picture</p>
              <div className="flex flex-wrap items-center gap-2">
                {newProduct.image_url && <img src={thumbSrc(newProduct.image_url)} alt="Product" className="w-16 h-16 rounded-lg object-cover border border-neutral-200" />}
                <label className="px-3 py-2 rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-700 cursor-pointer">
                  Upload a photo
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => uploadPhoto(e.target.files?.[0])} />
                </label>
                <button type="button" onClick={() => setShowDesigner(v => !v)}
                  className="px-3 py-2 rounded-lg bg-[#714B67] text-white text-xs font-semibold border-none cursor-pointer">{showDesigner ? 'Close design studio' : 'Design it (shirt, hoodie, tote)'}</button>
              </div>
              {showDesigner && (
                <MerchDesigner
                  onError={m => setError(m)}
                  onDone={({ url, garment }) => { setNewProduct(f => ({ ...f, image_url: url, name: f.name || `Club ${garment}` })); setShowDesigner(false) }}
                />
              )}
            </div>
            <textarea placeholder="Description" rows={2} value={newProduct.description} onChange={e => setNewProduct(f => ({ ...f, description: e.target.value }))}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs resize-none col-span-2" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-neutral-600 text-xs font-bold uppercase tracking-wider">Sizes / Variants</p>
              <button type="button" onClick={() => setNewVariants(v => [...v, { size: '', stock_quantity: '' }])} className="text-[#714B67] text-xs hover:underline">+ Add size</button>
            </div>
            {newVariants.map((v, i) => (
              <div key={i} className="flex gap-2">
                <input placeholder="Size (e.g. M)" value={v.size} onChange={e => setNewVariants(arr => { const a = [...arr]; a[i] = { ...a[i], size: e.target.value }; return a })}
                  className="flex-1 px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs" />
                <input placeholder="Stock qty" value={v.stock_quantity} onChange={e => setNewVariants(arr => { const a = [...arr]; a[i] = { ...a[i], stock_quantity: digits(e.target.value) }; return a })}
                  className="w-28 px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs" />
              </div>
            ))}
          </div>
          <button type="submit" disabled={creatingProduct}
            className="px-6 py-2.5 rounded-xl bg-[#714B67] text-white font-bold text-xs hover:bg-[#5d3d54] transition disabled:opacity-40">
            {creatingProduct ? 'Creating...' : 'Add Product'}
          </button>
        </form>
      )}

      {/* ── Full Screen Product Details Modal ─────────────────────────────── */}
      {selectedProduct && createPortal(
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-8 animate-fadeIn">
          <div className="bg-white border border-neutral-300 rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl relative flex flex-col md:flex-row overflow-hidden">
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-neutral-100 hover:bg-neutral-100 text-neutral-700 hover:text-neutral-900 transition cursor-pointer border-none"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Left Image / Visual Banner */}
            <div className="md:w-5/12 bg-gradient-to-br from-[#0284C7]/30 via-[#714B67]/40 to-[#48223f] p-8 flex flex-col items-center justify-center relative min-h-[220px]">
              {selectedProduct.image_url
                ? <img src={imgSrc(selectedProduct.image_url)} alt={selectedProduct.name} className="w-full max-w-[260px] rounded-2xl bg-white shadow-2xl" />
                : <div className="w-28 h-28 rounded-3xl bg-neutral-100 border border-neutral-300 flex items-center justify-center shadow-2xl">
                    <ShoppingBag className="w-14 h-14 text-neutral-900" />
                  </div>}
              {isOfficer && (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <label className="px-3 py-1.5 rounded-lg bg-white/90 text-[11px] font-semibold text-neutral-800 cursor-pointer">
                    Upload picture
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { replacePhoto(selectedProduct.product_id, e.target.files?.[0]); e.target.value = '' }} />
                  </label>
                  <button type="button" onClick={async () => {
                    if (!window.confirm(`Remove "${selectedProduct.name}" from the shop?`)) return
                    try {
                      await api(`/products/${selectedProduct.product_id}`, { method: 'DELETE' })
                      setSelectedProduct(null); flash('Product removed.'); load()
                    } catch (e: any) { setError(e?.message ?? 'Could not remove the product.') }
                  }} className="px-3 py-1.5 rounded-lg bg-white/90 text-[11px] font-semibold text-rose-700 border-none cursor-pointer">Delete product</button>
                  <button type="button" onClick={() => setEditDesigner(v => !v)} className="px-3 py-1.5 rounded-lg bg-white/90 text-[11px] font-semibold text-neutral-800 border-none cursor-pointer">Design it</button>
                </div>
              )}
              <span className="mt-4 px-3 py-1 rounded-full text-xs font-bold bg-neutral-100 text-neutral-800 border border-neutral-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#714B67]" />
                Official Club Merchandise
              </span>
            </div>

            {isOfficer && editDesigner && (
              <div className="absolute inset-x-3 top-14 z-30 bg-white rounded-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
                <MerchDesigner onError={m => setError(m)} onDone={async ({ url }) => attachImage(selectedProduct.product_id, url)} />
              </div>
            )}

            {/* Right Product Specifications & Purchasing Actions */}
            <div className="md:w-7/12 p-6 sm:p-8 flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#714B67] bg-[#714B67]/20 border border-[#714B67]/30 px-2.5 py-0.5 rounded-full">
                    Skyline Campus Gear
                  </span>
                  {selectedProduct.non_member_limit > 0 && (
                    <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      Limit {selectedProduct.non_member_limit}/guest
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-neutral-900 leading-tight mb-2">
                  {selectedProduct.name}
                </h2>

                <div className="flex items-baseline gap-3 mb-4">
                  <span className="text-2xl font-black text-[#714B67]">
                    ₹{isMember ? selectedProduct.member_price : selectedProduct.price}
                  </span>
                  {isMember && parseFloat(selectedProduct.member_price) < parseFloat(selectedProduct.price) && (
                    <span className="text-xs text-neutral-500 line-through">
                      ₹{selectedProduct.price}
                    </span>
                  )}
                  {isMember && parseFloat(selectedProduct.member_price) < parseFloat(selectedProduct.price) && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Save ₹{(parseFloat(selectedProduct.price) - parseFloat(selectedProduct.member_price)).toFixed(2)}
                    </span>
                  )}
                </div>

                <p className="text-neutral-700 text-xs sm:text-sm leading-relaxed mb-6">
                  {selectedProduct.description || 'Authentic campus merchandise engineered for club volunteers, members, and student supporters.'}
                </p>

                {/* Size / Variant Picker */}
                <div className="space-y-2 mb-6">
                  <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider flex items-center justify-between">
                    <span>Select Size / Variant:</span>
                    <span className="text-[11px] text-neutral-500">
                      {selectedProduct.variants.find(v => v.variant_id === modalSelectedVariantId)?.stock_quantity ?? 0} units left
                    </span>
                  </label>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {selectedProduct.variants.map(v => {
                      const isSelected = modalSelectedVariantId === v.variant_id
                      const oos = v.stock_quantity === 0
                      const inCart = cart[v.variant_id] ?? 0

                      return (
                        <button
                          key={v.variant_id}
                          disabled={oos}
                          onClick={() => setModalSelectedVariantId(v.variant_id)}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center transition-all ${
                            oos
                              ? 'border-neutral-200 bg-transparent text-neutral-300 cursor-not-allowed'
                              : isSelected
                              ? 'border-[#714B67] bg-[#714B67]/20 text-neutral-900 shadow-md'
                              : 'border-neutral-200 bg-transparent text-neutral-700 hover:bg-neutral-100'
                          }`}
                        >
                          <span className="text-sm font-black">{v.size}</span>
                          <span className="text-[10px] font-normal opacity-70">
                            {oos ? 'Sold out' : `${v.stock_quantity} left`}
                            {inCart > 0 && ` (${inCart} in cart)`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-neutral-200 flex flex-col sm:flex-row gap-3">
                <button
                  disabled={!modalSelectedVariantId || (selectedProduct.variants.find(v => v.variant_id === modalSelectedVariantId)?.stock_quantity ?? 0) === 0}
                  onClick={() => {
                    if (modalSelectedVariantId) {
                      const cur = cart[modalSelectedVariantId] ?? 0
                      const max = selectedProduct.variants.find(v => v.variant_id === modalSelectedVariantId)?.stock_quantity ?? 1
                      if (cur < max) {
                        setCart(c => ({ ...c, [modalSelectedVariantId]: cur + 1 }))
                        flash(`Added ${selectedProduct.name} to your cart. Use Checkout when you are ready.`)
                        setSelectedProduct(null)
                      }
                    }
                  }}
                  className="flex-1 py-3 rounded-2xl bg-neutral-100 hover:bg-neutral-100 text-neutral-900 font-bold text-xs border border-neutral-300 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-30"
                >
                  <Tag className="w-4 h-4" />
                  <span>Add to Cart</span>
                </button>

                <button
                  disabled={checkoutBusy || !modalSelectedVariantId || (selectedProduct.variants.find(v => v.variant_id === modalSelectedVariantId)?.stock_quantity ?? 0) === 0}
                  onClick={() => { if (modalSelectedVariantId) openCheckout({ [modalSelectedVariantId]: 1 }) }}
                  className="flex-1 py-3 rounded-2xl bg-[#714B67] hover:bg-[#5d3d54] text-white font-bold text-xs shadow-xl transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-30"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Buy now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ── Checkout: review, then pay ─────────────────────────────────── */}
      {checkout && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-neutral-900 text-sm">Review your order</h3>
              <button onClick={() => setCheckout(null)} aria-label="Close" className="p-1 rounded-lg bg-transparent border-none cursor-pointer text-neutral-400 hover:text-neutral-700"><X className="w-4 h-4" /></button>
            </div>
            {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
            {checkoutLines.length === 0 ? (
              <p className="text-xs text-neutral-500">Nothing left to buy.</p>
            ) : (
              <div className="divide-y divide-neutral-200">
                {checkoutLines.map(l => (
                  <div key={l.vid} className="py-3 flex items-center gap-3">
                    {l.product.image_url
                      ? <img src={thumbSrc(l.product.image_url)} alt="" className="w-12 h-12 rounded-lg object-contain bg-neutral-100" />
                      : <div className="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-neutral-400" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-neutral-900 truncate">{l.product.name}</p>
                      <p className="text-[11px] text-neutral-500">Size {l.variant.size} · ₹{unitPrice(l.product).toFixed(2)} each{isMember ? ' (member price)' : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setLineQty(l.vid, l.qty - 1)} aria-label="One fewer" className="w-6 h-6 rounded-md bg-neutral-100 border-none cursor-pointer text-neutral-700">-</button>
                      <span className="w-5 text-center text-xs font-semibold">{l.qty}</span>
                      <button onClick={() => setLineQty(l.vid, l.qty + 1)} disabled={l.qty >= l.variant.stock_quantity} aria-label="One more" className="w-6 h-6 rounded-md bg-neutral-100 border-none cursor-pointer text-neutral-700 disabled:opacity-30">+</button>
                    </div>
                    <p className="w-20 text-right text-xs font-bold text-neutral-900">₹{(unitPrice(l.product) * l.qty).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
            {!memberId && (
              <div className="space-y-2">
                <input type="text" placeholder="Full name *" value={guestName} onChange={e => setGuestName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
                <input type="email" placeholder="Email address *" value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
              </div>
            )}
            <div className="flex items-center justify-between border-t border-neutral-200 pt-3">
              <span className="text-xs font-semibold text-neutral-600">Total</span>
              <span className="text-lg font-black text-[#714B67]">₹{checkoutTotal.toFixed(2)}</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={() => confirmCheckout(true)} disabled={checkoutBusy || checkoutLines.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-[#714B67] text-white text-xs font-bold border-none cursor-pointer hover:bg-[#5d3d54] transition disabled:opacity-40">
                {checkoutBusy ? 'Working...' : `Pay ₹${checkoutTotal.toFixed(2)} online`}
              </button>
              <button onClick={() => confirmCheckout(false)} disabled={checkoutBusy || checkoutLines.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-neutral-100 text-neutral-700 text-xs font-bold border border-neutral-300 cursor-pointer disabled:opacity-40">
                Reserve, pay later
              </button>
            </div>
            <p className="text-[10px] text-neutral-500">Reserved items are held for 15 minutes. You can also pay cash to an officer, who marks the order paid.</p>
          </div>
        </div>
      , document.body)}
    </div>
  )
}
