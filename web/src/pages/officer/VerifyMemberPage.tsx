import React, { useState } from "react";
import { Search, CheckCircle2, XCircle, Shield, Calendar } from "lucide-react";
import { api, APIClientError } from "../../lib/api";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface MemberLookupResult {
  member_id: number;
  full_name: string;
  email?: string | null;
  is_active: boolean;
  valid_until?: string | null;
  semester_name?: string | null;
  membership_type?: string | null;
}

export const VerifyMemberPage: React.FC = () => {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<MemberLookupResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const res = await api.get<MemberLookupResult>(
        `/members/lookup?q=${encodeURIComponent(query.trim())}`
      );
      setResult(res);
    } catch (err: unknown) {
      setResult(null);
      if (err instanceof APIClientError && err.code === "NOT_FOUND") {
        setError("No member registered with that email or phone number.");
      } else {
        setError("Lookup failed. Please check the search term.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 mb-2">
          <Shield className="h-3.5 w-3.5" />
          Door Verification Terminal (MEM-4)
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Verify Member Status
        </h1>
        <p className="mt-1 text-base text-slate-600">
          Instant active dues verification by student email or registered phone number.
        </p>
      </div>

      {/* Single Search Box */}
      <form onSubmit={handleLookup} className="relative">
        <div className="relative">
          <Search className="absolute left-4 top-4 h-5 w-5 text-slate-400" />
          <input
            type="text"
            required
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter student email (e.g. alex@skyline.edu) or phone"
            className="w-full pl-12 pr-32 py-4 rounded-2xl border-2 border-slate-300 text-base focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 shadow-sm"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="absolute right-2.5 top-2.5 px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition shadow-sm disabled:opacity-50"
          >
            {loading ? "Checking..." : "Verify"}
          </button>
        </div>
      </form>

      {error && <ErrorBanner message={error} />}

      {/* Large Active / Not active result per 07_UI_SPECS.md §4 */}
      {searched && result && (
        <div
          className={`rounded-3xl border-2 p-8 text-center shadow-lg animate-in fade-in zoom-in-95 duration-200 ${
            result.is_active
              ? "bg-emerald-50/80 border-emerald-300 text-emerald-950"
              : "bg-red-50/80 border-red-300 text-red-950"
          }`}
        >
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-md">
            {result.is_active ? (
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            ) : (
              <XCircle className="h-12 w-12 text-red-600" />
            )}
          </div>

          <span
            className={`inline-block px-4 py-1.5 rounded-full text-sm font-black uppercase tracking-wider mb-2 ${
              result.is_active ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
            }`}
          >
            {result.is_active ? "ACTIVE MEMBER" : "NOT ACTIVE / EXPIRED"}
          </span>

          <h2 className="text-3xl font-black">{result.full_name}</h2>
          {result.email && <p className="text-sm opacity-80 mt-1">{result.email}</p>}

          <div className="mt-6 pt-6 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
            <div className="bg-white/90 p-3.5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase">
                Semester
              </span>
              <strong className="text-sm text-slate-900">
                {result.semester_name || "None Recorded"}
              </strong>
            </div>

            <div className="bg-white/90 p-3.5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase">
                Tier
              </span>
              <strong className="text-sm text-slate-900">
                {result.membership_type || "Standard"}
              </strong>
            </div>

            <div className="bg-white/90 p-3.5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Valid Until
              </span>
              <strong className="text-sm text-slate-900">
                {result.valid_until
                  ? new Date(result.valid_until).toLocaleDateString()
                  : "N/A"}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
