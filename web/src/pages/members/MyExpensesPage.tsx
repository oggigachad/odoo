import React, { useEffect, useState } from "react";
import { Plus, Receipt, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { api, formatCurrency, APIClientError } from "../../lib/api";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface ExpenseItem {
  expense_id: number;
  description: string;
  amount: string;
  receipt_url?: string;
  incurred_on: string;
  submitted_at: string;
  status: string;
  reimbursed_at?: string;
}

export const MyExpensesPage: React.FC = () => {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form submission state
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [incurredOn, setIncurredOn] = useState(new Date().toISOString().split("T")[0]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchExpenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ExpenseItem[]>("/expenses");
      setExpenses(data);
    } catch {
      setError("Failed to load your submitted expenses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount.trim()) return;

    setSubmitting(true);
    setFormError(null);

    try {
      await api.post("/expenses", {
        description: description.trim(),
        amount: parseFloat(amount).toFixed(2),
        receipt_url: receiptUrl.trim() || undefined,
        incurred_on: incurredOn || undefined,
      });

      setDescription("");
      setAmount("");
      setReceiptUrl("");
      setShowForm(false);
      await fetchExpenses();
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to submit expense for reimbursement.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "submitted":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="h-3 w-3" /> Submitted
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
            <CheckCircle2 className="h-3 w-3" /> Approved (Queued)
          </span>
        );
      case "reimbursed":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" /> Reimbursed
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200">
            <XCircle className="h-3 w-3" /> Rejected
          </span>
        );
      default:
        return (
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Expense Claims & Reimbursement
          </h1>
          <p className="mt-1 text-base text-slate-600">
            Submit out-of-pocket event and club receipts for audited treasurer payout.
          </p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-sm transition"
        >
          <Plus className="h-4 w-4" />
          {showForm ? "Cancel Claim" : "Submit New Claim"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmitExpense}
          className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 space-y-5"
        >
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-sky-600" />
            New Reimbursement Claim
          </h2>

          {formError && (
            <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Expense Description *
              </label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Stage lighting cables for Spring Gala"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Amount (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1450.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Date Incurred *
              </label>
              <input
                type="date"
                required
                value={incurredOn}
                onChange={(e) => setIncurredOn(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Receipt File URL (Optional)
              </label>
              <input
                type="url"
                value={receiptUrl}
                onChange={(e) => setReceiptUrl(e.target.value)}
                placeholder="https://drive.google.com/... or uploaded receipt link"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Per D-017, no officer may approve their own expense. Claims undergo dual-audit.
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-sm disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Claim for Review"}
            </button>
          </div>
        </form>
      )}

      {error && <ErrorBanner message={error} onRetry={fetchExpenses} />}

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : expenses.length === 0 ? (
        <EmptyState
          message="You haven't submitted any reimbursement claims."
          icon={<Receipt className="w-12 h-12" />}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
          {expenses.map((exp) => (
            <div key={exp.expense_id} className="p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-bold text-slate-900 text-base">{exp.description}</h3>
                  {getStatusBadge(exp.status)}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
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
                        className="text-sky-600 hover:underline font-medium"
                      >
                        View Receipt
                      </a>
                    </>
                  )}
                </div>
              </div>

              <div className="text-right">
                <span className="text-lg font-black text-slate-900">
                  {formatCurrency(exp.amount)}
                </span>
                {exp.reimbursed_at && (
                  <span className="block text-[11px] text-emerald-600 font-semibold">
                    Paid on {new Date(exp.reimbursed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
