import React, { useEffect, useState } from "react";
import { HeartHandshake, Plus, CheckCircle2, Clock, Calendar, AlertCircle } from "lucide-react";
import { api, formatCurrency, APIClientError } from "../../lib/api";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface TaskItem {
  task_id: number;
  fundraiser_id: number;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  assigned_member_id?: number | null;
  due_date?: string | null;
}

interface FundraiserItem {
  fundraiser_id: number;
  name: string;
  description?: string;
  goal_amount: string;
}

interface ProgressResponse {
  fundraiser_id: number;
  name: string;
  goal_amount: string;
  amount_raised: string;
  tasks_total: number;
  tasks_done: number;
  progress_pct: number;
}

export const FundraiserBoardPage: React.FC = () => {
  const [fundraisers, setFundraisers] = useState<FundraiserItem[]>([]);
  const [selectedFundraiserId, setSelectedFundraiserId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Task Modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFundraisers = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await api.get<FundraiserItem[]>("/fundraisers");
        setFundraisers(list);
        if (list.length > 0) {
          setSelectedFundraiserId(list[0].fundraiser_id);
        }
      } catch {
        setError("Failed to load fundraisers.");
      } finally {
        setLoading(false);
      }
    };
    fetchFundraisers();
  }, []);

  const fetchBoardData = async (fId: number) => {
    try {
      const [tList, pData] = await Promise.all([
        api.get<TaskItem[]>(`/fundraisers/${fId}/tasks`),
        api.get<ProgressResponse>(`/fundraisers/${fId}/progress`),
      ]);
      setTasks(tList);
      setProgress(pData);
    } catch {
      // Board data load failed
    }
  };

  useEffect(() => {
    if (selectedFundraiserId) {
      fetchBoardData(selectedFundraiserId);
    }
  }, [selectedFundraiserId]);

  const handleStatusChange = async (task: TaskItem, newStatus: "todo" | "in_progress" | "done") => {
    try {
      await api.patch(`/fundraisers/${task.fundraiser_id}/tasks/${task.task_id}`, {
        status: newStatus,
      });
      if (selectedFundraiserId) {
        await fetchBoardData(selectedFundraiserId);
      }
    } catch {
      // Status update error
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFundraiserId || !taskTitle.trim()) return;

    setTaskSubmitting(true);
    setTaskError(null);

    try {
      await api.post(`/fundraisers/${selectedFundraiserId}/tasks`, {
        title: taskTitle.trim(),
        description: taskDesc.trim() || undefined,
        due_date: dueDate || undefined,
      });

      setTaskTitle("");
      setTaskDesc("");
      setDueDate("");
      setShowTaskModal(false);
      await fetchBoardData(selectedFundraiserId);
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setTaskError(err.message);
      } else {
        setTaskError("Failed to create volunteer task.");
      }
    } finally {
      setTaskSubmitting(false);
    }
  };

  const todoTasks = tasks.filter((t) => t.status === "todo");
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Fundraiser & Volunteer Task Board
          </h1>
          <p className="mt-1 text-base text-slate-600">
            Kanban sprint tracking, volunteer duty assignments, and real-time donation progress.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedFundraiserId || ""}
            onChange={(e) => setSelectedFundraiserId(parseInt(e.target.value, 10))}
            className="px-4 py-2.5 rounded-xl border border-slate-300 font-semibold text-sm bg-white shadow-sm"
          >
            {fundraisers.map((f) => (
              <option key={f.fundraiser_id} value={f.fundraiser_id}>
                {f.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowTaskModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            Add Task
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Progress & Raised vs Goal Header per 07_UI_SPECS.md §4 */}
      {progress && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Campaign Progress
              </span>
              <h2 className="text-xl font-bold text-slate-900">{progress.name}</h2>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block font-semibold uppercase">
                Raised vs Goal
              </span>
              <span className="text-xl font-black text-slate-900">
                {formatCurrency(progress.amount_raised)}{" "}
                <span className="text-slate-400 text-sm font-normal">
                  / {formatCurrency(progress.goal_amount)}
                </span>
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 font-semibold">
              <span>
                Task Milestones: {progress.tasks_done} of {progress.tasks_total} complete
              </span>
              <span>{Math.round(progress.progress_pct)}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, progress.progress_pct)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        /* Kanban Columns: To do / In progress / Done */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: To Do */}
          <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between px-2">
              <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">
                To Do
              </h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                {todoTasks.length}
              </span>
            </div>
            <div className="space-y-3">
              {todoTasks.map((t) => (
                <div
                  key={t.task_id}
                  className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2 hover:shadow transition"
                >
                  <h4 className="font-bold text-slate-900 text-sm">{t.title}</h4>
                  {t.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">{t.description}</p>
                  )}
                  {t.due_date && (
                    <p className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Due {new Date(t.due_date).toLocaleDateString()}
                    </p>
                  )}
                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(t, "in_progress")}
                      className="text-xs text-sky-600 hover:text-sky-800 font-semibold"
                    >
                      Move to In Progress &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: In Progress */}
          <div className="bg-amber-50/40 rounded-2xl p-4 border border-amber-200/60 space-y-3">
            <div className="flex items-center justify-between px-2">
              <h3 className="font-bold text-sm text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                In Progress
              </h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {inProgressTasks.length}
              </span>
            </div>
            <div className="space-y-3">
              {inProgressTasks.map((t) => (
                <div
                  key={t.task_id}
                  className="p-4 bg-white rounded-xl border border-amber-200 shadow-sm space-y-2 hover:shadow transition"
                >
                  <h4 className="font-bold text-slate-900 text-sm">{t.title}</h4>
                  {t.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">{t.description}</p>
                  )}
                  {t.due_date && (
                    <p className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Due {new Date(t.due_date).toLocaleDateString()}
                    </p>
                  )}
                  <div className="pt-2 border-t border-slate-100 flex justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(t, "todo")}
                      className="text-slate-500 hover:text-slate-800"
                    >
                      &larr; To Do
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(t, "done")}
                      className="text-emerald-600 hover:text-emerald-800 font-semibold"
                    >
                      Complete &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3: Done */}
          <div className="bg-emerald-50/40 rounded-2xl p-4 border border-emerald-200/60 space-y-3">
            <div className="flex items-center justify-between px-2">
              <h3 className="font-bold text-sm text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {doneTasks.length}
              </span>
            </div>
            <div className="space-y-3">
              {doneTasks.map((t) => (
                <div
                  key={t.task_id}
                  className="p-4 bg-white rounded-xl border border-emerald-200 shadow-sm space-y-2 opacity-90"
                >
                  <h4 className="font-bold text-slate-900 text-sm line-through text-slate-500">
                    {t.title}
                  </h4>
                  {t.description && (
                    <p className="text-xs text-slate-400 line-clamp-2">{t.description}</p>
                  )}
                  <div className="pt-2 border-t border-slate-100 flex justify-start text-xs">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(t, "in_progress")}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      &larr; Reopen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-sky-600" />
              New Volunteer Task
            </h3>

            {taskError && (
              <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{taskError}</span>
              </div>
            )}

            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Set up stage audio and microphones"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Due Date (Optional)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  placeholder="Notes, required equipment..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={taskSubmitting}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                >
                  {taskSubmitting ? "Creating..." : "Add to Board"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
