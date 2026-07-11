const KEY = 'xroga_pending_build_jobs';

export interface PendingBuildJob {
  assistantMessageId: string;
  userMessageId: string;
  userPrompt: string;
  startedAt: number;
}

export function loadPendingBuildJobs(): PendingBuildJob[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingBuildJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePendingBuildJobs(jobs: PendingBuildJob[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs.slice(0, 10)));
  } catch {
    /* ignore */
  }
}

export function addPendingBuildJob(job: PendingBuildJob) {
  const jobs = loadPendingBuildJobs().filter((j) => j.assistantMessageId !== job.assistantMessageId);
  jobs.unshift(job);
  savePendingBuildJobs(jobs);
}

export function removePendingBuildJob(assistantMessageId: string) {
  savePendingBuildJobs(loadPendingBuildJobs().filter((j) => j.assistantMessageId !== assistantMessageId));
}
