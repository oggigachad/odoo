import React, { useEffect, useState } from "react";
import { Search, DollarSign, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { api, formatCurrency, APIClientError } from "../../lib/api";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface MemberItem {
  member_id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  joined_on: string;
  is_active: boolean;
  valid_until?: string | null;
  semester_name?: string | null;
  membership_type?: string | null;
}

interface PaginatedMembersResponse {
  items: MemberItem[];
  total: number;
  limit: number;
  offset: number;
}

export const MembersManagerPage: React.FC = () => {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cash dues recording modal
  const [cashModalMember, setCashModalMember] = useState<MemberItem | null>(null);
  const [cashAmount, setCashAmount] = useState("500.00");
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);

  const fetchMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (activeOnly !== undefined) params.set("active", String(activeOnly));

      const data = await api.get<PaginatedMembersResponse>(`/members?${params.toString()}`);
      setMembers(data.items);
      setTotal(data.total);
    } catch {
      setError("Failed to load members directory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [activeOnly]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMembers();
  };

  const handleRecordCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashModalMember) return;

    setCashSubmitting(true);
    setCashError(null);

    try {
      await api.post("/payments/cash", {
        category: "dues",
        amount: parseFloat(cashAmount).toFixed(2),
        member_id: cashModalMember.member_id,
      });

      setCashModalMember(null);
      await fetchMembers();
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setCashError(err.message);
      } else {
        setCashError("Failed to record cash payment.");
      }
    } finally {
      setCashSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Members Directory & Dues Administration
        </h1>
        <p className="mt-1 text-base text-slate-600">
          Search student membership profiles and record offline cash dues payments.
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchMembers} />}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-96">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-20 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveOnly(undefined)}
            className={`px-3 py-2 rounded-xl border transition ${
              activeOnly === undefined
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            All Members ({total})
          </button>
          <button
            type="button"
            onClick={() => setActiveOnly(true)}
            className={`px-3 py-2 rounded-xl border transition ${
              activeOnly === true
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Active Dues Only
          </button>
          <button
            type="button"
            onClick={() => setActiveOnly(false)}
            className={`px-3 py-2 rounded-xl border transition ${
              activeOnly === false
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Expired / Inactive
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Semester</th>
                <th className="px-6 py-4">Membership Tier</th>
                <th className="px-6 py-4">Valid Until</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.member_id} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="font-bold text-slate-900">{m.full_name}</p>
                    <p className="text-xs text-slate-400">{m.email}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        m.is_active
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {m.is_active ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Active
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 text-slate-400" /> Inactive
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-800">
                    {m.semester_name || "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-800">
                    {m.membership_type || "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                    {m.valid_until
                      ? new Date(m.valid_until).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      type="button"
                      onClick={() => setCashModalMember(m)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold border border-emerald-200 transition"
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                      Record Cash Dues
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Cash Dues Modal */}
      {cashModalMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Record Cash Dues Payment
            </h3>

            <p className="text-xs text-slate-600">
              Record offline cash received at the union desk for{" "}
              <strong>{cashModalMember.full_name}</strong> ({cashModalMember.email}).
            </p>

            {cashError && (
              <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{cashError}</span>
              </div>
            )}

            <form onSubmit={handleRecordCash} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Cash Amount Received (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCashModalMember(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cashSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {cashSubmitting ? "Recording..." : `Confirm Payment of ${formatCurrency(cashAmount)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
