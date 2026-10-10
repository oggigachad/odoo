import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Ticket, Calendar, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { api, formatCurrency } from "../../lib/api";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface TicketItem {
  ticket_id: number;
  ticket_type_id: number;
  member_id?: number | null;
  holder_name: string;
  holder_email?: string | null;
  price_paid: string;
  ticket_code: string;
  purchased_at: string;
  checked_in_at?: string | null;
  is_valid: boolean;
}

export const MyTicketsPage: React.FC = () => {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const justPurchased = searchParams.get("purchased") === "true";

  const fetchTickets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<TicketItem[]>("/me/tickets");
      setTickets(data);
    } catch {
      setError("Unable to load tickets. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {justPurchased && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium">
            Your tickets have been reserved! Present the QR codes below at the door.
          </p>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          My Event Tickets
        </h1>
        <p className="mt-2 text-base text-slate-600">
          Digital entry passes with high-contrast QR codes and offline access.
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchTickets} />}

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : tickets.length === 0 ? (
        <EmptyState
          message="You don't have any event tickets yet."
          actionText="Browse Upcoming Events"
          actionHref="/events"
          icon={<Ticket className="w-12 h-12" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tickets.map((t) => {
            const isCheckedIn = !!t.checked_in_at;
            const isUnpaid = !t.is_valid && parseFloat(t.price_paid) > 0;

            return (
              <div
                key={t.ticket_id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between"
              >
                <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
                  <div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isCheckedIn
                          ? "bg-slate-100 text-slate-700"
                          : isUnpaid
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      }`}
                    >
                      {isCheckedIn ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-slate-500" />
                          Checked In
                        </>
                      ) : isUnpaid ? (
                        <>
                          <Clock className="h-3.5 w-3.5 text-amber-600" />
                          Payment Pending
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          Valid for Entry
                        </>
                      )}
                    </span>
                    <h3 className="mt-2.5 text-lg font-bold text-slate-900">
                      Attendee: {t.holder_name}
                    </h3>
                    {t.holder_email && (
                      <p className="text-xs text-slate-500">{t.holder_email}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Rate</span>
                    <span className="text-sm font-bold text-slate-900">
                      {parseFloat(t.price_paid) === 0 ? "Free" : formatCurrency(t.price_paid)}
                    </span>
                  </div>
                </div>

                {/* QR Code Section */}
                <div className="p-8 bg-slate-50 flex flex-col items-center justify-center text-center">
                  <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200 inline-block">
                    <QRCodeSVG
                      value={t.ticket_code}
                      size={180}
                      level="H"
                      includeMargin={false}
                    />
                  </div>
                  {/* Readable Ticket Code */}
                  <div className="mt-4">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest block mb-1">
                      Ticket Code
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-800 bg-white px-3 py-1 rounded-lg border border-slate-200 select-all">
                      {t.ticket_code}
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    Booked: {new Date(t.purchased_at).toLocaleDateString()}
                  </span>
                  {isCheckedIn && (
                    <span className="text-slate-600 font-medium">
                      Admitted: {new Date(t.checked_in_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-4 text-center">
        <Link
          to="/events"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-800"
        >
          Reserve more tickets for upcoming galas <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
};
