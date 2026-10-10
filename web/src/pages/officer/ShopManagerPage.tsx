import React, { useEffect, useState } from "react";
import { ShoppingBag, Plus, Package, AlertCircle } from "lucide-react";
import { api, formatCurrency, APIClientError } from "../../lib/api";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface VariantItem {
  variant_id: number;
  product_id: number;
  size: string;
  stock_quantity: number;
}

interface ProductItem {
  product_id: number;
  name: string;
  description?: string;
  price: string;
  member_price: string;
  non_member_limit: number;
  non_member_units_taken: number;
  non_member_units_left: number;
  variants: VariantItem[];
}

interface OrderRecord {
  order_id: number;
  member_id?: number | null;
  buyer_name?: string | null;
  buyer_email?: string | null;
  status: string;
  total_amount: string;
  ordered_at: string;
  items: Array<{
    variant_id: number;
    product_name: string;
    size: string;
    quantity: number;
    unit_price: string;
  }>;
}

export const ShopManagerPage: React.FC = () => {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Product Modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [pName, setPName] = useState("");
  const [pPrice, setPPrice] = useState("500.00");
  const [pMemberPrice, setPMemberPrice] = useState("400.00");
  const [pNonMemberLimit, setPNonMemberLimit] = useState("20");
  const [pSubmitting, setPSubmitting] = useState(false);
  const [pError, setPError] = useState<string | null>(null);

  // Add Size Variant Modal
  const [modalProduct, setModalProduct] = useState<ProductItem | null>(null);
  const [vSize, setVSize] = useState("M");
  const [vStock, setVStock] = useState("25");
  const [vSubmitting, setVSubmitting] = useState(false);
  const [vError, setVError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const pUrl = "/products";
      const oUrl = orderStatusFilter ? `/orders?status=${orderStatusFilter}` : "/orders";

      const [prodsRes, ordersRes] = await Promise.all([
        api.get<ProductItem[]>(pUrl),
        api.get<OrderRecord[]>(oUrl),
      ]);
      setProducts(prodsRes);
      setOrders(ordersRes);
    } catch {
      setError("Failed to load shop catalog and orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orderStatusFilter]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) return;

    setPSubmitting(true);
    setPError(null);

    try {
      await api.post("/products", {
        name: pName.trim(),
        price: parseFloat(pPrice).toFixed(2),
        member_price: parseFloat(pMemberPrice).toFixed(2),
        non_member_limit: parseInt(pNonMemberLimit, 10),
        variants: [{ size: "M", stock_quantity: 20 }],
      });

      setPName("");
      setShowProductModal(false);
      await fetchData();
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setPError(err.message);
      } else {
        setPError("Failed to create product.");
      }
    } finally {
      setPSubmitting(false);
    }
  };

  const handleAddVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalProduct || !vSize.trim()) return;

    setVSubmitting(true);
    setVError(null);

    try {
      await api.post(`/products/${modalProduct.product_id}/variants`, {
        size: vSize.trim(),
        stock_quantity: parseInt(vStock, 10),
      });

      setModalProduct(null);
      await fetchData();
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setVError(err.message);
      } else {
        setVError("Failed to add size variant.");
      }
    } finally {
      setVSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Merchandise Stock & Orders Manager
          </h1>
          <p className="mt-1 text-base text-slate-600">
            Track product variants, enforce non-member limits, and audit pending store orders.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowProductModal(!showProductModal)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-sm transition"
        >
          <Plus className="h-4 w-4" />
          Add New Product
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchData} />}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <>
          {/* Products & Inventory Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Package className="h-5 w-5 text-sky-600" />
              Store Catalog & Non-Member Limits
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((p) => {
                const totalStock = p.variants.reduce((a, b) => a + b.stock_quantity, 0);

                return (
                  <div
                    key={p.product_id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h3 className="font-bold text-lg text-slate-900">{p.name}</h3>
                        <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {totalStock} in stock
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 space-y-1 mb-4">
                        <p>
                          Price: {formatCurrency(p.price)} • Members:{" "}
                          <strong className="text-slate-900">{formatCurrency(p.member_price)}</strong>
                        </p>
                        <p>
                          Non-member limit:{" "}
                          <strong>
                            {p.non_member_limit > 0
                              ? `${p.non_member_units_taken} / ${p.non_member_limit} taken (${p.non_member_units_left} left)`
                              : "Members Only"}
                          </strong>
                        </p>
                      </div>

                      {/* Sizes list */}
                      <div className="space-y-1.5 border-t border-slate-100 pt-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                          Size Variants
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {p.variants.map((v) => (
                            <span
                              key={v.variant_id}
                              className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono font-semibold text-slate-700"
                            >
                              {v.size}: {v.stock_quantity}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setModalProduct(p)}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Size / Stock
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Orders Section */}
          <div className="space-y-4 pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-indigo-600" />
                Customer Orders
              </h2>

              <div className="flex items-center gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter("")}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    orderStatusFilter === ""
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  All Orders
                </button>
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter("paid")}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    orderStatusFilter === "paid"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Paid
                </button>
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter("placed")}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    orderStatusFilter === "placed"
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Placed (Unpaid)
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Order ID</th>
                    <th className="px-6 py-4">Buyer</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Items</th>
                    <th className="px-6 py-4">Total</th>
                    <th className="px-6 py-4">Ordered At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {orders.map((o) => (
                    <tr key={o.order_id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-mono font-bold text-slate-900">
                        #{o.order_id}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">
                          {o.buyer_name || (o.member_id ? `Member #${o.member_id}` : "Guest")}
                        </p>
                        {o.buyer_email && <p className="text-slate-400">{o.buyer_email}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                            o.status === "paid"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : o.status === "placed"
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {o.items.map((it, idx) => (
                          <div key={idx}>
                            {it.product_name} ({it.size}) × {it.quantity}
                          </div>
                        ))}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-900">
                        {formatCurrency(o.total_amount)}
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        {new Date(o.ordered_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Add Merchandise Product</h3>

            {pError && (
              <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{pError}</span>
              </div>
            )}

            <form onSubmit={handleCreateProduct} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder="e.g. Skyline Zip-Up Hoodie"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Member Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={pMemberPrice}
                    onChange={(e) => setPMemberPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Non-Member Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={pPrice}
                    onChange={(e) => setPPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Non-Member Quota Limit (D-026)
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={pNonMemberLimit}
                  onChange={(e) => setPNonMemberLimit(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Maximum units non-members can buy across all sizes (0 = members only).
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pSubmitting}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                >
                  {pSubmitting ? "Creating..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Variant Modal */}
      {modalProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Add Size / Stock to {modalProduct.name}
            </h3>

            {vError && (
              <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{vError}</span>
              </div>
            )}

            <form onSubmit={handleAddVariant} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Size Label *
                </label>
                <input
                  type="text"
                  required
                  value={vSize}
                  onChange={(e) => setVSize(e.target.value)}
                  placeholder="e.g. S, M, L, XL, XXL"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Stock Units *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={vStock}
                  onChange={(e) => setVStock(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalProduct(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={vSubmitting}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                >
                  {vSubmitting ? "Updating..." : "Update Variant Stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
