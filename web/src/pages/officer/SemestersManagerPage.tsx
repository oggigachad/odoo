import React, { useEffect, useState } from "react";
import { Calendar, Plus, ShieldCheck, AlertCircle } from "lucide-react";
import { api, formatCurrency, APIClientError } from "../../lib/api";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface Semester {
  semester_id: number;
  name: string;
  starts_on: string;
  ends_on: string;
}

interface MembershipType {
  membership_type_id: number;
  name: string;
  dues_amount: string;
  is_offered: boolean;
}

export const SemestersManagerPage: React.FC = () => {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [types, setTypes] = useState<MembershipType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Semester form state
  const [showSemesterForm, setShowSemesterForm] = useState(false);
  const [semesterName, setSemesterName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [semSubmitting, setSemSubmitting] = useState(false);
  const [semInlineError, setSemInlineError] = useState<string | null>(null);

  // New Membership Type form state
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [duesAmount, setDuesAmount] = useState("500.00");
  const [typeSubmitting, setTypeSubmitting] = useState(false);
  const [typeInlineError, setTypeInlineError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [semRes, typesRes] = await Promise.all([
        api.get<Semester[]>("/semesters"),
        api.get<MembershipType[]>("/membership-types?all_types=true"),
      ]);
      setSemesters(semRes);
      setTypes(typesRes);
    } catch {
      setError("Failed to load semesters and membership tiers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!semesterName.trim() || !startsOn || !endsOn) return;

    setSemSubmitting(true);
    setSemInlineError(null);

    try {
      await api.post("/semesters", {
        name: semesterName.trim(),
        starts_on: startsOn,
        ends_on: endsOn,
      });

      setSemesterName("");
      setStartsOn("");
      setEndsOn("");
      setShowSemesterForm(false);
      await fetchData();
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        if (err.code === "SEMESTER_OVERLAP") {
          setSemInlineError("These dates overlap another semester. Academic periods cannot intersect.");
        } else {
          setSemInlineError(err.message);
        }
      } else {
        setSemInlineError("Failed to create semester.");
      }
    } finally {
      setSemSubmitting(false);
    }
  };

  const handleCreateType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeName.trim() || !duesAmount) return;

    setTypeSubmitting(true);
    setTypeInlineError(null);

    try {
      await api.post("/membership-types", {
        name: typeName.trim(),
        dues_amount: parseFloat(duesAmount).toFixed(2),
        is_offered: true,
      });

      setTypeName("");
      setDuesAmount("500.00");
      setShowTypeForm(false);
      await fetchData();
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setTypeInlineError(err.message);
      } else {
        setTypeInlineError("Failed to create membership tier.");
      }
    } finally {
      setTypeSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Semesters & Membership Tiers
        </h1>
        <p className="mt-1 text-base text-slate-600">
          Manage academic terms, exclusion-validated date ranges, and per-semester dues fees.
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchData} />}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Semesters Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-sky-600" />
                Academic Semesters
              </h2>
              <button
                type="button"
                onClick={() => setShowSemesterForm(!showSemesterForm)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                {showSemesterForm ? "Cancel" : "Add Semester"}
              </button>
            </div>

            {showSemesterForm && (
              <form
                onSubmit={handleCreateSemester}
                className="p-5 bg-white rounded-2xl border border-slate-200 shadow-md space-y-4"
              >
                <h3 className="text-sm font-bold text-slate-900">New Semester Term</h3>

                {semInlineError && (
                  <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                    <span>{semInlineError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Semester Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={semesterName}
                    onChange={(e) => setSemesterName(e.target.value)}
                    placeholder="e.g. Fall 2026"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Start Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={startsOn}
                      onChange={(e) => setStartsOn(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      End Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={endsOn}
                      onChange={(e) => setEndsOn(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  Note: PostgreSQL GiST exclusion constraint prohibits overlapping date ranges.
                </p>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSemesterForm(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={semSubmitting}
                    className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                  >
                    {semSubmitting ? "Saving..." : "Create Semester"}
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
              {semesters.map((s) => (
                <div key={s.semester_id} className="p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{s.name}</h4>
                    <p className="text-xs text-slate-500">
                      {new Date(s.starts_on).toLocaleDateString()} – {new Date(s.ends_on).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    ID #{s.semester_id}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Membership Types Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Membership Tiers & Dues
              </h2>
              <button
                type="button"
                onClick={() => setShowTypeForm(!showTypeForm)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                {showTypeForm ? "Cancel" : "Add Tier"}
              </button>
            </div>

            {showTypeForm && (
              <form
                onSubmit={handleCreateType}
                className="p-5 bg-white rounded-2xl border border-slate-200 shadow-md space-y-4"
              >
                <h3 className="text-sm font-bold text-slate-900">New Membership Tier</h3>

                {typeInlineError && (
                  <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                    <span>{typeInlineError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Tier Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={typeName}
                    onChange={(e) => setTypeName(e.target.value)}
                    placeholder="e.g. Standard Member, Alumni, Associate"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Dues Contribution (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={duesAmount}
                    onChange={(e) => setDuesAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Set 0 for honorary or zero-dues memberships.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTypeForm(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={typeSubmitting}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {typeSubmitting ? "Saving..." : "Create Tier"}
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
              {types.map((t) => (
                <div key={t.membership_type_id} className="p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{t.name}</h4>
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 ${
                        t.is_offered
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {t.is_offered ? "Offered" : "Archived"}
                    </span>
                  </div>
                  <span className="font-black text-slate-900 text-base">
                    {parseFloat(t.dues_amount) === 0 ? "Free" : formatCurrency(t.dues_amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
