import React, { useEffect, useState } from "react";
import { Bell, Calendar, User } from "lucide-react";
import { api } from "../../lib/api";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface AnnouncementItem {
  id: number;
  title: string;
  body: string;
  created_at: string;
  author_name: string;
}

export const AnnouncementsPage: React.FC = () => {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnnouncements = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<AnnouncementItem[]>("/announcements");
      setAnnouncements(data);
    } catch {
      setError("Unable to load announcements.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-2">
          <Bell className="h-3.5 w-3.5" />
          Official Union Broadcasts
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Announcements & Bulletin
        </h1>
        <p className="mt-1 text-base text-slate-600">
          News, general assemblies, election calls, and emergency campus updates.
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchAnnouncements} />}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : announcements.length === 0 ? (
        <EmptyState
          message="No announcements posted yet. Check back soon!"
          icon={<Bell className="w-12 h-12" />}
        />
      ) : (
        <div className="space-y-6">
          {announcements.map((item) => (
            <article
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-700">{item.author_name}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {new Date(item.created_at).toLocaleDateString("en-IN", {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>

              <h2 className="text-xl font-bold text-slate-900 leading-snug">
                {item.title}
              </h2>

              <div className="prose prose-slate max-w-none text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">
                {item.body}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
