import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, MapPin, Ticket, ArrowRight } from "lucide-react";
import { api, formatCurrency } from "../../lib/api";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface TicketType {
  ticket_type_id: number;
  name: string;
  member_price: string;
  non_member_price: string;
  seat_limit: number;
  seats_left: number;
  non_member_seats_left: number;
}

interface EventItem {
  event_id: number;
  title: string;
  description?: string;
  venue?: string;
  starts_at: string;
  ticket_types: TicketType[];
}

export const EventsListPage: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<EventItem[]>("/events");
      setEvents(data);
    } catch (err: unknown) {
      setError("Could not load events list. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const getLowestPrice = (ticketTypes: TicketType[]) => {
    if (!ticketTypes || ticketTypes.length === 0) return null;
    const prices = ticketTypes.map((t) => parseFloat(t.member_price));
    const min = Math.min(...prices);
    return min === 0 ? "Free for members" : `From ${formatCurrency(min)}`;
  };

  const getTotalSeatsLeft = (ticketTypes: TicketType[]) => {
    if (!ticketTypes || ticketTypes.length === 0) return 0;
    return ticketTypes.reduce((acc, t) => acc + (t.seats_left || 0), 0);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Upcoming Events & Galas
        </h1>
        <p className="mt-2 text-base text-slate-600">
          Reserve seats with verified member pricing and live zero-oversell seat holds.
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchEvents} />}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : events.length === 0 ? (
        <EmptyState
          message="No upcoming events scheduled right now. Check back soon!"
          icon={<Calendar className="w-12 h-12" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((evt) => {
            const seatsLeft = getTotalSeatsLeft(evt.ticket_types);
            const priceLabel = getLowestPrice(evt.ticket_types);
            const isSoldOut = seatsLeft <= 0;

            return (
              <div
                key={evt.event_id}
                className="flex flex-col justify-between bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        isSoldOut
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : seatsLeft < 10
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      <Ticket className="h-3 w-3" />
                      {isSoldOut ? "Sold Out" : `${seatsLeft} seats left`}
                    </span>
                    {priceLabel && (
                      <span className="text-xs font-semibold text-slate-900">
                        {priceLabel}
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 mb-2 leading-snug">
                    {evt.title}
                  </h3>

                  <div className="space-y-1.5 text-xs text-slate-500 mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                      <span>
                        {new Date(evt.starts_at).toLocaleDateString("en-IN", {
                          weekday: "short",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {evt.venue && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="truncate">{evt.venue}</span>
                      </div>
                    )}
                  </div>

                  {evt.description && (
                    <p className="text-sm text-slate-600 line-clamp-3 mb-4 leading-relaxed">
                      {evt.description}
                    </p>
                  )}
                </div>

                <div className="p-6 pt-0 mt-auto">
                  <Link
                    to={`/events/${evt.event_id}`}
                    className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                      isSoldOut
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed pointer-events-none"
                        : "bg-slate-900 text-white hover:bg-slate-800 shadow-sm"
                    }`}
                  >
                    {isSoldOut ? "Event Sold Out" : "Select Seats & Buy"}
                    {!isSoldOut && <ArrowRight className="h-4 w-4" />}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
