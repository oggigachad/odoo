import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Camera,
  Keyboard,
  RotateCcw,
} from "lucide-react";
import { api, APIClientError } from "../../lib/api";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface EventItem {
  event_id: number;
  title: string;
}

interface EventSummary {
  event_id: number;
  title: string;
  tickets_sold: number;
  attended: number;
  ticket_revenue: string;
}

type ScanOutcome =
  | { state: "ADMITTED"; name: string; isMember?: boolean }
  | { state: "ALREADY_USED"; message: string }
  | { state: "UNPAID"; message: string }
  | { state: "WRONG_EVENT"; message: string }
  | { state: "NOT_FOUND"; message: string }
  | null;

export const DoorCheckInPage: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [summary, setSummary] = useState<EventSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [ticketCodeInput, setTicketCodeInput] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal / Full-screen result overlay per 07_UI_SPECS.md §5.1
  const [outcome, setOutcome] = useState<ScanOutcome>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const data = await api.get<EventItem[]>("/events");
        setEvents(data);
        if (data.length > 0) {
          setSelectedEventId(data[0].event_id);
        }
      } catch {
        setError("Failed to load events for check-in terminal.");
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  const fetchSummary = async (eventId: number) => {
    try {
      const s = await api.get<EventSummary>(`/events/${eventId}/summary`);
      setSummary(s);
    } catch {
      // Summary not available
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      fetchSummary(selectedEventId);
    }
  }, [selectedEventId]);

  // Auto-dismiss outcome overlay after 2.5s per specs
  useEffect(() => {
    if (outcome) {
      const timer = setTimeout(() => {
        setOutcome(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [outcome]);

  const handleScanOrSubmit = async (code: string) => {
    if (!selectedEventId || !code.trim()) return;

    setIsChecking(true);
    setError(null);

    try {
      const res = await api.post<{
        status: string;
        holder_name: string;
        event_title: string;
      }>("/checkin", {
        ticket_code: code.trim(),
        event_id: selectedEventId,
      });

      setOutcome({
        state: "ADMITTED",
        name: res.holder_name,
        isMember: true,
      });
      setTicketCodeInput("");
      fetchSummary(selectedEventId);
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        switch (err.code) {
          case "TICKET_ALREADY_CHECKED_IN":
            setOutcome({ state: "ALREADY_USED", message: err.message });
            break;
          case "TICKET_UNPAID":
            setOutcome({ state: "UNPAID", message: "Ticket not paid" });
            break;
          case "TICKET_WRONG_EVENT":
            setOutcome({ state: "WRONG_EVENT", message: "Ticket is for another event" });
            break;
          case "TICKET_NOT_FOUND":
            setOutcome({ state: "NOT_FOUND", message: "Ticket not found" });
            break;
          default:
            setOutcome({ state: "NOT_FOUND", message: err.message });
        }
      } else {
        setOutcome({ state: "NOT_FOUND", message: "Network error verifying ticket" });
      }
      setTicketCodeInput("");
    } finally {
      setIsChecking(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleScanOrSubmit(ticketCodeInput);
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <LoadingSkeleton rows={4} />
      </div>
    );
  }

  return (
    <div className="relative min-h-[85vh] max-w-xl mx-auto px-4 py-8 flex flex-col justify-between">
      {/* Event Selector & Live Counter Header */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Active Door Terminal
            </label>
            <select
              value={selectedEventId || ""}
              onChange={(e) => setSelectedEventId(parseInt(e.target.value, 10))}
              className="w-full text-base font-bold text-slate-900 bg-transparent border-0 focus:ring-0 p-0 cursor-pointer"
            >
              {events.map((e) => (
                <option key={e.event_id} value={e.event_id}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => selectedEventId && fetchSummary(selectedEventId)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            title="Refresh counts"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {summary && (
          <div className="p-3.5 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs font-semibold shadow-md">
            <span>Checked In:</span>
            <span className="text-emerald-400 font-mono text-sm">
              {summary.attended} / {summary.tickets_sold} sold
            </span>
          </div>
        )}
      </div>

      {/* Camera Viewport / Scanner Simulation Area */}
      <div className="my-6">
        <div className="relative aspect-square max-h-80 mx-auto rounded-3xl bg-slate-950 border-4 border-slate-800 flex flex-col items-center justify-center text-white overflow-hidden shadow-2xl">
          {/* Animated scanning bar */}
          <div className="absolute inset-x-8 top-1/2 h-0.5 bg-sky-400 shadow-[0_0_12px_#38bdf8] animate-pulse" />

          {/* Scanner target frame */}
          <div className="w-48 h-48 border-2 border-dashed border-sky-400/50 rounded-2xl flex flex-col items-center justify-center p-4 text-center">
            <Camera className="h-10 w-10 text-sky-400 mb-2 animate-bounce" />
            <span className="text-xs text-slate-400">Position QR code inside frame</span>
          </div>

          <div className="absolute bottom-4 inset-x-0 text-center">
            <span className="text-[11px] font-mono text-slate-500">
              Zero-oversell double scan protection active
            </span>
          </div>
        </div>
      </div>

      {/* Manual Code Input Fallback */}
      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}

        <form onSubmit={handleFormSubmit} className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Manual Ticket UUID Entry
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Keyboard className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={ticketCodeInput}
                onChange={(e) => setTicketCodeInput(e.target.value)}
                placeholder="Paste or type 36-char ticket UUID"
                className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <button
              type="submit"
              disabled={isChecking || !ticketCodeInput.trim()}
              className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition disabled:opacity-50 whitespace-nowrap"
            >
              {isChecking ? "Checking..." : "Verify Code"}
            </button>
          </div>
        </form>
      </div>

      {/* Full-Screen Result Overlay (07_UI_SPECS.md §5.1) */}
      {outcome && (
        <div
          onClick={() => setOutcome(null)}
          role="alert"
          aria-live="assertive"
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center text-white cursor-pointer backdrop-blur-md animate-in fade-in duration-150 ${
            outcome.state === "ADMITTED"
              ? "bg-emerald-600/95"
              : outcome.state === "ALREADY_USED"
              ? "bg-amber-600/95"
              : "bg-red-600/95"
          }`}
        >
          <div className="max-w-md w-full space-y-4">
            {outcome.state === "ADMITTED" && (
              <>
                <CheckCircle2 className="mx-auto h-24 w-24 text-white stroke-[2.5]" />
                <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">
                  Admitted
                </h2>
                <p className="text-2xl font-bold">{outcome.name}</p>
                {outcome.isMember && (
                  <span className="inline-block px-3 py-1 rounded-full bg-white text-emerald-800 text-xs font-bold uppercase tracking-wider shadow">
                    Active Member
                  </span>
                )}
              </>
            )}

            {outcome.state === "ALREADY_USED" && (
              <>
                <AlertTriangle className="mx-auto h-24 w-24 text-white stroke-[2.5]" />
                <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">
                  Already Used
                </h2>
                <p className="text-xl font-bold">{outcome.message}</p>
              </>
            )}

            {outcome.state === "UNPAID" && (
              <>
                <XCircle className="mx-auto h-24 w-24 text-white stroke-[2.5]" />
                <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">
                  Ticket Not Paid
                </h2>
                <p className="text-lg opacity-90">{outcome.message}</p>
              </>
            )}

            {outcome.state === "WRONG_EVENT" && (
              <>
                <XCircle className="mx-auto h-24 w-24 text-white stroke-[2.5]" />
                <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">
                  Wrong Event
                </h2>
                <p className="text-lg opacity-90">{outcome.message}</p>
              </>
            )}

            {outcome.state === "NOT_FOUND" && (
              <>
                <HelpCircle className="mx-auto h-24 w-24 text-white stroke-[2.5]" />
                <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">
                  Not Found
                </h2>
                <p className="text-lg opacity-90">{outcome.message}</p>
              </>
            )}

            <p className="text-xs opacity-75 pt-6 font-mono">
              Tap anywhere to dismiss • Camera ready for next ticket
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
