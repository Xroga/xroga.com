const KEY = 'xroga_pending_build_jobs';

export interface PendingBuildJob {
  runId?: string;
  lastSequence?: number;
  assistantMessageId: string;
  userMessageId: string;
  userPrompt: string;
  startedAt: number;
}

export interface RecoverableBuildMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: number;
}

/**
 * Restore the transcript shell for a durable build before replaying its events.
 * A refresh can happen before the debounced workspace-history write. The durable
 * job already contains the original IDs and prompt, so recovery must rebuild
 * those two factual rows instead of showing a detached Stop button.
 */
export function reconcilePendingBuildTranscript(
  messages: RecoverableBuildMessage[],
  job: Pick<
    PendingBuildJob,
    'assistantMessageId' | 'userMessageId' | 'userPrompt' | 'startedAt'
  >,
): RecoverableBuildMessage[] {
  const hasUser = messages.some((message) => message.id === job.userMessageId);
  const assistantIndex = messages.findIndex(
    (message) => message.id === job.assistantMessageId,
  );
  const hasAssistant = assistantIndex >= 0;
  if (hasUser && hasAssistant) return messages;

  const userMessage: RecoverableBuildMessage = {
    id: job.userMessageId,
    role: 'user',
    content: job.userPrompt,
    createdAt: job.startedAt,
  };
  const assistantMessage: RecoverableBuildMessage = {
    id: job.assistantMessageId,
    role: 'assistant',
    content: '',
    createdAt: job.startedAt + 1,
  };

  if (!hasUser && hasAssistant) {
    return [
      ...messages.slice(0, assistantIndex),
      userMessage,
      ...messages.slice(assistantIndex),
    ];
  }
  if (hasUser) return [...messages, assistantMessage];
  return [...messages, userMessage, assistantMessage];
}

export function attachPendingBuildRun(assistantMessageId: string, runId: string) {
  savePendingBuildJobs(
    loadPendingBuildJobs().map((job) =>
      job.assistantMessageId === assistantMessageId ? { ...job, runId, lastSequence: 0 } : job
    )
  );
}

export function updatePendingBuildSequence(assistantMessageId: string, lastSequence: number) {
  savePendingBuildJobs(
    loadPendingBuildJobs().map((job) =>
      job.assistantMessageId === assistantMessageId
        ? { ...job, lastSequence: Math.max(job.lastSequence ?? 0, lastSequence) }
        : job,
    ),
  );
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
