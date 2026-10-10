import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  Receipt,
  ExternalLink,
  DollarSign,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { api, formatCurrency, APIClientError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface ExpenseItem {
  expense_id: number;
  member_id: number;
  volunteer_name?: string;
  description: string;
  amount: string;
  receipt_url?: string;
  incurred_on: string;
  submitted_at: string;
  status: string;
  reimbursed_at?: string;
}

export const ExpenseQueuePage: React.FC = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [activeTab, setActiveTab] = useState<"submitted" | "approved" | "reimbursed" | "rejected">("submitted");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const fetchExpenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ExpenseItem[]>("/expenses");
      setExpenses(data);
    } catch {
      setError("Failed to load expense reimbursement queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleUpdateStatus = async (
    expense: ExpenseItem,
    newStatus: "approved" | "rejected" | "reimbursed"
  ) => {
    // Check D-017 client-side rule
    if (expense.member_id === user?.member_id) {
      setActionError("Dual-control security rule (D-017): Nobody may approve their own expense. Another officer must review this claim.");
      return;
    }

    setProcessingId(expense.expense_id);
    setActionError(null);

    try {
      await api.patch(`/expenses/${expense.expense_id}?status=${newStatus}`);
      await fetchExpenses();
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        if (err.code === "SELF_APPROVAL_NOT_ALLOWED") {
          setActionError("Another officer needs to review your own expense (D-017).");
        } else {
          setActionError(err.message);
        }
      } else {
        setActionError("Failed to update expense status.");
      }
    } finally {
      setProcessingId(null);
    }
  };

  const filteredExpenses = expenses.filter((e) => e.status.toLowerCase() === activeTab);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <Link
          to="/treasurer/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-4 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Treasurer Dashboard
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Reimbursement Review Queue
        </h1>
        <p className="mt-1 text-base text-slate-600">
          Audit volunteer expenses, inspect purchase receipts, and authorize payments.
        </p>
      </div>

      {actionError && (
        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <h4 className="font-bold">Dual-Authorization Notice</h4>
            <p className="mt-0.5">{actionError}</p>
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={fetchExpenses} />}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6 text-sm font-semibold">
          {(["submitted", "approved", "reimbursed", "rejected"] as const).map((tab) => {
            const count = expenses.filter((e) => e.status.toLowerCase() === tab).length;
            const isCurrent = activeTab === tab;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition capitalize flex items-center gap-2 ${
                  isCurrent
                    ? "border-slate-900 text-slate-900 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                {tab}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    isCurrent
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : filteredExpenses.length === 0 ? (
        <EmptyState
          message={`No expense claims currently in ${activeTab} status.`}
          icon={<Receipt className="w-12 h-12" />}
        />
      ) : (
        <div className="space-y-4">
          {filteredExpenses.map((exp) => {
            const isSelf = exp.member_id === user?.member_id;

            return (
              <div
                key={exp.expense_id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-slate-400">
                      #{exp.expense_id}
                    </span>
                    {isSelf && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        Self-Submitted Claim
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg">{exp.description}</h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
                    <span>
                      Claimant:{" "}
                      <strong className="text-slate-800">
                        {exp.volunteer_name || `Member #${exp.member_id}`}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>Incurred: {new Date(exp.incurred_on).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>Submitted: {new Date(exp.submitted_at).toLocaleDateString()}</span>
                    {exp.receipt_url && (
                      <>
                        <span>•</span>
                        <a
                          href={exp.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sky-600 hover:underline font-semibold"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Receipt Link
                        </a>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:items-end gap-3 shrink-0">
                  <span className="text-2xl font-black text-slate-900">
                    {formatCurrency(exp.amount)}
                  </span>

                  {/* Action Buttons depending on tab */}
                  <div className="flex items-center gap-2">
                    {exp.status === "submitted" && (
                      <>
                        <button
                          type="button"
                          disabled={processingId === exp.expense_id}
                          onClick={() => handleUpdateStatus(exp, "approved")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={processingId === exp.expense_id}
                          onClick={() => handleUpdateStatus(exp, "rejected")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </>
                    )}

                    {exp.status === "approved" && (
                      <button
                        type="button"
                        disabled={processingId === exp.expense_id}
                        onClick={() => handleUpdateStatus(exp, "reimbursed")}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        Mark Reimbursed
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
