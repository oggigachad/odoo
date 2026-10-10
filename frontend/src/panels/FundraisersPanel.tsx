import { useState, useEffect, useCallback } from 'react'
import { money, digits } from '../numeric'
import { Check, ChevronUp, ChevronDown, ArrowRight } from 'lucide-react'
import { api } from '../apiClient'
import { useLiveRefresh } from '../useRealtimeUpdates'

interface Task {
  task_id: number
  fundraiser_id: number
  title: string
  description?: string
  assigned_to?: number
  assignee_name?: string
  status: 'todo' | 'in_progress' | 'done'
  due_date?: string
}

interface Fundraiser {
  fundraiser_id: number
  title: string
  description?: string
  event_date?: string
  goal_amount?: string
}

interface Progress {
  fundraiser_id: number
  title: string
  goal_amount?: string
  tasks_total: number
  tasks_done: number
  amount_raised: string  // "0.00"
}

const FONT = { fontFamily: '"TT Firs Neue", sans-serif' }
const STATUS_COLORS: Record<Task['status'], string> = {
  todo: 'bg-zinc-500/20 text-zinc-300 border-zinc-400/30',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export default function FundraisersPanel({ memberId, isOfficer }: { memberId: number; isOfficer?: boolean }) {
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([])
  const [tasks, setTasks] = useState<Record<number, Task[]>>({})
  const [progress, setProgress] = useState<Record<number, Progress>>({})
  const [expanded, setExpanded] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingTask, setUpdatingTask] = useState<number | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [showCreateFr, setShowCreateFr] = useState(false)
  const [frForm, setFrForm] = useState({ title: '', description: '', event_date: '', goal_amount: '' })
  const [creatingFr, setCreatingFr] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState<number | null>(null)
  const [taskForm, setTaskForm] = useState({ title: '', description: '', due_date: '' })
  const [creatingTask, setCreatingTask] = useState(false)
  const [people, setPeople] = useState<{ member_id: number; full_name: string }[]>([])
  useEffect(() => {
    if (!isOfficer) return
    api<{ items: { member_id: number; full_name: string }[] }>('/members?limit=100')
      .then(r => setPeople(r.items)).catch(() => setError('Could not load the member list for assigning tasks.'))
  }, [isOfficer])
  const [taskAssignee, setTaskAssignee] = useState('')
  const assign = async (fundraiserId: number, task: Task, memberIdStr: string) => {
    try {
      const updated = await api<Task>(`/fundraisers/${fundraiserId}/tasks/${task.task_id}`, {
        method: 'PATCH', body: JSON.stringify({ assigned_to: memberIdStr ? Number(memberIdStr) : null }),
      })
      setTasks(prev => ({ ...prev, [fundraiserId]: prev[fundraiserId].map(t => (t.task_id === task.task_id ? { ...t, ...updated } : t)) }))
    } catch (e: any) { setError(e?.detail ?? e?.message ?? 'Could not assign the task.') }
  }
  const health = (fr: Fundraiser, prog?: Progress): { label: string; cls: string } => {
    if (!prog) return { label: '', cls: '' }
    const taskPct = prog.tasks_total ? (prog.tasks_done / prog.tasks_total) * 100 : 100
    const goal = prog.goal_amount ? parseFloat(prog.goal_amount) : 0
    const moneyPct = goal > 0 ? (parseFloat(prog.amount_raised) / goal) * 100 : 100
    if (!prog.tasks_total && goal <= 0) return { label: '', cls: '' }
    if (taskPct >= 100 && moneyPct >= 100) return { label: 'Complete', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    const days = fr.event_date ? Math.ceil((new Date(fr.event_date).getTime() - Date.now()) / 864e5) : null
    if (days !== null && days < 0) return { label: 'Behind', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
    if (days !== null && days <= 7 && (taskPct < 60 || moneyPct < 50)) return { label: 'At risk', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    return { label: 'On track', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  }

  const load = useCallback(async () => {
    try {
      const frs = await api<Fundraiser[]>('/fundraisers')
      setFundraisers(frs)
      const details = await Promise.all(frs.map(f => Promise.all([
        api<Task[]>(`/fundraisers/${f.fundraiser_id}/tasks`),
        api<Progress>(`/fundraisers/${f.fundraiser_id}/progress`),
      ])))
      setTasks(Object.fromEntries(frs.map((f, i) => [f.fundraiser_id, details[i][0]])))
      setProgress(Object.fromEntries(frs.flatMap((f, i) => (details[i][1] ? [[f.fundraiser_id, details[i][1] as Progress]] : []))))
    } catch {
      setError('Could not load fundraisers.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useLiveRefresh(['fundraisers'], load)

  const flash = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 4000) }

  const loadDetail = useCallback(async (id: number) => {
    if (tasks[id]) { setExpanded(id); return }
    try {
      const [t, p] = await Promise.all([
        api<Task[]>(`/fundraisers/${id}/tasks`),
        api<Progress>(`/fundraisers/${id}/progress`),
      ])
      setTasks(prev => ({ ...prev, [id]: t }))
      setProgress(prev => ({ ...prev, [id]: p }))
      setExpanded(id)
    } catch {
      setError('Could not load tasks.')
    }
  }, [tasks])

  const cycleStatus = async (fundraiserId: number, task: Task) => {
    const next: Record<Task['status'], Task['status']> = { todo: 'in_progress', in_progress: 'done', done: 'todo' }
    setUpdatingTask(task.task_id)
    try {
      await api(`/fundraisers/${fundraiserId}/tasks/${task.task_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next[task.status] }),
      })
      setTasks(prev => ({
        ...prev,
        [fundraiserId]: prev[fundraiserId].map(t => t.task_id === task.task_id ? { ...t, status: next[task.status] } : t),
      }))
    } catch (e: any) {
      setError(e?.detail ?? 'Failed to update task.')
    } finally {
      setUpdatingTask(null)
    }
  }

  const handleCreateFundraiser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!frForm.title) return
    setCreatingFr(true)
    try {
      await api('/fundraisers', {
        method: 'POST',
        body: JSON.stringify({
          title: frForm.title,
          description: frForm.description || undefined,
          event_date: frForm.event_date || undefined,
          goal_amount: frForm.goal_amount || undefined,
        }),
      })
      flash('Fundraiser created!')
      setFrForm({ title: '', description: '', event_date: '', goal_amount: '' })
      setShowCreateFr(false)
      load()
    } catch (e: any) {
      setError(e?.detail ?? 'Create failed.')
    } finally {
      setCreatingFr(false)
    }
  }

  const handleCreateTask = async (fundraiserId: number) => {
    if (!taskForm.title) return
    setCreatingTask(true)
    try {
      const newTask = await api<Task>(`/fundraisers/${fundraiserId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: taskForm.title,
          description: taskForm.description || undefined,
          due_date: taskForm.due_date || undefined,
          assigned_to: taskAssignee ? Number(taskAssignee) : undefined,
        }),
      })
      load()
      setTasks(prev => ({ ...prev, [fundraiserId]: [...(prev[fundraiserId] ?? []), newTask] }))
      flash('Task added!')
      setTaskForm({ title: '', description: '', due_date: '' })
      setTaskAssignee('')
      setShowCreateTask(null)
    } catch (e: any) {
      setError(e?.detail ?? 'Task creation failed.')
    } finally {
      setCreatingTask(false)
    }
  }

  return (
    <div style={FONT} className="space-y-4 animate-fadeIn">
      {isOfficer && (
        <div className="flex justify-end">
          <button onClick={() => setShowCreateFr(v => !v)}
            className="px-4 py-2 rounded-xl bg-[#714B67] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#5d3d54] transition">
            {showCreateFr ? 'Cancel' : '+ New Fundraiser'}
          </button>
        </div>
      )}

      {showCreateFr && (
        <form onSubmit={handleCreateFundraiser} className=" p-5 space-y-3 border-b border-neutral-200">
          <h3 className="font-bold text-neutral-900 text-sm">New Fundraiser</h3>
          <input required placeholder="Title *" value={frForm.title} onChange={e => setFrForm(f => ({ ...f, title: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
          <textarea placeholder="Description" rows={2} value={frForm.description} onChange={e => setFrForm(f => ({ ...f, description: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs resize-none" />
          <div className="flex gap-2">
            <input type="date" value={frForm.event_date} onChange={e => setFrForm(f => ({ ...f, event_date: e.target.value }))}
              className="flex-1 px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
            <input placeholder="Goal amount (₹)" value={frForm.goal_amount} onChange={e => setFrForm(f => ({ ...f, goal_amount: money(e.target.value) }))}
              className="flex-1 px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
          </div>
          <button type="submit" disabled={creatingFr}
            className="px-5 py-2 rounded-xl bg-[#714B67] text-white text-xs font-bold hover:bg-[#5d3d54] transition disabled:opacity-40">
            {creatingFr ? 'Creating...' : 'Create Fundraiser'}
          </button>
        </form>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{error} <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button></div>}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-[#714B67] border-t-transparent rounded-full animate-spin" /></div>
      ) : fundraisers.length === 0 ? (
        <p className="text-neutral-500 text-sm text-center py-12">No active fundraisers.</p>
      ) : (
        fundraisers.map(fr => {
          const isOpen = expanded === fr.fundraiser_id
          const prog = progress[fr.fundraiser_id]
          const raised = prog ? parseFloat(prog.amount_raised) : 0
          const goal = prog?.goal_amount ? parseFloat(prog.goal_amount) : (fr.goal_amount ? parseFloat(fr.goal_amount) : 0)
          const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0
          const frTasks = tasks[fr.fundraiser_id] ?? []

          return (
            <div key={fr.fundraiser_id} className=" overflow-hidden border-b border-neutral-200">
              <button className="w-full text-left p-5 hover:bg-transparent transition-all"
                onClick={() => isOpen ? setExpanded(null) : loadDetail(fr.fundraiser_id)}>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-neutral-900 text-sm">{fr.title}</h3>
                    {fr.description && <p className="text-neutral-500 text-xs mt-0.5 line-clamp-1">{fr.description}</p>}
                    {fr.event_date && <p className="text-neutral-400 text-[10px] mt-0.5">{fr.event_date}</p>}
                  </div>
                  {prog && (
                    <span className="flex flex-col items-end gap-1 mr-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${health(fr, prog).cls}`}>{health(fr, prog).label}</span>
                      <span className="text-[10px] text-neutral-500">{prog.tasks_done}/{prog.tasks_total} tasks done</span>
                    </span>
                  )}
                  {fr.goal_amount && (
                    <span className="font-black text-[#714B67] text-sm whitespace-nowrap">
                      ₹{raised.toFixed(2)} / ₹{parseFloat(fr.goal_amount).toFixed(2)}
                    </span>
                  )}
                </div>
                {goal > 0 && (
                  <>
                    <div className="mt-3 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#0284C7] to-[#38bdf8] rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-neutral-400">
                      <span>{pct}% funded</span>
                      <span className="flex items-center gap-1">
                        {isOpen ? <><ChevronUp className="w-3 h-3" /> Hide</> : <><ChevronDown className="w-3 h-3" /> Tasks</>}
                      </span>
                    </div>
                  </>
                )}
                {goal === 0 && (
                  <div className="text-[10px] text-neutral-400 mt-1 flex justify-end items-center gap-1">
                    {isOpen ? <><ChevronUp className="w-3 h-3" /> Hide</> : <><ChevronDown className="w-3 h-3" /> Tasks</>}
                  </div>
                )}
              </button>

              {isOpen && (
                <div className="border-t border-neutral-200 px-5 py-4 space-y-3">
                  {prog && <p className="text-xs text-neutral-500">Tasks: {prog.tasks_done}/{prog.tasks_total} done</p>}

                  {frTasks.length === 0 ? (
                    <p className="text-neutral-400 text-xs">No tasks yet.</p>
                  ) : (
                    frTasks.map(task => (
                      <div key={task.task_id} className="flex items-center gap-3 p-3 border-b border-neutral-200">
                        <button onClick={() => cycleStatus(fr.fundraiser_id, task)} disabled={updatingTask === task.task_id}
                          className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                            task.status === 'done' ? 'bg-emerald-500 border-emerald-400' : task.status === 'in_progress' ? 'bg-amber-500 border-amber-400' : 'border-neutral-300 hover:border-white/60'
                          }`} title="Click to cycle status">
                          {task.status === 'done' && <Check className="w-3 h-3 text-neutral-900" />}
                          {task.status === 'in_progress' && <ArrowRight className="w-3 h-3 text-neutral-900" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${task.status === 'done' ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>{task.title}</p>
                          {task.assignee_name && (
                            <p className="text-[10px] text-neutral-500 flex items-center gap-1 mt-0.5">
                              <ArrowRight className="w-2.5 h-2.5" />
                              <span>{task.assignee_name}</span>
                            </p>
                          )}
                          {task.due_date && <p className="text-[10px] text-neutral-400">Due: {task.due_date}</p>}
                          {!task.assignee_name && <p className="text-[10px] text-amber-700">Nobody assigned yet</p>}
                          {isOfficer && (
                            <select value={task.assigned_to ?? ''} onChange={e => assign(fr.fundraiser_id, task, e.target.value)}
                              className="mt-1 px-2 py-1 rounded-md border border-neutral-300 bg-white text-[10px]">
                              <option value="">Unassigned</option>
                              {people.map(pp => <option key={pp.member_id} value={pp.member_id}>{pp.full_name}</option>)}
                            </select>
                          )}
                        </div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${STATUS_COLORS[task.status]}`}>
                          {task.status.replace('_', ' ')}
                        </span>
                      </div>
                    ))
                  )}

                  {/* Add task */}
                  {isOfficer && showCreateTask !== fr.fundraiser_id && (
                    <button onClick={() => setShowCreateTask(fr.fundraiser_id)}
                      className="text-[#714B67] text-xs hover:underline">+ Add task</button>
                  )}
                  {isOfficer && showCreateTask === fr.fundraiser_id && (
                    <div className="space-y-2 pt-2 border-t border-neutral-200">
                      <input placeholder="Task title *" value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:border-[#714B67] focus:outline-none text-xs" />
                      <div className="flex gap-2">
                        <input placeholder="Description" value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 placeholder-neutral-400 border border-neutral-300 focus:outline-none text-xs" />
                        <input type="date" value={taskForm.due_date} onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))}
                          className="w-36 px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 border border-neutral-300 focus:outline-none text-xs" />
                      </div>
                      <select value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 border border-neutral-300 text-xs">
                        <option value="">Who is doing it? (assign later)</option>
                        {people.map(pp => <option key={pp.member_id} value={pp.member_id}>{pp.full_name}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <button onClick={() => handleCreateTask(fr.fundraiser_id)} disabled={creatingTask}
                          className="px-4 py-1.5 rounded-xl bg-[#714B67] text-white text-xs font-bold hover:bg-[#5d3d54] transition disabled:opacity-40">
                          {creatingTask ? '...' : 'Add Task'}
                        </button>
                        <button onClick={() => { setShowCreateTask(null); setTaskForm({ title: '', description: '', due_date: '' }) }}
                          className="text-neutral-500 hover:text-neutral-900 text-xs">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
