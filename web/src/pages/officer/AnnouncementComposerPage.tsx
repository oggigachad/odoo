import React, { useState, useEffect } from "react";
import { Bell, Send, CheckCircle2 } from "lucide-react";
import { api, APIClientError } from "../../lib/api";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface MemberCountResponse {
  total: number;
}

export const AnnouncementComposerPage: React.FC = () => {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [recipientCount, setRecipientCount] = useState<number>(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMemberCount = async () => {
      try {
        const res = await api.get<MemberCountResponse>("/members?limit=1");
        setRecipientCount(res.total);
      } catch {
        setRecipientCount(0);
      }
    };
    fetchMemberCount();
  }, []);

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setError(null);
    setShowConfirmModal(true);
  };

  const handlePostAnnouncement = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await api.post("/announcements", {
        title: title.trim(),
        body: body.trim(),
      });

      setSuccess(true);
      setTitle("");
      setBody("");
      setShowConfirmModal(false);
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setError(err.message);
      } else {
        setError("Failed to publish announcement.");
      }
      setShowConfirmModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-2">
          <Bell className="h-3.5 w-3.5" />
          Union Communications Desk
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Announcement Composer
        </h1>
        <p className="mt-1 text-base text-slate-600">
          Publish bulletins to the website feed and enqueue broadcast emails to all members.
        </p>
      </div>

      {success && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium">
            Announcement posted successfully! Background worker enqueued emails to {recipientCount} active members.
          </p>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleOpenConfirm} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Announcement Subject / Title *
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Annual General Assembly & Election Schedule"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500 font-semibold"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Broadcast Content / Body *
          </label>
          <textarea
            required
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write complete notice with dates, venue, agenda..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Send className="h-4 w-4 text-slate-400" />
            <span>Target Audience: <strong>{recipientCount} Members</strong></span>
          </div>
          <button
            type="submit"
            disabled={!title.trim() || !body.trim()}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
          >
            Review & Broadcast
          </button>
        </div>
      </form>

      {/* Confirmation Modal with Recipient Count (per 07_UI_SPECS.md §4) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-2">
              <Bell className="h-6 w-6" />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">
                Post & Email All Members?
              </h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                This notice will be published to the public announcement bulletin and will trigger notification emails queued to approximately{" "}
                <strong className="text-slate-900">{recipientCount} students</strong>.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-left text-xs space-y-1">
              <span className="text-slate-400 font-semibold uppercase">Subject:</span>
              <p className="font-bold text-slate-900 truncate">{title}</p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
              >
                Go Back & Edit
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handlePostAnnouncement}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
              >
                {submitting ? "Broadcasting..." : "Confirm & Send to All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
