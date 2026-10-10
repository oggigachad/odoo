import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, ShieldCheck, Check, ArrowRight } from "lucide-react";
import { api, formatCurrency } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { EmptyState } from "../../components/common/EmptyState";
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
  price: string; // non-member price
  member_price: string;
  non_member_limit: number;
  non_member_units_taken: number;
  non_member_units_left: number;
  variants: VariantItem[];
}

export const ShopPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected variants per product
  const [selectedVariants, setSelectedVariants] = useState<Record<number, number>>({});

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ProductItem[]>("/products");
      setProducts(data);
      // Pre-select first available variant
      const initial: Record<number, number> = {};
      data.forEach((p) => {
        const available = p.variants.find((v) => v.stock_quantity > 0);
        if (available) {
          initial[p.product_id] = available.variant_id;
        } else if (p.variants.length > 0) {
          initial[p.product_id] = p.variants[0].variant_id;
        }
      });
      setSelectedVariants(initial);
    } catch {
      setError("Failed to load shop catalog.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const isMember = user?.is_active;

  const handleBuyNow = (product: ProductItem) => {
    const variantId = selectedVariants[product.product_id];
    if (!variantId) return;
    const variant = product.variants.find((v) => v.variant_id === variantId);
    if (!variant || variant.stock_quantity <= 0) return;

    // Navigate to checkout with item query
    navigate(
      `/shop/checkout?variant_id=${variantId}&product_id=${product.product_id}&size=${encodeURIComponent(
        variant.size
      )}&quantity=1`
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 mb-2">
            <ShoppingBag className="h-3.5 w-3.5" />
            Official Merchandise Store
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Association Apparel & Goodies
          </h1>
          <p className="mt-2 text-base text-slate-600">
            Authentic hoodies, t-shirts, and accessories. Verified stock with instant reservation.
          </p>
        </div>

        {user && (
          <div className="self-start sm:self-auto p-3 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center gap-2 text-xs">
            {isMember ? (
              <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <ShieldCheck className="h-4 w-4" />
                Member Pricing Unlocked
              </span>
            ) : (
              <Link to="/join" className="text-sky-600 hover:text-sky-800 font-medium">
                Renew membership for special member rates &rarr;
              </Link>
            )}
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchProducts} />}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : products.length === 0 ? (
        <EmptyState
          message="No merchandise listed currently. Check back soon for new drop announcements!"
          icon={<ShoppingBag className="w-12 h-12" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product) => {
            const selectedVarId = selectedVariants[product.product_id];
            const currentVariant = product.variants.find((v) => v.variant_id === selectedVarId);
            const totalStock = product.variants.reduce((acc, v) => acc + v.stock_quantity, 0);
            const isOutOfStock = totalStock <= 0;

            const nonMemberLimitApplies = product.non_member_limit > 0;
            const nonMemberSoldOut =
              nonMemberLimitApplies && product.non_member_units_left <= 0;

            const displayPrice = isMember ? product.member_price : product.price;

            return (
              <div
                key={product.product_id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col justify-between"
              >
                <div className="p-6">
                  {/* Quota / Status Badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {isOutOfStock ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                        Out of Stock
                      </span>
                    ) : totalStock < 10 ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Only {totalStock} left
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        In Stock
                      </span>
                    )}

                    {!isMember && nonMemberLimitApplies && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          nonMemberSoldOut
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {nonMemberSoldOut
                          ? "Sold out for non-members"
                          : `${product.non_member_units_left} left for non-members`}
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 mb-1">
                    {product.name}
                  </h3>

                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-2xl font-black text-slate-900">
                      {formatCurrency(displayPrice)}
                    </span>
                    {!isMember && (
                      <span className="text-xs text-slate-500">
                        (Members pay {formatCurrency(product.member_price)})
                      </span>
                    )}
                    {isMember && (
                      <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                        <Check className="h-3 w-3" /> Member Rate
                      </span>
                    )}
                  </div>

                  {product.description && (
                    <p className="text-sm text-slate-600 line-clamp-3 mb-6 leading-relaxed">
                      {product.description}
                    </p>
                  )}

                  {/* Size chips */}
                  {product.variants.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Available Sizes
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {product.variants.map((v) => {
                          const isSelected = selectedVarId === v.variant_id;
                          const isZero = v.stock_quantity <= 0;

                          return (
                            <button
                              type="button"
                              key={v.variant_id}
                              disabled={isZero}
                              onClick={() =>
                                setSelectedVariants({
                                  ...selectedVariants,
                                  [product.product_id]: v.variant_id,
                                })
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                                isZero
                                  ? "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed line-through"
                                  : isSelected
                                  ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              {v.size}{" "}
                              {v.stock_quantity > 0 && v.stock_quantity < 5 && (
                                <span className="text-[10px] opacity-75">
                                  ({v.stock_quantity})
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 pt-0 mt-auto">
                  <button
                    type="button"
                    disabled={
                      isOutOfStock ||
                      (!isMember && nonMemberSoldOut) ||
                      !currentVariant ||
                      currentVariant.stock_quantity <= 0
                    }
                    onClick={() => handleBuyNow(product)}
                    className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition shadow-sm ${
                      isOutOfStock || (!isMember && nonMemberSoldOut)
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "bg-slate-900 hover:bg-slate-800 text-white"
                    }`}
                  >
                    {!isMember && nonMemberSoldOut
                      ? "Sold out for non-members"
                      : isOutOfStock
                      ? "Sold Out"
                      : "Order & Reserve Unit"}
                    {!isOutOfStock && (!nonMemberSoldOut || isMember) && (
                      <ArrowRight className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
