import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ShieldCheck,
  Clock,
  Filter,
} from "lucide-react";
import { api, formatCurrency } from "../../lib/api";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface ClubBalance {
  total_in: string;
  total_out: string;
  balance: string;
}

interface SummaryItem {
  category: string;
  amount: string;
}

interface ExpenseItem {
  expense_id: number;
  member_id: number;
  volunteer_name?: string;
  description: string;
  amount: string;
  status: string;
  incurred_on: string;
}

export const TreasurerDashboardPage: React.FC = () => {
  const [balance, setBalance] = useState<ClubBalance | null>(null);
  const [summary, setSummary] = useState<SummaryItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, sumRes, expRes] = await Promise.all([
        api.get<ClubBalance>("/treasurer/balance"),
        api.get<SummaryItem[]>("/treasurer/summary"),
        api.get<ExpenseItem[]>("/expenses"),
      ]);
      setBalance(balRes);
      setSummary(sumRes);
      setExpenses(expRes);
    } catch {
      setError("Failed to load treasurer financial reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const pendingExpenses = expenses.filter((e) => e.status === "submitted");

  const getCategoryAmount = (cat: string) => {
    const item = summary.find((s) => s.category.toLowerCase() === cat.toLowerCase());
    return item ? formatCurrency(item.amount) : "₹0";
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 mb-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            Audited Treasury & General Ledger
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Treasurer Financial Dashboard
          </h1>
          <p className="mt-1 text-base text-slate-600">
            Cash reconciliation, dues ledger, event revenue, and volunteer reimbursement claims.
          </p>
        </div>

        <Link
          to="/treasurer/expenses"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-sm transition"
        >
          Review Claims Queue ({pendingExpenses.length})
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchData} />}

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <>
          {/* Main Balance Hero Card per 07_UI_SPECS.md §5.2 wireframe */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-slate-900 text-white rounded-3xl shadow-xl flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Net Club Balance
                </span>
                <span className="text-4xl font-black tracking-tight text-white block">
                  {balance ? formatCurrency(balance.balance) : "₹0"}
                </span>
              </div>
              <div className="pt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>System of Record</span>
                <span className="text-emerald-400 font-bold">PostgreSQL 16 Balanced</span>
              </div>
            </div>

            <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Total Inflow
                  </span>
                  <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>
                <span className="text-3xl font-black text-emerald-600 block">
                  {balance ? formatCurrency(balance.total_in) : "₹0"}
                </span>
              </div>
              <p className="text-xs text-slate-500 pt-4 border-t border-slate-100">
                Sum of membership dues, tickets, merchandise, and donations.
              </p>
            </div>

            <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Total Outflow
                  </span>
                  <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
                    <TrendingDown className="h-4 w-4" />
                  </div>
                </div>
                <span className="text-3xl font-black text-slate-900 block">
                  {balance ? formatCurrency(balance.total_out) : "₹0"}
                </span>
              </div>
              <p className="text-xs text-slate-500 pt-4 border-t border-slate-100">
                Reimbursed volunteer event expenses with attached receipts.
              </p>
            </div>
          </div>

          {/* Money In by Category Breakdown & Action Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
                Revenue Streams Breakdown
              </h2>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Membership Dues</h3>
                    <p className="text-xs text-slate-500">Per-semester student contributions</p>
                  </div>
                  <span className="font-mono font-bold text-base text-slate-900">
                    {getCategoryAmount("dues")}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Gala & Event Tickets</h3>
                    <p className="text-xs text-slate-500">Member and guest admissions</p>
                  </div>
                  <span className="font-mono font-bold text-base text-slate-900">
                    {getCategoryAmount("ticket")}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Merchandise Store</h3>
                    <p className="text-xs text-slate-500">Hoodies, apparel, and student gear</p>
                  </div>
                  <span className="font-mono font-bold text-base text-slate-900">
                    {getCategoryAmount("merchandise")}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Fundraisers & Donations</h3>
                    <p className="text-xs text-slate-500">Community campaigns and contributions</p>
                  </div>
                  <span className="font-mono font-bold text-base text-slate-900">
                    {getCategoryAmount("fundraiser")}
                  </span>
                </div>
              </div>
            </div>

            {/* Waiting for review sidebar */}
            <div className="space-y-6">
              <div className="bg-amber-50/60 rounded-2xl border border-amber-200 p-6 space-y-4">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-base">
                  <Clock className="h-5 w-5 text-amber-700" />
                  Claims Waiting Review
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  There are currently <strong>{pendingExpenses.length} expense claims</strong> submitted by volunteers awaiting review and reimbursement decision.
                </p>
                <Link
                  to="/treasurer/expenses"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-sm transition"
                >
                  Review Expenses Queue
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
                <h3 className="font-bold text-slate-900 text-sm">Audit Controls (D-017)</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Dual-authorization rule: Nobody approves their own reimbursement claim. The treasurer cannot approve self-submitted expenses.
                </p>
              </div>
            </div>
          </div>

          {/* Ledger Table with Category Filters */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Filter className="h-5 w-5 text-slate-400" />
                Recent Financial Ledger
              </h2>

              <div className="flex items-center gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setCategoryFilter("all")}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    categoryFilter === "all"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  All Items
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter("submitted")}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    categoryFilter === "submitted"
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Submitted ({expenses.filter((e) => e.status === "submitted").length})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter("reimbursed")}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    categoryFilter === "reimbursed"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Reimbursed
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Expense ID</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">Claimant</th>
                    <th className="px-6 py-4">Incurred On</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {expenses
                    .filter((e) => categoryFilter === "all" || e.status === categoryFilter)
                    .map((exp) => (
                      <tr key={exp.expense_id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4 font-mono font-bold text-slate-900">
                          #{exp.expense_id}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {exp.description}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {exp.volunteer_name || `Member #${exp.member_id}`}
                        </td>
                        <td className="px-6 py-4 text-slate-400">
                          {new Date(exp.incurred_on).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                              exp.status === "reimbursed"
                                ? "bg-emerald-50 text-emerald-800"
                                : exp.status === "approved"
                                ? "bg-sky-50 text-sky-800"
                                : exp.status === "rejected"
                                ? "bg-red-50 text-red-800"
                                : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            {exp.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(exp.amount)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
