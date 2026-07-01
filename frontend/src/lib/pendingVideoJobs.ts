const KEY = 'xroga_pending_video_jobs';

export interface PendingVideoJob {
  jobId: string;
  assistantMessageId: string;
  userMessageId: string;
  userPrompt: string;
  estimatedSeconds: number;
  startedAt: number;
}

export function loadPendingVideoJobs(): PendingVideoJob[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingVideoJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePendingVideoJobs(jobs: PendingVideoJob[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs.slice(0, 20)));
  } catch {
    /* ignore */
  }
}

export function addPendingVideoJob(job: PendingVideoJob) {
  const jobs = loadPendingVideoJobs().filter((j) => j.jobId !== job.jobId);
  jobs.unshift(job);
  savePendingVideoJobs(jobs);
}

export function removePendingVideoJob(jobId: string) {
  savePendingVideoJobs(loadPendingVideoJobs().filter((j) => j.jobId !== jobId));
}

export function hasPendingVideoJobs(): boolean {
  return loadPendingVideoJobs().length > 0;
}
