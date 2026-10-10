import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock, Calendar, HeartHandshake } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorBanner } from "../../components/common/ErrorBanner";

interface TaskItem {
  task_id: number;
  fundraiser_id: number;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  assigned_member_id?: number | null;
  due_date?: string | null;
  campaign_name?: string;
}

interface FundraiserItem {
  fundraiser_id: number;
  name: string;
}

export const MyTasksPage: React.FC = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const fundraisers = await api.get<FundraiserItem[]>("/fundraisers");
      const allTasks: TaskItem[] = [];

      for (const f of fundraisers) {
        try {
          const fTasks = await api.get<TaskItem[]>(`/fundraisers/${f.fundraiser_id}/tasks`);
          for (const t of fTasks) {
            if (t.assigned_member_id === user.member_id) {
              allTasks.push({ ...t, campaign_name: f.name });
            }
          }
        } catch {
          // ignore task fetch error for individual fundraiser
        }
      }
      setTasks(allTasks);
    } catch {
      setError("Failed to load your assigned volunteer tasks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [user]);

  const handleStatusChange = async (task: TaskItem, newStatus: "todo" | "in_progress" | "done") => {
    try {
      await api.patch(`/fundraisers/${task.fundraiser_id}/tasks/${task.task_id}`, {
        status: newStatus,
      });
      setTasks((prev) =>
        prev.map((t) => (t.task_id === task.task_id ? { ...t, status: newStatus } : t))
      );
    } catch {
      setError("Could not update task status.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          My Volunteer Tasks
        </h1>
        <p className="mt-1 text-base text-slate-600">
          Fundraiser and event duties assigned to you by club leadership.
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchTasks} />}

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : tasks.length === 0 ? (
        <EmptyState
          message="You don't have any volunteer tasks assigned right now."
          icon={<HeartHandshake className="w-12 h-12" />}
        />
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div
              key={task.task_id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                {task.campaign_name && (
                  <span className="text-[11px] font-semibold text-sky-600 uppercase tracking-wider block">
                    {task.campaign_name}
                  </span>
                )}
                <h3 className="font-bold text-slate-900 text-lg">{task.title}</h3>
                {task.description && (
                  <p className="text-sm text-slate-600 leading-relaxed">{task.description}</p>
                )}
                {task.due_date && (
                  <p className="text-xs text-slate-400 flex items-center gap-1 pt-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Due by: {new Date(task.due_date).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Status Picker */}
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => handleStatusChange(task, "todo")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    task.status === "todo"
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  To Do
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(task, "in_progress")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1 ${
                    task.status === "in_progress"
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <Clock className="h-3 w-3" /> In Progress
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(task, "done")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1 ${
                    task.status === "done"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <CheckCircle2 className="h-3 w-3" /> Done
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
