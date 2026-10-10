import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { ShoppingBag, Clock, Lock, ArrowLeft } from "lucide-react";
import { api, formatCurrency, APIClientError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface ProductDetail {
  product_id: number;
  name: string;
  price: string;
  member_price: string;
  variants: Array<{
    variant_id: number;
    size: string;
    stock_quantity: number;
  }>;
}

interface OrderPlacedResponse {
  order_id: number;
  status: string;
  total_amount: string;
}

export const CartCheckoutPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const variantIdParam = searchParams.get("variant_id");
  const productIdParam = searchParams.get("product_id");
  const sizeParam = searchParams.get("size");

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState(user?.full_name || "");
  const [buyerEmail, setBuyerEmail] = useState(user?.email || "");

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!productIdParam) {
      setLoading(false);
      return;
    }
    const fetchProd = async () => {
      try {
        const data = await api.get<ProductDetail>(`/products/${productIdParam}`);
        setProduct(data);
      } catch {
        setError("Failed to load product details.");
      } finally {
        setLoading(false);
      }
    };
    fetchProd();
  }, [productIdParam]);

  const isMember = user?.is_active;
  const unitPrice = product ? (isMember ? product.member_price : product.price) : "0.00";
  const totalAmount = (parseFloat(unitPrice) * quantity).toFixed(2);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantIdParam) return;

    if (!user && (!buyerName.trim() || !buyerEmail.trim())) {
      setError("Please provide your name and email to receive order confirmation.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setErrorCode(undefined);

    try {
      const payload = {
        member_id: user?.member_id || undefined,
        buyer_name: !user ? buyerName.trim() : undefined,
        buyer_email: !user ? buyerEmail.trim() : undefined,
        items: [
          {
            variant_id: parseInt(variantIdParam, 10),
            quantity,
          },
        ],
      };

      const result = await api.post<OrderPlacedResponse>("/orders", payload);

      navigate(
        `/payment/status?type=merch&order_id=${result.order_id}&amount=${result.total_amount}&count=${quantity}`
      );
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setErrorCode(err.code);
        if (err.code === "INSUFFICIENT_STOCK") {
          setError("That size is no longer available in this quantity.");
        } else if (err.code === "NON_MEMBER_LIMIT_REACHED") {
          setError("Sorry, the goodies for non-members have run out. Active members can still order.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to place order. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <LoadingSkeleton rows={5} />
      </div>
    );
  }

  if (!product || !variantIdParam) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-600 mb-4">No item selected for checkout.</p>
        <Link to="/shop" className="text-sky-600 font-semibold text-sm">
          Return to Merch Shop
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <Link
        to="/shop"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
      >
        <ArrowLeft className="h-4 w-4" /> Back to shop catalog
      </Link>

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Review & Complete Order
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Units are reserved first come, first served with atomic inventory decrement.
        </p>
      </div>

      {error && <ErrorBanner message={error} code={errorCode} />}

      <form onSubmit={handleCheckout} className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 space-y-6">
        {/* Item summary */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white rounded-xl border border-slate-200 text-slate-800">
              <ShoppingBag className="h-6 w-6 text-sky-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">{product.name}</h3>
              <p className="text-xs text-slate-500">Size: {sizeParam || "Standard"}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="font-bold text-slate-900 text-base block">
              {formatCurrency(unitPrice)}
            </span>
            {isMember && (
              <span className="text-[11px] text-emerald-600 font-semibold">
                Member Rate
              </span>
            )}
          </div>
        </div>

        {/* Quantity selector */}
        <div className="flex items-center justify-between py-2 border-y border-slate-100">
          <label className="text-sm font-bold text-slate-700">Quantity</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={quantity <= 1}
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center font-bold text-slate-700 disabled:opacity-40"
            >
              -
            </button>
            <span className="font-bold text-base w-6 text-center text-slate-900">
              {quantity}
            </span>
            <button
              type="button"
              disabled={quantity >= 5}
              onClick={() => setQuantity(quantity + 1)}
              className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center font-bold text-slate-700 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        {/* Non-member buyer details if not signed in */}
        {!user && (
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Customer Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Taylor Swift"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="taylor@example.com"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Order confirmation and pick-up details will be sent to this email.
            </p>
          </div>
        )}

        {/* 15-Minute hold note */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3 text-xs text-slate-600">
          <Clock className="h-4 w-4 text-slate-400 shrink-0" />
          <span>
            Stock is reserved for <strong>15 minutes</strong> upon order creation. If unpaid, units return to the store inventory.
          </span>
        </div>

        {/* Total & Submit */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-100">
          <div>
            <span className="text-xs text-slate-500 block">Total Due</span>
            <span className="text-2xl font-black text-slate-900">
              {formatCurrency(totalAmount)}
            </span>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            {isSubmitting ? "Holding Stock..." : `Pay ${formatCurrency(totalAmount)}`}
          </button>
        </div>
      </form>
    </div>
  );
};
