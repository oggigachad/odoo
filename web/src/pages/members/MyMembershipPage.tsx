import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Calendar,
} from "lucide-react";
import { api, formatCurrency } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface MembershipItem {
  membership_id: number;
  semester_id: number;
  membership_type_id: number;
  dues_amount: string;
  payment_id?: number | null;
  semester_name?: string | null;
  membership_type_name?: string | null;
  valid_until?: string | null;
}

export const MyMembershipPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const justEnrolled = searchParams.get("success") === "true";

  const [memberships, setMemberships] = useState<MembershipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMemberships = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<MembershipItem[]>(`/members/${user.member_id}/memberships`);
      setMemberships(data);
    } catch {
      setError("Unable to load membership details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemberships();
  }, [user]);

  // Determine current active membership
  const latestMembership = memberships.length > 0 ? memberships[0] : null;

  const getStatusDisplay = (m: MembershipItem | null) => {
    if (!m) {
      return {
        label: "Not Enrolled",
        badgeClass: "bg-slate-100 text-slate-700",
        icon: <Clock className="h-4 w-4" />,
        desc: "You do not have an active semester membership.",
      };
    }

    if (!m.payment_id && parseFloat(m.dues_amount) > 0) {
      return {
        label: "Unpaid Dues",
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
        icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
        desc: "Membership recorded. Awaiting online payment or officer cash confirmation.",
      };
    }

    if (m.valid_until) {
      const validDate = new Date(m.valid_until);
      const now = new Date();
      if (validDate < now) {
        return {
          label: "Expired",
          badgeClass: "bg-red-50 text-red-700 border-red-200",
          icon: <AlertTriangle className="h-4 w-4 text-red-600" />,
          desc: `Expired on ${validDate.toLocaleDateString()}. Please renew for the current semester.`,
        };
      }
    }

    return {
      label: "Active Member",
      badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
      desc: "Good standing. You have full access to member rates and voting.",
    };
  };

  const statusInfo = getStatusDisplay(latestMembership);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {justEnrolled && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium">
            Membership recorded successfully! Thank you for supporting the Skyline Student Association.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            My Membership & Status
          </h1>
          <p className="mt-1 text-base text-slate-600">
            Semester affiliation, dues history, and renewal options.
          </p>
        </div>

        <Link
          to="/join"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-sm transition"
        >
          <RotateCcw className="h-4 w-4" />
          Join / Renew Next Semester
        </Link>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchMemberships} />}

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <>
          {/* Main Status Hero Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-slate-800">
                  <ShieldCheck className="h-8 w-8 text-sky-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{user?.full_name}</h2>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                </div>
              </div>

              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${statusInfo.badgeClass}`}
              >
                {statusInfo.icon}
                {statusInfo.label}
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
              {statusInfo.desc}
            </p>

            {latestMembership ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div className="p-4 bg-white rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-400 block mb-1">Affiliation</span>
                  <strong className="text-slate-900">
                    {latestMembership.semester_name || "Current Semester"}
                  </strong>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-400 block mb-1">Membership Tier</span>
                  <strong className="text-slate-900">
                    {latestMembership.membership_type_name || "General Member"}
                  </strong>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-400 block mb-1">Valid Until</span>
                  <strong className="text-slate-900">
                    {latestMembership.valid_until
                      ? new Date(latestMembership.valid_until).toLocaleDateString()
                      : "Semester Conclusion"}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-slate-500 text-sm mb-4">
                  No active semester membership found for your account.
                </p>
                <Link
                  to="/join"
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-600 hover:text-sky-800"
                >
                  Enroll now for the upcoming term &rarr;
                </Link>
              </div>
            )}
          </div>

          {/* Past Semesters History */}
          {memberships.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-slate-400" />
                Membership Enrollment History
              </h3>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
                {memberships.map((m) => (
                  <div
                    key={m.membership_id}
                    className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <p className="font-bold text-slate-900 text-sm">
                        {m.semester_name || `Semester #${m.semester_id}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        Tier: {m.membership_type_name || "Standard"} • Dues: {formatCurrency(m.dues_amount)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                          m.payment_id || parseFloat(m.dues_amount) === 0
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}
                      >
                        {m.payment_id || parseFloat(m.dues_amount) === 0 ? "Paid" : "Unpaid"}
                      </span>
                      {m.valid_until && (
                        <span className="text-xs text-slate-400">
                          Through {new Date(m.valid_until).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
