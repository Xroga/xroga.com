'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Gift, Link2, Upload } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import { api, type TaskItem } from '@/lib/api';
import { cn } from '@/lib/utils';
import 'react-loading-skeleton/dist/skeleton.css';

const CADENCE_LABELS = {
  daily: 'Daily Tasks',
  weekly: 'Weekly Tasks',
  monthly: 'Monthly Tasks',
} as const;

const CADENCE_RESET = {
  daily: 'Resets every 24 hours',
  weekly: 'Resets every Monday',
  monthly: 'Resets on the 1st of each month',
} as const;

function TaskRow({ task, onSubmit }: { task: TaskItem; onSubmit: (taskId: string, link?: string, file?: File) => Promise<void> }) {
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSubmit() {
    setBusy(true);
    setMsg(null);
    try {
      await onSubmit(task.id, link || undefined, file ?? undefined);
      setMsg('Submitted successfully!');
      setLink('');
      setFile(null);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckIn() {
    setBusy(true);
    setMsg(null);
    try {
      const result = await api.tasks.checkIn();
      setMsg(result.message);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-4 space-y-3 transition-colors',
        task.completed
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-[var(--card-border)] glass-panel'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">{task.title}</h3>
            {task.completed && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          </div>
          <p className="text-xs text-[var(--muted)] mt-0.5">{task.description}</p>
        </div>
        <div className="text-right shrink-0 text-xs">
          <p className="font-semibold text-[var(--accent)]">+{task.xrgReward} XRG</p>
          <p className="text-[var(--muted)]">+{task.tokenBoost.toLocaleString()} tokens</p>
        </div>
      </div>

      {!task.completed && (
        <div className="space-y-2">
          {task.verification !== 'automatic' && (
            <>
              {task.verification.includes('link') && (
                <div className="flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                  <input
                    type="url"
                    placeholder="Paste post link"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-[var(--card-border)] text-xs focus:outline-none focus:border-[var(--accent)]/50"
                  />
                </div>
              )}
              {task.verification.includes('screenshot') && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                  <span className="text-xs text-[var(--muted)]">
                    {file ? file.name : 'Upload screenshot proof'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={handleSubmit}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Verifying…' : 'Submit proof'}
              </button>
            </>
          )}
          {task.verification === 'automatic' && (
            <button
              type="button"
              disabled={busy}
              onClick={handleCheckIn}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busy ? 'Checking in…' : 'Check in now'}
            </button>
          )}
        </div>
      )}
      {msg && <p className="text-xs text-[var(--muted)]">{msg}</p>}
    </div>
  );
}

function CadenceSection({
  cadence,
  tasks,
  onSubmit,
}: {
  cadence: 'daily' | 'weekly' | 'monthly';
  tasks: TaskItem[];
  onSubmit: (taskId: string, link?: string, file?: File) => Promise<void>;
}) {
  const sectionTasks = tasks.filter((t) => t.cadence === cadence);
  if (!sectionTasks.length) return null;

  const totalXrg = sectionTasks.reduce((s, t) => s + t.xrgReward, 0);
  const totalBoost = sectionTasks.reduce((s, t) => s + t.tokenBoost, 0);
  const completed = sectionTasks.filter((t) => t.completed).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Gift className="w-4 h-4 text-[var(--accent)]" />
            {CADENCE_LABELS[cadence]}
          </h2>
          <p className="text-xs text-[var(--muted)]">{CADENCE_RESET[cadence]}</p>
        </div>
        <p className="text-xs text-[var(--muted)]">
          {completed}/{sectionTasks.length} done · up to {totalXrg} XRG + {totalBoost.toLocaleString()} tokens
        </p>
      </div>
      <div className="grid gap-3">
        {sectionTasks.map((task) => (
          <TaskRow key={task.id} task={task} onSubmit={onSubmit} />
        ))}
      </div>
    </section>
  );
}

export function TasksView() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.tasks
      .list()
      .then((r) => setTasks(r.tasks))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(taskId: string, link?: string, file?: File) {
    const result = await api.tasks.submit(taskId, {
      link,
      screenshotSize: file?.size,
    });
    if (!result.success) throw new Error(result.message);
    load();
  }

  const grandXrg = tasks.reduce((s, t) => s + t.xrgReward, 0);
  const grandBoost = tasks.reduce((s, t) => s + t.tokenBoost, 0);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton height={48} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
        <Skeleton height={120} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
        <Skeleton height={120} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 universe-fade-in">
      <header>
        <h1 className="text-2xl font-bold">Earn XRG & Token Boosts</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Complete tasks to earn XRG tokens and boost your monthly token quota.
        </p>
      </header>

      <div className="glass-panel rounded-xl p-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[var(--accent)]" />
          <span>
            <strong>{tasks.filter((t) => t.completed).length}</strong> / {tasks.length} tasks completed
          </span>
        </div>
        <div>
          <span className="text-[var(--muted)]">Max this cycle: </span>
          <strong className="text-[var(--accent)]">{grandXrg.toLocaleString()} XRG</strong>
          <span className="text-[var(--muted)]"> + </span>
          <strong>{grandBoost.toLocaleString()} tokens</strong>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-4 text-xs text-[var(--muted)] space-y-1">
        <p className="font-medium text-[var(--foreground)]">Consistency bonus</p>
        <p>Month 2: +5% · Month 3: +10% · Month 4: +15% · Month 5+: +20% on all task rewards</p>
      </div>

      <CadenceSection cadence="daily" tasks={tasks} onSubmit={handleSubmit} />
      <CadenceSection cadence="weekly" tasks={tasks} onSubmit={handleSubmit} />
      <CadenceSection cadence="monthly" tasks={tasks} onSubmit={handleSubmit} />
    </div>
  );
}
