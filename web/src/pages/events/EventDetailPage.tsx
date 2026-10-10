import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Ticket,
  Clock,
  ShieldCheck,
  Plus,
  Trash2,
  Lock,
  ArrowLeft,
} from "lucide-react";
import { api, formatCurrency, APIClientError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface TicketType {
  ticket_type_id: number;
  event_id: number;
  name: string;
  member_price: string;
  non_member_price: string;
  seat_limit: number;
  non_member_seat_limit: number;
  seats_left: number;
  non_member_seats_left: number;
}

interface EventDetail {
  event_id: number;
  title: string;
  description?: string;
  venue?: string;
  starts_at: string;
  ticket_types: TicketType[];
}

interface HolderInput {
  holder_name: string;
  holder_email: string;
}

interface PurchaseResponse {
  tickets: Array<{
    ticket_id: number;
    ticket_code: string;
    holder_name: string;
    price_paid: string;
  }>;
  total_amount: string;
  requires_payment: boolean;
  order_id?: string;
}

export const EventDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);

  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [holders, setHolders] = useState<HolderInput[]>([
    {
      holder_name: user?.full_name || "",
      holder_email: user?.email || "",
    },
  ]);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const fetchEvent = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<EventDetail>(`/events/${id}`);
      setEvent(data);
      if (data.ticket_types && data.ticket_types.length > 0) {
        setSelectedTypeId(data.ticket_types[0].ticket_type_id);
      }
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setError(err.message);
        setErrorCode(err.code);
      } else {
        setError("Failed to load event details.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvent();
  }, [id]);

  const selectedType = event?.ticket_types.find((t) => t.ticket_type_id === selectedTypeId);

  const addHolder = () => {
    if (holders.length >= 10) return;
    setHolders([...holders, { holder_name: "", holder_email: "" }]);
  };

  const removeHolder = (index: number) => {
    if (holders.length <= 1) return;
    setHolders(holders.filter((_, idx) => idx !== index));
  };

  const updateHolder = (index: number, field: keyof HolderInput, val: string) => {
    const copy = [...holders];
    copy[index] = { ...copy[index], [field]: val };
    setHolders(copy);
  };

  // Price calculation per holder per D-022
  const computeEstimatedTotal = () => {
    if (!selectedType) return "0.00";
    let sum = 0;
    for (const h of holders) {
      // If holder email matches signed in active member, treat as member rate
      const isCurrentMember =
        user?.is_active &&
        user.email.toLowerCase() === (h.holder_email || "").toLowerCase().trim();
      const unit = isCurrentMember
        ? parseFloat(selectedType.member_price)
        : parseFloat(selectedType.non_member_price);
      sum += unit;
    }
    return sum.toFixed(2);
  };

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTypeId || !event) return;

    // Validate inputs
    for (let i = 0; i < holders.length; i++) {
      if (!holders[i].holder_name.trim()) {
        setError(`Please enter the name for Ticket ${i + 1}`);
        return;
      }
    }

    setIsPurchasing(true);
    setError(null);
    setErrorCode(undefined);

    try {
      const payload = {
        ticket_type_id: selectedTypeId,
        holders: holders.map((h) => ({
          holder_name: h.holder_name.trim(),
          holder_email: h.holder_email.trim() || undefined,
        })),
      };

      const result = await api.post<PurchaseResponse>("/tickets/purchase", payload);

      if (result.requires_payment) {
        navigate(
          `/payment/status?type=ticket&order_id=${result.order_id || ""}&amount=${result.total_amount}&count=${result.tickets.length}`
        );
      } else {
        // Free tickets or paid instantly
        navigate("/me/tickets?purchased=true");
      }
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setErrorCode(err.code);
        if (err.code === "SOLD_OUT") {
          setError("Sorry, this event is sold out.");
        } else if (err.code === "SOLD_OUT_NON_MEMBER") {
          setError("Sorry, seats reserved for non-members are sold out. Active members can still reserve.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to reserve tickets. Please check connection and try again.");
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <ErrorBanner message={error || "Event not found"} />
        <div className="mt-4">
          <Link to="/events" className="text-sky-600 font-semibold text-sm flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Back to events
          </Link>
        </div>
      </div>
    );
  }

  const isSoldOutTotal = (selectedType?.seats_left ?? 0) <= 0;
  const isSoldOutNonMember = (selectedType?.non_member_seats_left ?? 0) <= 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <Link
          to="/events"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-4 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to all events
        </Link>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            Event Registration
          </span>
          {selectedType && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                isSoldOutTotal
                  ? "bg-red-50 text-red-700 border-red-200"
                  : selectedType.seats_left < 10
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
            >
              {selectedType.seats_left} total seats left
            </span>
          )}
          {selectedType && selectedType.non_member_seat_limit > 0 && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                isSoldOutNonMember
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-slate-100 text-slate-700 border-slate-200"
              }`}
            >
              {isSoldOutNonMember
                ? "Sold out for non-members"
                : `${selectedType.non_member_seats_left} seats left for non-members`}
            </span>
          )}
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
          {event.title}
        </h1>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span>
              {new Date(event.starts_at).toLocaleDateString("en-IN", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          {event.venue && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-slate-400" />
              <span>{event.venue}</span>
            </div>
          )}
        </div>
      </div>

      {event.description && (
        <div className="p-6 bg-white rounded-2xl border border-slate-200 text-slate-700 text-sm leading-relaxed">
          {event.description}
        </div>
      )}

      {error && <ErrorBanner message={error} code={errorCode} onRetry={fetchEvent} />}

      {/* Ticket Purchase Terminal */}
      <form onSubmit={handlePurchase} className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Ticket className="h-5 w-5 text-sky-600" />
          Select Ticket Type & Attendees
        </h2>

        {/* Ticket Type Picker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {event.ticket_types.map((type) => {
            const isSelected = selectedTypeId === type.ticket_type_id;
            return (
              <button
                type="button"
                key={type.ticket_type_id}
                onClick={() => setSelectedTypeId(type.ticket_type_id)}
                className={`p-4 rounded-xl border text-left transition ${
                  isSelected
                    ? "border-sky-500 bg-sky-50/50 ring-2 ring-sky-500/20"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-900">{type.name}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {type.seats_left} left
                  </span>
                </div>
                <div className="text-xs space-y-0.5 text-slate-500 mt-2">
                  <p>
                    Member price:{" "}
                    <strong className="text-slate-900">
                      {parseFloat(type.member_price) === 0 ? "Free" : formatCurrency(type.member_price)}
                    </strong>
                  </p>
                  <p>
                    Non-member price:{" "}
                    <strong className="text-slate-900">
                      {formatCurrency(type.non_member_price)}
                    </strong>
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Attendee Holder Fields */}
        <div className="space-y-4 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Ticket Holders ({holders.length})
            </h3>
            {holders.length < 10 && (
              <button
                type="button"
                onClick={addHolder}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-800"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Another Ticket
              </button>
            )}
          </div>

          <div className="space-y-3">
            {holders.map((holder, idx) => {
              const isMatchCurrentMember =
                user?.is_active &&
                user.email.toLowerCase() === (holder.holder_email || "").toLowerCase().trim();

              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Ticket {idx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      {isMatchCurrentMember && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <ShieldCheck className="h-3 w-3" />
                          Member Rate Applied
                        </span>
                      )}
                      {holders.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeHolder(idx)}
                          className="text-xs text-red-500 hover:text-red-700 p-1"
                          title="Remove ticket"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Holder Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={holder.holder_name}
                        onChange={(e) => updateHolder(idx, "holder_name", e.target.value)}
                        placeholder="e.g. Jordan Smith"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Holder Email (for ticket & member rate)
                      </label>
                      <input
                        type="email"
                        value={holder.holder_email}
                        onChange={(e) => updateHolder(idx, "holder_email", e.target.value)}
                        placeholder="student@skyline.edu"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 15-Minute Hold Notice & Total */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-slate-600">
            <Clock className="h-4 w-4 text-slate-400 shrink-0" />
            <span>
              Seats are temporarily locked for <strong>15 minutes</strong> upon checkout. If unpaid, they return to the pool.
            </span>
          </div>
          <div className="text-right whitespace-nowrap">
            <span className="text-xs text-slate-500 block">Estimated Total</span>
            <span className="text-2xl font-black text-slate-900">
              {formatCurrency(computeEstimatedTotal())}
            </span>
          </div>
        </div>

        {/* Purchase Action Button */}
        <button
          type="submit"
          disabled={isPurchasing || isSoldOutTotal}
          className={`w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm transition shadow-md ${
            isSoldOutTotal
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-slate-900 hover:bg-slate-800 text-white"
          }`}
        >
          <Lock className="h-4 w-4" />
          {isPurchasing
            ? "Holding seats and preparing checkout..."
            : isSoldOutTotal
            ? "Sold Out"
            : `Reserve & Pay ${formatCurrency(computeEstimatedTotal())}`}
        </button>
      </form>
    </div>
  );
};
