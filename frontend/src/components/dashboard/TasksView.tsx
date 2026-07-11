'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Clock, Gift, Link2, Upload } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import { api, type TaskItem } from '@/lib/api';
import { cn } from '@/lib/utils';
import 'react-loading-skeleton/dist/skeleton.css';

const CADENCE_SECTIONS: Array<{
  cadence: TaskItem['cadence'];
  title: string;
  reset: string;
}> = [
  { cadence: 'daily', title: 'Daily Tasks', reset: 'Reset every 24 hours' },
  { cadence: 'weekly', title: 'Weekly Tasks', reset: 'Reset every Monday' },
  { cadence: 'monthly', title: 'Monthly Tasks', reset: 'Reset on the 1st of each month' },
  { cadence: 'special', title: 'Special Tasks', reset: 'Monthly — 1 per user' },
  { cadence: 'once', title: 'Referral Program', reset: 'Unlimited referrals — instant rewards on subscribe' },
];

function TaskRow({
  task,
  onSubmit,
}: {
  task: TaskItem;
  onSubmit: (taskId: string, link?: string, file?: File) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
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

  const isReferral = task.id === 'referral';

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden transition-colors',
        task.completed
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-[var(--card-border)] glass-panel'
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left flex items-start justify-between gap-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">{task.title}</h3>
            {task.completed && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          </div>
          <p className="text-xs text-[var(--muted)] mt-0.5">{task.description}</p>
          {task.platform && (
            <p className="text-[10px] text-violet-400 mt-1">Platform: {task.platform}</p>
          )}
        </div>
        <div className="text-right shrink-0 flex items-start gap-2">
          <div className="text-xs">
            <p className="font-semibold text-[var(--accent)]">+{task.xrgReward.toLocaleString()} XRG</p>
            <p className="text-[var(--muted)]">+{task.tokenBoost.toLocaleString()} tokens</p>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-[var(--muted)] transition-transform mt-0.5', expanded && 'rotate-180')} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--card-border)]/60 pt-3">
          {task.frequency && (
            <p className="text-xs text-[var(--muted)]">
              <Clock className="w-3 h-3 inline mr-1" />
              {task.frequency}
            </p>
          )}

          {task.requirements && task.requirements.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">Requirements</p>
              <ul className="text-xs text-[var(--muted)] space-y-0.5 list-disc list-inside">
                {task.requirements.map((req) => (
                  <li key={req}>{req}</li>
                ))}
              </ul>
            </div>
          )}

          {task.examplePost && (
            <div className="rounded-lg bg-white/5 p-3">
              <p className="text-[10px] font-medium text-[var(--muted)] mb-1">Example</p>
              <p className="text-xs italic text-[var(--foreground)]/90">{task.examplePost}</p>
            </div>
          )}

          {!task.completed && !isReferral && (
            <div className="space-y-2">
              {task.verification !== 'automatic' && (
                <>
                  {task.verification.includes('link') && (
                    <div className="flex items-center gap-2">
                      <Link2 className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                      <input
                        type="url"
                        placeholder="Paste public post link"
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
              {task.verification === 'automatic' && task.id === 'daily_checkin' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCheckIn}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {busy ? 'Checking in…' : '☀️ Check-in now'}
                </button>
              )}
            </div>
          )}

          {isReferral && !task.completed && (
            <p className="text-xs text-[var(--muted)]">
              Both earn 250K AI tokens + 5,000 XRG instantly when your friend subscribes, plus 3-month bonuses.{' '}
              <a href="/dashboard/referrals" className="text-[var(--accent)] font-semibold hover:underline">
                Open Refer &amp; Earn →
              </a>
            </p>
          )}

          {msg && <p className="text-xs text-[var(--muted)]">{msg}</p>}
        </div>
      )}
    </div>
  );
}

function CadenceSection({
  cadence,
  title,
  reset,
  tasks,
  onSubmit,
}: {
  cadence: TaskItem['cadence'];
  title: string;
  reset: string;
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
            {title}
          </h2>
          <p className="text-xs text-[var(--muted)]">{reset}</p>
        </div>
        <p className="text-xs text-[var(--muted)]">
          {completed}/{sectionTasks.length} done · up to {totalXrg.toLocaleString()} XRG +{' '}
          {totalBoost.toLocaleString()} tokens
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
          Complete tasks to earn XRG tokens and boost your monthly 7M token quota. Tap any task for full requirements and examples.
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
          <span className="text-[var(--muted)]">Max available: </span>
          <strong className="text-[var(--accent)]">{grandXrg.toLocaleString()} XRG</strong>
          <span className="text-[var(--muted)]"> + </span>
          <strong>{grandBoost.toLocaleString()} tokens</strong>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-4 text-xs text-[var(--muted)] space-y-1">
        <p className="font-medium text-[var(--foreground)]">Consistency bonus</p>
        <p>Month 2: +5% · Month 3: +10% · Month 4: +15% · Month 5+: +20% on all task rewards</p>
      </div>

      {CADENCE_SECTIONS.map(({ cadence, title, reset }) => (
        <CadenceSection
          key={cadence}
          cadence={cadence}
          title={title}
          reset={reset}
          tasks={tasks}
          onSubmit={handleSubmit}
        />
      ))}
    </div>
  );
}
