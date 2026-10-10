import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, Lock, Calendar, AlertCircle } from "lucide-react";
import { api, formatCurrency, APIClientError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
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

export const JoinRenewPage: React.FC = () => {
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [types, setTypes] = useState<MembershipType[]>([]);
  const [selectedSemesterId, setSelectedSemesterId] = useState<number | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [semRes, typesRes] = await Promise.all([
          api.get<Semester[]>("/semesters"),
          api.get<MembershipType[]>("/membership-types"),
        ]);
        setSemesters(semRes);
        setTypes(typesRes);

        if (semRes.length > 0) {
          setSelectedSemesterId(semRes[0].semester_id);
        }
        if (typesRes.length > 0) {
          setSelectedTypeId(typesRes[0].membership_type_id);
        }
      } catch {
        setError("Failed to load semesters or membership tiers.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const selectedSemester = semesters.find((s) => s.semester_id === selectedSemesterId);
  const selectedType = types.find((t) => t.membership_type_id === selectedTypeId);

  const handleJoinOrRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSemesterId || !selectedTypeId) return;

    if (!isLoggedIn) {
      navigate(`/login?redirect=${encodeURIComponent("/join")}`);
      return;
    }

    setSubmitting(true);
    setError(null);
    setErrorCode(undefined);

    try {
      await api.post("/memberships", {
        member_id: user?.member_id,
        semester_id: selectedSemesterId,
        membership_type_id: selectedTypeId,
      });

      // Navigate to membership overview
      navigate("/me/membership?success=true");
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setErrorCode(err.code);
        if (err.code === "MEMBERSHIP_EXISTS") {
          setError("You already have a membership recorded for this semester.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Could not process membership enrollment.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <LoadingSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 mb-2">
          <ShieldCheck className="h-3.5 w-3.5" />
          Official Association Membership
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Join or Renew Membership
        </h1>
        <p className="mt-1 text-base text-slate-600">
          Unlock discounted gala tickets, exclusive club merch allocations, and voting privileges.
        </p>
      </div>

      {!isLoggedIn && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>Please sign in or register an account before purchasing membership.</span>
          </div>
          <Link
            to="/login?redirect=/join"
            className="font-bold underline text-amber-950 hover:text-amber-800 whitespace-nowrap ml-2"
          >
            Sign In &rarr;
          </Link>
        </div>
      )}

      {error && <ErrorBanner message={error} code={errorCode} />}

      <form onSubmit={handleJoinOrRenew} className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 space-y-8">
        {/* Step 1: Semester Selection */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-sky-600" />
            1. Select Academic Semester
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {semesters.map((s) => {
              const isSelected = selectedSemesterId === s.semester_id;
              const isFuture = new Date(s.starts_on) > new Date();

              return (
                <button
                  type="button"
                  key={s.semester_id}
                  onClick={() => setSelectedSemesterId(s.semester_id)}
                  className={`p-4 rounded-xl border text-left transition ${
                    isSelected
                      ? "border-sky-500 bg-sky-50/50 ring-2 ring-sky-500/20"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-900 text-sm">{s.name}</span>
                    {isFuture && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                        Starts {new Date(s.starts_on).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Term: {new Date(s.starts_on).toLocaleDateString()} – {new Date(s.ends_on).toLocaleDateString()}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Membership Tier Selection */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            2. Choose Membership Tier
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {types.map((t) => {
              const isSelected = selectedTypeId === t.membership_type_id;

              return (
                <button
                  type="button"
                  key={t.membership_type_id}
                  onClick={() => setSelectedTypeId(t.membership_type_id)}
                  className={`p-4 rounded-xl border text-left transition ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-900 text-sm">{t.name}</span>
                    <span className="font-black text-slate-900 text-base">
                      {parseFloat(t.dues_amount) === 0 ? "Free" : formatCurrency(t.dues_amount)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">Per semester dues contribution</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Price & Confirmation */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs text-slate-500 block">
              Dues for {selectedSemester?.name || "Semester"}
            </span>
            <span className="text-2xl font-black text-slate-900">
              {selectedType ? formatCurrency(selectedType.dues_amount) : "₹0"}
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting || !selectedSemesterId || !selectedTypeId}
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            {submitting
              ? "Enrolling Membership..."
              : `Confirm & Pay ${selectedType ? formatCurrency(selectedType.dues_amount) : ""}`}
          </button>
        </div>
      </form>
    </div>
  );
};
