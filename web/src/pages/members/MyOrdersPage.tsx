import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Clock, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { api, formatCurrency } from "../../lib/api";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface OrderItem {
  variant_id: number;
  product_name: string;
  size: string;
  quantity: number;
  unit_price: string;
}

interface OrderRecord {
  order_id: number;
  status: string;
  total_amount: string;
  ordered_at: string;
  items: OrderItem[];
}

export const MyOrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<OrderRecord[]>("/me/orders");
      setOrders(data);
    } catch {
      setError("Unable to load orders history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "paid":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" /> Paid & Confirmed
          </span>
        );
      case "placed":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3" /> Unpaid (15m Hold)
          </span>
        );
      case "cancelled":
      case "expired":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
            <XCircle className="h-3 w-3" /> {status.toUpperCase()}
          </span>
        );
      default:
        return (
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          My Merchandise Orders
        </h1>
        <p className="mt-1 text-base text-slate-600">
          Track official apparel orders, receipt status, and campus pickup readiness.
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchOrders} />}

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : orders.length === 0 ? (
        <EmptyState
          message="You haven't placed any merchandise orders yet."
          actionText="Visit Merch Store"
          actionHref="/shop"
          icon={<ShoppingBag className="w-12 h-12" />}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div
              key={o.order_id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    Order #{o.order_id}
                  </span>
                  {getStatusBadge(o.status)}
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(o.ordered_at).toLocaleDateString("en-IN", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {o.items.map((item, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{item.product_name}</p>
                      <p className="text-xs text-slate-500">
                        Size: {item.size} • Qty: {item.quantity}
                      </p>
                    </div>
                    <span className="font-mono font-medium text-slate-800">
                      {formatCurrency(item.unit_price)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Order Total
                </span>
                <span className="text-lg font-black text-slate-900">
                  {formatCurrency(o.total_amount)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 text-center">
        <Link
          to="/shop"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-800"
        >
          Browse more merchandise <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
};
