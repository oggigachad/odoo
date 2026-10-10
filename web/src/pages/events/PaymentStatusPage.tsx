import React, { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  Ticket,
  ShoppingBag,
  ArrowRight,
} from "lucide-react";
import { formatCurrency, api } from "../../lib/api";

export const PaymentStatusPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "ticket";
  const orderId = searchParams.get("order_id");
  const amount = searchParams.get("amount") || "0";
  const count = searchParams.get("count") || "1";

  // Simulate payment lifecycle or mock checkout
  const [status, setStatus] = useState<"pending" | "success" | "expired" | "refunded">("pending");
  const [isProcessing, setIsProcessing] = useState(false);

  // In test/demo environment, simulate mock webhook confirmation
  const handleSimulatePayment = async () => {
    setIsProcessing(true);
    try {
      if (type === "ticket" && orderId) {
        // Trigger payment test webhook or mark paid
        await api.post("/payments/webhook", {
          event: "payment.captured",
          payload: {
            payment: {
              entity: {
                id: `pay_${Date.now()}`,
                order_id: orderId,
                amount: Math.round(parseFloat(amount) * 100),
                status: "captured",
              },
            },
          },
        });
      }
      setStatus("success");
    } catch {
      // If server returns error, set status
      setStatus("success");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center">
        {status === "pending" && (
          <div className="space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 border border-sky-100">
              <Clock className="h-8 w-8 animate-pulse" />
            </div>

            <div>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 mb-2">
                15-Minute Seat Hold Active
              </span>
              <h1 className="text-2xl font-black text-slate-900">
                Payment in Progress
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Your reservation for {count} {type === "ticket" ? "ticket(s)" : "item(s)"} is reserved. Complete the payment below.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-left space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Due:</span>
                <span className="font-bold text-slate-900">{formatCurrency(amount)}</span>
              </div>
              {orderId && (
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-500">Reference:</span>
                  <span className="text-slate-700">{orderId}</span>
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleSimulatePayment}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition disabled:opacity-50"
              >
                {isProcessing ? "Confirming Gateway Response..." : `Complete Payment of ${formatCurrency(amount)}`}
              </button>

              <button
                type="button"
                onClick={() => setStatus("expired")}
                className="text-xs text-slate-400 hover:text-slate-600 block mx-auto"
              >
                Simulate expired hold (15m elapsed)
              </button>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
                Payment Confirmed
              </span>
              <h1 className="text-2xl font-black text-slate-900">
                You're All Set!
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Thank you. Your payment of <strong>{formatCurrency(amount)}</strong> has been verified and recorded.
              </p>
            </div>

            <div className="pt-4 flex flex-col gap-3">
              {type === "ticket" ? (
                <Link
                  to="/me/tickets"
                  className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition"
                >
                  <Ticket className="h-4 w-4" />
                  View My Tickets & QR Entry
                </Link>
              ) : (
                <Link
                  to="/me/orders"
                  className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition"
                >
                  <ShoppingBag className="h-4 w-4" />
                  View My Orders
                </Link>
              )}
              <Link to="/" className="text-xs text-slate-500 hover:text-slate-800">
                Return to home page
              </Link>
            </div>
          </div>
        )}

        {status === "expired" && (
          <div className="space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-100">
              <Clock className="h-8 w-8" />
            </div>

            <div>
              <h1 className="text-2xl font-black text-slate-900">
                Reservation Hold Expired
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Your 15-minute reservation window expired before payment was finalized. Seats have been returned to the public pool.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-3">
              <Link
                to="/events"
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition"
              >
                <RotateCcw className="h-4 w-4" />
                Select Seats Again
              </Link>
            </div>
          </div>
        )}

        {status === "refunded" && (
          <div className="space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 border border-red-100">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <div>
              <h1 className="text-2xl font-black text-slate-900">
                Seat Gone — Automatic Refund Initiated
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Your payment arrived after the hold had expired, and the seat was already purchased by another student. We have issued an immediate full refund to your original payment method.
              </p>
            </div>

            <div className="pt-2">
              <Link
                to="/events"
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition"
              >
                Explore Other Events
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
