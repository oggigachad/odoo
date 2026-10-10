import React, { useEffect, useState } from "react";
import { Calendar, Plus, Ticket, AlertCircle } from "lucide-react";
import { api, formatCurrency, APIClientError } from "../../lib/api";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface TicketTypeItem {
  ticket_type_id: number;
  name: string;
  member_price: string;
  non_member_price: string;
  seat_limit: number;
  non_member_seat_limit: number;
  sold: number;
  seats_left: number;
  non_member_sold: number;
  non_member_seats_left: number;
}

interface EventItem {
  event_id: number;
  title: string;
  description?: string;
  venue?: string;
  starts_at: string;
  ticket_types: TicketTypeItem[];
}

export const EventManagerPage: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Event Form State
  const [showEventForm, setShowEventForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [venue, setVenue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add Ticket Type Modal State
  const [modalEvent, setModalEvent] = useState<EventItem | null>(null);
  const [ttName, setTtName] = useState("General Admission");
  const [ttMemberPrice, setTtMemberPrice] = useState("300.00");
  const [ttNonMemberPrice, setTtNonMemberPrice] = useState("500.00");
  const [ttSeatLimit, setTtSeatLimit] = useState("100");
  const [ttNonMemberSeatLimit, setTtNonMemberSeatLimit] = useState("25");
  const [ttSubmitting, setTtSubmitting] = useState(false);
  const [ttError, setTtError] = useState<string | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<EventItem[]>("/events");
      setEvents(data);
    } catch {
      setError("Failed to load events.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startsAt) return;

    setSubmitting(true);
    setFormError(null);

    try {
      await api.post("/events", {
        title: title.trim(),
        description: description.trim() || undefined,
        venue: venue.trim() || undefined,
        starts_at: new Date(startsAt).toISOString(),
        ticket_types: [
          {
            name: "General Admission",
            member_price: "300.00",
            non_member_price: "500.00",
            seat_limit: 100,
            non_member_seat_limit: 25,
          },
        ],
      });

      setTitle("");
      setDescription("");
      setVenue("");
      setStartsAt("");
      setShowEventForm(false);
      await fetchEvents();
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to create event.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddTicketType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalEvent) return;

    setTtSubmitting(true);
    setTtError(null);

    try {
      await api.post(`/events/${modalEvent.event_id}/ticket-types`, {
        name: ttName.trim(),
        member_price: parseFloat(ttMemberPrice).toFixed(2),
        non_member_price: parseFloat(ttNonMemberPrice).toFixed(2),
        seat_limit: parseInt(ttSeatLimit, 10),
        non_member_seat_limit: parseInt(ttNonMemberSeatLimit, 10),
      });

      setModalEvent(null);
      await fetchEvents();
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setTtError(err.message);
      } else {
        setTtError("Failed to add ticket type.");
      }
    } finally {
      setTtSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Events & Ticket Types Manager
          </h1>
          <p className="mt-1 text-base text-slate-600">
            Configure gala dates, seat limits, non-member quotas, and live gate sales.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowEventForm(!showEventForm)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-sm transition"
        >
          <Plus className="h-4 w-4" />
          {showEventForm ? "Cancel" : "Create New Event"}
        </button>
      </div>

      {showEventForm && (
        <form
          onSubmit={handleCreateEvent}
          className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 space-y-4"
        >
          <h2 className="text-lg font-bold text-slate-900">Create Event</h2>

          {formError && (
            <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Event Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Spring Gala 2026"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Venue Location
              </label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. Skyline Main Auditorium"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Event Date & Time *
              </label>
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Event Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details, schedule, dress code..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowEventForm(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Publish Event"}
            </button>
          </div>
        </form>
      )}

      {error && <ErrorBanner message={error} onRetry={fetchEvents} />}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <div className="space-y-6">
          {events.map((evt) => (
            <div
              key={evt.event_id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{evt.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(evt.starts_at).toLocaleString()} • Venue: {evt.venue || "TBA"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setModalEvent(evt)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Ticket Tier
                </button>
              </div>

              {/* Ticket Types Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Tier Name</th>
                      <th className="p-3">Member Rate</th>
                      <th className="p-3">Non-Member Rate</th>
                      <th className="p-3">Total Seats</th>
                      <th className="p-3">Sold</th>
                      <th className="p-3">Non-Member Limit</th>
                      <th className="p-3">Non-Member Left</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {evt.ticket_types.map((tt) => (
                      <tr key={tt.ticket_type_id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-slate-900">{tt.name}</td>
                        <td className="p-3 font-mono">{formatCurrency(tt.member_price)}</td>
                        <td className="p-3 font-mono">{formatCurrency(tt.non_member_price)}</td>
                        <td className="p-3">{tt.seat_limit}</td>
                        <td className="p-3 font-semibold text-emerald-700">{tt.sold}</td>
                        <td className="p-3">{tt.non_member_seat_limit || "None"}</td>
                        <td className="p-3 font-semibold">
                          {tt.non_member_seat_limit > 0 ? tt.non_member_seats_left : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Ticket Tier Modal */}
      {modalEvent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Ticket className="h-5 w-5 text-sky-600" />
              Add Ticket Type to {modalEvent.title}
            </h3>

            {ttError && (
              <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{ttError}</span>
              </div>
            )}

            <form onSubmit={handleAddTicketType} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Tier Name *
                </label>
                <input
                  type="text"
                  required
                  value={ttName}
                  onChange={(e) => setTtName(e.target.value)}
                  placeholder="e.g. VIP Balcony"
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
                    min="0"
                    required
                    value={ttMemberPrice}
                    onChange={(e) => setTtMemberPrice(e.target.value)}
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
                    min="0"
                    required
                    value={ttNonMemberPrice}
                    onChange={(e) => setTtNonMemberPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Total Seat Limit *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={ttSeatLimit}
                    onChange={(e) => setTtSeatLimit(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Non-Member Cap (D-025)
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={ttNonMemberSeatLimit}
                    onChange={(e) => setTtNonMemberSeatLimit(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                0 = members only. Non-member limit serves as a ceiling inside total seats.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalEvent(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ttSubmitting}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                >
                  {ttSubmitting ? "Adding..." : "Add Ticket Tier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
