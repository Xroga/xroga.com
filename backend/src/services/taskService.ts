import { TASK_CATALOG, type TaskDefinition, consistencyBonusPercent } from '../config/taskCatalog.js';
import { creditXrg } from './xrgBalance.js';
import { getSupabaseAdmin } from '../config/supabase.js';

export interface TaskStatus extends TaskDefinition {
  completed: boolean;
  completedAt: string | null;
  pendingReview: boolean;
}

const completions = new Map<string, Set<string>>();

function completionKey(userId: string, taskId: string, period: string) {
  return `${userId}:${taskId}:${period}`;
}

function periodKey(cadence: TaskDefinition['cadence']): string {
  const now = new Date();
  if (cadence === 'once') return 'once';
  if (cadence === 'special') return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  if (cadence === 'daily') return now.toISOString().slice(0, 10);
  if (cadence === 'weekly') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 1 - day);
    return `w${d.toISOString().slice(0, 10)}`;
  }
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function isCompleted(userId: string, task: TaskDefinition): Promise<boolean> {
  const period = periodKey(task.cadence);
  const key = completionKey(userId, task.id, period);
  if (completions.get(key)?.has('done')) return true;

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('user_task_completions')
        .select('id')
        .eq('user_id', userId)
        .eq('task_id', task.id)
        .eq('period_key', period)
        .eq('status', 'approved')
        .maybeSingle();
      if (data) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export async function listTasks(userId: string): Promise<TaskStatus[]> {
  const result: TaskStatus[] = [];
  for (const task of TASK_CATALOG) {
    const completed = await isCompleted(userId, task);
    result.push({
      ...task,
      completed,
      completedAt: completed ? new Date().toISOString() : null,
      pendingReview: false,
    });
  }
  return result;
}

async function validateLink(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

function quickScreenshotCheck(sizeBytes: number): boolean {
  return sizeBytes > 50_000 && sizeBytes < 5_000_000;
}

export async function submitTask(
  userId: string,
  taskId: string,
  proof: { link?: string; screenshotSize?: number }
): Promise<{ success: boolean; message: string }> {
  const task = TASK_CATALOG.find((t) => t.id === taskId);
  if (!task) return { success: false, message: 'Unknown task' };

  if (await isCompleted(userId, task)) {
    return { success: false, message: 'Task already completed for this period' };
  }

  if (task.id === 'referral') {
    return { success: false, message: 'Referral rewards credit automatically when your friend subscribes and stays active 30 days.' };
  }

  if (task.verification === 'automatic' || taskId === 'daily_checkin') {
    return completeTask(userId, task);
  }

  if (task.verification.includes('link')) {
    if (!proof.link?.trim()) {
      return { success: false, message: 'A valid post link is required' };
    }
    const valid = await validateLink(proof.link);
    if (!valid) return { success: false, message: 'Link validation failed' };
  }

  if (task.verification.includes('screenshot')) {
    if (!proof.screenshotSize || !quickScreenshotCheck(proof.screenshotSize)) {
      return { success: false, message: 'Screenshot validation failed — upload a real screenshot (50KB–5MB)' };
    }
  }

  return completeTask(userId, task);
}

async function completeTask(
  userId: string,
  task: TaskDefinition
): Promise<{ success: boolean; message: string }> {
  const period = periodKey(task.cadence);
  const key = completionKey(userId, task.id, period);
  if (!completions.has(key)) completions.set(key, new Set());
  completions.get(key)!.add('done');

  const bonusPct = consistencyBonusPercent(1);
  const xrg = Math.round(task.xrgReward * (1 + bonusPct / 100));
  const boost = Math.round(task.tokenBoost * (1 + bonusPct / 100));

  await creditXrg(userId, xrg, boost);

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from('user_task_completions').insert({
        user_id: userId,
        task_id: task.id,
        period_key: period,
        status: 'approved',
        xrg_awarded: xrg,
        token_boost: boost,
      });
    } catch {
      // memory ok
    }
  }

  return {
    success: true,
    message: `Task completed! +${xrg} XRG, +${boost.toLocaleString()} token boost`,
  };
}

export async function dailyCheckIn(userId: string) {
  return submitTask(userId, 'daily_checkin', {});
}
