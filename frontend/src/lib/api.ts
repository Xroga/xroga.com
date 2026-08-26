import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createClient } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';
import {
  swarmOutputToText,
  type SwarmCompleteEvent,
  type SwarmProgressEvent,
} from '@/lib/swarm';
import { engineeringArtifactToText, isRenderableArtifact } from '@/lib/engineeringArtifact';
import { isRecoverableBuildOutput } from '@/lib/recoveredBuildOutput';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function resolveApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      const isSupabaseHost = url.hostname.endsWith('.supabase.co');
      const isSafeProtocol =
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
      if (isSafeProtocol && !isSupabaseHost) {
        return url.origin;
      }
      console.error('[config] Ignoring invalid public API origin');
    } catch {
      console.error('[config] Ignoring malformed public API origin');
    }
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:4000';
  }
  return 'https://xroga-api.fly.dev';
}

export function siteUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const host = window.location.hostname;
    if (host === 'xroga.com' || host === 'www.xroga.com') {
      return `https://${host}`;
    }
    if (host === 'localhost' || host === '127.0.0.1') {
      return window.location.origin.replace(/\/$/, '');
    }
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }
  return 'https://xroga.com';
}

export function githubOAuthCallbackUrl(): string {
  return `${siteUrl()}/dashboard/integrations/github/callback`;
}

export function vercelOAuthCallbackUrl(): string {
  return `${siteUrl()}/dashboard/integrations/vercel/callback`;
}

export function supabaseOAuthCallbackUrl(): string {
  return `${siteUrl()}/dashboard/integrations/supabase/callback`;
}

export const API_URL = resolveApiUrl();

export interface ChatAttachment {
  url: string;
  mimeType?: string;
  name?: string;
}

export interface StreamSwarmOptions {
  projectId?: string;
  signal?: AbortSignal;
  compact?: boolean;
  /** Reuse a session token already fetched — skips a second Supabase round-trip */
  accessToken?: string | null;
  attachments?: ChatAttachment[];
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  clientMeta?: {
    assistantMessageId?: string;
    userMessageId?: string;
    userPrompt?: string;
    buildContinuation?: boolean;
    buildOriginalPrompt?: string;
    buildUpdate?: boolean;
    githubTargetRepo?: string;
    githubTargetBranch?: string;
    /**
     * Visibility for a repository this build creates. Only sent when the user chose it.
     *
     * Omitting it means private — the absence of a choice is never read as permission to
     * publish, on either side of the wire.
     */
    githubVisibility?: 'private' | 'public';
    preferredVercelProject?: string;
    preferredVercelTeamId?: string;
    priorSite?: {
      html: string;
      css?: string;
      js?: string;
      projectName?: string;
    };
  };
  onProgress?: (event: SwarmProgressEvent) => void;
  /** Stable persisted run identity, emitted before expensive work begins. */
  onStart?: (runId: string) => void;
  /** The HTTP stream dropped, but the persisted server run is still active. */
  onReconnect?: (runId: string) => void;
  onDelta?: (delta: string) => void;
  /** Early code delivery — show preview before GitHub/Vercel finish. */
  onPreview?: (event: SwarmCompleteEvent & { shipPending?: boolean }) => void;
  onComplete?: (event: SwarmCompleteEvent & { followUps?: string[] }) => void;
}

function deliverSwarmComplete(
  complete: SwarmCompleteEvent & { followUps?: string[] },
  options: StreamSwarmOptions,
  currentText: string,
): string {
  let finalText = currentText;
  const outType =
    complete.output && typeof complete.output === 'object'
      ? (complete.output as { type?: string }).type
      : undefined;
  const text = outType === 'landing_page' ? '' : swarmOutputToText(complete.output);
  if (complete.output && typeof complete.output === 'object') {
    const out = complete.output as { type?: string; imageUrl?: string };
    if (out.type === 'image' && typeof out.imageUrl === 'string' && text) {
      finalText = text;
      options.onDelta?.(text);
    } else if (text && !finalText) {
      finalText = text;
      options.onDelta?.(text);
    }
  } else if (text && !finalText) {
    finalText = text;
    options.onDelta?.(text);
  }
  options.onComplete?.(complete);
  return finalText;
}

async function waitForPersistedSwarmRun(
  runId: string,
  accessToken: string,
  options: StreamSwarmOptions,
  currentText: string,
  afterSequence = 0,
): Promise<string> {
  options.onReconnect?.(runId);
  options.onProgress?.({
    agent: 'runtime',
    status: 'running',
    message: 'Build continues safely in the background. Reconnecting to the persisted run...',
  });

  const deadline = Date.now() + 30 * 60_000;
  let delayMs = 1_000;
  let lastSequence = afterSequence;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    let response: Response;
    try {
      response = await fetch(
        `${API_URL}/api/swarm/runs/${runId}?afterSequence=${Math.max(0, lastSequence)}`,
        {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        signal: options.signal,
        },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      delayMs = Math.min(5_000, Math.round(delayMs * 1.5));
      continue;
    }
    if (!response.ok) {
      if (response.status === 401) throw new ApiError('Your session expired while reconnecting.', 401);
      delayMs = Math.min(5_000, Math.round(delayMs * 1.5));
      continue;
    }
    const run = await response.json() as SwarmRunSummary;
    for (const event of run.events ?? []) {
      if (event.sequence <= lastSequence) continue;
      options.onProgress?.({ ...event.data, sequence: event.sequence } as SwarmProgressEvent);
      lastSequence = event.sequence;
    }
    lastSequence = Math.max(lastSequence, run.lastSequence ?? 0);
    if (run.status === 'running' || run.status === 'unknown') {
      delayMs = Math.min(5_000, Math.round(delayMs * 1.35));
      continue;
    }
    if (run.status === 'cancelled') throw new DOMException('Aborted', 'AbortError');
    if (run.status === 'error') {
      // A run that produced reviewable work is delivered, not thrown.
      //
      // `completeRun(..., { success: false })` can store a full engineering artifact or a real
      // generated product whose validation/publish step was blocked. Throwing here discarded
      // the files, preview and evidence and showed only "The persisted build failed." That is
      // the recovery path, exactly where a dropped SSE stream lands.
      if (isRecoverableBuildOutput(run.output)) {
        return deliverSwarmComplete({
          runId,
          success: false,
          featureCategory: run.featureCategory,
          output: run.output,
          tokenUsage: run.tokenUsage,
        }, options, currentText) || (isRenderableArtifact(run.output)
          ? engineeringArtifactToText(run.output)
          : currentText);
      }
      // No artifact: the run failed before producing one. The persisted row still carries the
      // real reason code instead of the generic BUILD_FAILED every failure used to be
      // flattened to, and losing that distinction here defeats the point of persisting it.
      const output = run.output as { error?: string; code?: string; nextUnlockAt?: string | null } | null;
      throw new ApiError(output?.error ?? 'The persisted build failed.', 500, {
        code: output?.code ?? 'BUILD_FAILED',
        nextUnlockAt: output?.nextUnlockAt,
      });
    }

    return deliverSwarmComplete({
      runId,
      success: true,
      featureCategory: run.featureCategory,
      output: run.output,
      tokenUsage: run.tokenUsage,
      // An engineering artifact always has text; the generic sentence is only ever reached
      // for outputs that genuinely carry nothing to say.
    }, options, currentText) || (isRenderableArtifact(run.output)
      ? engineeringArtifactToText(run.output)
      : 'Swarm task complete.');
  }
  throw new ApiError('The build is still running, but reconnect timed out. You can safely return later.', 504, {
    code: 'RUN_STILL_ACTIVE',
    runId,
  });
}

/** Stream SSE from POST /api/swarm/execute with JWT auth. */
export async function streamSwarmExecute(
  prompt: string,
  options: StreamSwarmOptions = {}
): Promise<string> {
  const token = options.accessToken ?? (await getAccessToken());
  if (!token) {
    throw new Error('Please sign in to chat.');
  }

  // Generated here rather than waited for from the server's first SSE byte.
  // Production evidence: three consecutive builds where the backend produced 25-49
  // real events each while the browser received zero bytes of the stream — a proxy or
  // dropped connection somewhere between here and the browser, invisible from this
  // sandbox and with no guaranteed fix on our side. When the runId only ever arrived
  // over the stream, a stream that delivers nothing left the client with no ID to fall
  // back to polling with — it could only wait forever, which is exactly what the
  // screenshots showed. Knowing the ID upfront means the stall watchdog below always
  // has something to poll for, independent of whether this connection ever delivers a
  // single byte.
  const clientRunId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : undefined;

  const res = await fetch(`${API_URL}/api/swarm/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      prompt,
      stream: true,
      ...(clientRunId ? { runId: clientRunId } : {}),
      ...(options.projectId ? { projectId: options.projectId } : {}),
      ...(options.attachments?.length ? { attachments: options.attachments } : {}),
      ...(options.history?.length ? { history: options.history } : {}),
      ...(options.clientMeta ? { clientMeta: options.clientMeta } : {}),
    }),
    signal: options.signal,
  });

  const contentType = res.headers.get('content-type') ?? '';

  if (!res.ok && !contentType.includes('text/event-stream')) {
    const data = await res.json().catch(() => ({})) as {
      error?: string;
      code?: string;
      paymentLink?: string;
    };
    if (res.status === 401) {
      throw new Error(
        data.error ?? 'Authentication failed — sign out and sign in again to refresh your session.'
      );
    }
    if (res.status === 402 || data.code === 'OUT_OF_ACTIONS') {
      throw new ApiError(
        data.error ?? 'Out of tokens — upgrade your plan to continue.',
        402,
        { code: 'OUT_OF_ACTIONS', paymentLink: data.paymentLink ?? '/pricing' }
      );
    }
    throw new ApiError(data.error ?? `Swarm failed (${res.status})`, res.status, data);
  }

  if (!res.body) {
    throw new Error('No response body from swarm stream');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalText = '';
  // Known immediately when the server accepted a client-supplied ID; otherwise learned
  // from the server's own 'start' event exactly as before, for the fallback case where
  // this browser could not generate one.
  let runId: string | undefined = clientRunId;
  let lastSequence = 0;
  let receivedComplete = false;

  if (runId) options.onStart?.(runId);

  // How long to wait for the *next* byte before treating this connection as stalled.
  // The backend now emits its first event within milliseconds of accepting the request
  // and sends a keepalive at minimum every 15s, so 20s of true silence at the transport
  // level is already abnormal under every legitimate cause — a slow model, a big
  // repository read, a busy Fly machine — because none of those delay the *first*
  // byte, only what it says.
  const STREAM_STALL_MS = 20_000;

  function readWithStallGuard(): Promise<ReadableStreamReadResult<Uint8Array>> {
    let timer: ReturnType<typeof setTimeout>;
    const settle = reader.read().finally(() => clearTimeout(timer));
    const stalled = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('SWARM_STREAM_STALLED')), STREAM_STALL_MS);
    });
    return Promise.race([settle, stalled]);
  }

  try {
    while (true) {
    if (options.signal?.aborted) {
      await reader.cancel().catch(() => {});
      throw new DOMException('Aborted', 'AbortError');
    }

    let readResult: ReadableStreamReadResult<Uint8Array>;
    try {
      readResult = await readWithStallGuard();
    } catch (err) {
      if ((err as Error).message !== 'SWARM_STREAM_STALLED') throw err;
      await reader.cancel().catch(() => {});
      // No bytes arrived in time. The backend may still be working — this is not a
      // verdict that the build failed, only that this connection stopped delivering —
      // so fall back to polling the same run by the ID we already know, exactly the
      // path a genuinely dropped connection already uses below.
      if (runId) return waitForPersistedSwarmRun(runId, token, options, finalText, lastSequence);
      throw new Error('The build service is not responding. Please try again.');
    }
    const { done, value } = readResult;
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const lines = part.split('\n');
      let eventName = 'message';
      let dataLine = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLine += line.slice(5).trim();
        }
      }

      if (!dataLine) continue;

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(dataLine) as Record<string, unknown>;
      } catch {
        // Truncated/oversized SSE chunk — skip; preview/complete may still arrive
        console.warn('[streamSwarmExecute] skipped malformed SSE chunk');
        continue;
      }

      if (eventName === 'error' || payload.error) {
        if (payload.code === 'OUT_OF_ACTIONS') {
          throw new ApiError(
            String(payload.error ?? 'Out of tokens'),
            402,
            payload as Record<string, unknown>
          );
        }
        // Carries `code` and (for CAPACITY_UNAVAILABLE) `nextUnlockAt` through as
        // structured data rather than a plain Error, whose message is all that used to
        // survive — losing exactly the fact the terminal needs to say when to retry.
        throw new ApiError(
          String(payload.error ?? 'Swarm stream error'),
          500,
          payload as Record<string, unknown>
        );
      }

      if (eventName === 'start' || eventName === 'pipeline') {
        if (eventName === 'start' && typeof payload.runId === 'string') {
          // Already fired above with the client-generated ID in the normal case — the
          // server echoes the same value back, so re-firing here would just be a
          // duplicate notification. Only genuinely new when the browser could not
          // generate its own ID and this is the first the client is learning it.
          const alreadyKnown = runId === payload.runId;
          runId = payload.runId;
          if (!alreadyKnown) options.onStart?.(runId);
        }
        options.onProgress?.({
          agent: 'routing',
          status: 'connecting',
          message: String(payload.message ?? 'Ready'),
        } as SwarmProgressEvent);
      }

      if (eventName === 'progress') {
        const progress = payload as SwarmProgressEvent;
        if (typeof progress.sequence === 'number') {
          if (progress.sequence <= lastSequence) continue;
          lastSequence = progress.sequence;
        }
        options.onProgress?.(progress);
      }

      if (eventName === 'delta' && typeof payload.delta === 'string' && payload.delta) {
        finalText += payload.delta;
        options.onDelta?.(payload.delta);
      }

      if (eventName === 'preview') {
        const preview = payload as SwarmCompleteEvent & { shipPending?: boolean };
        options.onPreview?.(preview);
      }

      if (eventName === 'complete') {
        const complete = payload as SwarmCompleteEvent & { followUps?: string[] };
        receivedComplete = true;
        finalText = deliverSwarmComplete(complete, options, finalText);
      }
    }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (runId) return waitForPersistedSwarmRun(runId, token, options, finalText, lastSequence);
    throw error;
  }

  if (!receivedComplete && runId) {
    return waitForPersistedSwarmRun(runId, token, options, finalText, lastSequence);
  }

  return finalText || 'Swarm task complete.';
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt = 0;
let authCacheListenerStarted = false;

function updateAccessTokenCache(session: Session | null): void {
  cachedAccessToken = session?.access_token ?? null;
  cachedAccessTokenExpiresAt = session?.expires_at ? session.expires_at * 1_000 : 0;
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  if (!authCacheListenerStarted) {
    authCacheListenerStarted = true;
    supabase.auth.onAuthStateChange((_event, session) => updateAccessTokenCache(session));
  }
  if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now() + 30_000) {
    return cachedAccessToken;
  }
  const { data: { session } } = await supabase.auth.getSession();
  updateAccessTokenCache(session);
  return cachedAccessToken;
}

/** Read any chat attachment as a data URL (works offline when media upload is retired). */
export async function uploadChatImage(file: File): Promise<string> {
  return uploadChatFile(file);
}

export async function uploadChatFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const comma = dataUrl.indexOf(',');
  const dataBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const contentType = file.type || 'application/octet-stream';

  try {
    const data = await apiFetch<{ url: string }>('/api/media/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: file.name,
        contentType,
        dataBase64,
      }),
    });
    return data.url;
  } catch {
    // Media route may be retired — data URLs work for Grok vision + server extract
    return dataUrl.startsWith('data:')
      ? dataUrl
      : `data:${contentType};base64,${dataBase64}`;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const accessToken = token ?? (await getAccessToken());
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (err) {
    const raw = (err as Error).message || 'Failed to fetch';
    throw new ApiError(
      /abort/i.test(raw)
        ? 'The Xroga API request timed out. Try again.'
        : /failed to fetch|networkerror|load failed/i.test(raw)
          ? 'Cannot reach the Xroga API. Check your connection and try again.'
        : raw,
      0,
      { code: 'NETWORK_ERROR' }
    );
  }
  const data = await res.json().catch(() => ({ error: res.statusText }));

  if (!res.ok) {
    const message = typeof data.error === 'string' ? data.error : 'API request failed';
    if (res.status === 401) {
      cachedAccessToken = null;
      cachedAccessTokenExpiresAt = 0;
      throw new ApiError(
        message.includes('token') || message.includes('authorization')
          ? message
          : 'Authentication failed — sign out and sign in again.',
        res.status,
        data
      );
    }
    if (res.status === 402 || data.code === 'OUT_OF_ACTIONS') {
      throw new ApiError(
        message || 'Out of tokens — upgrade your plan to continue.',
        402,
        { ...data, code: 'OUT_OF_ACTIONS', paymentLink: data.paymentLink ?? '/pricing' }
      );
    }
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

export const api = {
  actions: {
    balance: () =>
      apiFetch<ActionBalance>('/api/actions/balance'),
  },
  projects: {
    list: () => apiFetch<Project[]>('/api/projects'),
    listGithub: () => apiFetch<Project[]>('/api/projects?github=1'),
    get: (id: string) => apiFetch<ProjectDetail>(`/api/projects/${id}`),
    files: (id: string) => apiFetch<ProjectFile[]>(`/api/projects/${id}/files`),
    getCode: (id: string) =>
      apiFetch<{ projectId: string; githubRepoName: string | null; files: ProjectFile[] }>(
        `/api/projects/${id}/code`
      ),
    create: (body: {
      name: string;
      type: string;
      github_repo_url?: string;
      github_repo_name?: string;
      github_branch?: string;
      deploy_url?: string;
      user_prompt?: string;
    }) =>
      apiFetch<Project>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string) =>
      apiFetch<{ success: boolean; id: string }>(`/api/projects/${id}`, { method: 'DELETE' }),
  },
  /** Permanent terminal sessions under a GitHub repo (#1, #2, …) — stored in Supabase */
  terminalSessions: {
    list: (repo?: string, opts?: { limit?: number; offset?: number }) => {
      const params = new URLSearchParams();
      if (repo) params.set('repo', repo);
      if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
      if (opts?.offset !== undefined) params.set('offset', String(opts.offset));
      const qs = params.toString();
      return apiFetch<CloudTerminalSessionPage>(
        qs ? `/api/terminal-sessions?${qs}` : '/api/terminal-sessions'
      );
    },
    get: (id: string) =>
      apiFetch<{ session: CloudTerminalSession }>(`/api/terminal-sessions/${encodeURIComponent(id)}`),
    upsert: (
      id: string,
      body: {
        githubRepoName: string;
        githubBranch?: string;
        title?: string;
        prompt?: string;
        preview?: string;
        messages: unknown[];
        kind?: string;
        status?: string;
      }
    ) =>
      // Returns metadata only — the server no longer echoes the transcript back.
      apiFetch<{ session: CloudTerminalSessionSummary }>(
        `/api/terminal-sessions/${encodeURIComponent(id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ ...body, id }),
        }
      ),
    delete: (id: string) =>
      apiFetch<{ success: boolean; id: string }>(`/api/terminal-sessions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },
  showcase: {
    /**
     * Copies a showcase template into one of the user's repositories on a new
     * feature branch and opens a pull request. Only the template id crosses the
     * wire — the server resolves the source from its own allow-list.
     */
    exportTemplate: (body: {
      templateId: string;
      repoFullName: string;
      branch: string;
      projectName: string;
      userPrompt?: string;
      targetDirectory?: string;
      baseBranch?: string;
    }) =>
      apiFetch<{
        ok: boolean;
        repoFullName: string;
        branch: string;
        baseBranch: string;
        commitSha?: string;
        pullRequestUrl?: string;
        pullRequestNumber?: number;
        filesCreated: number;
        filesSkipped: number;
        plan: Array<{ path: string; status: 'create' | 'skip-conflict'; bytes: number }>;
        warnings: string[];
      }>('/api/showcase/export', { method: 'POST', body: JSON.stringify(body) }),
  },
  profile: {
    get: () => apiFetch<Profile>('/api/profile'),
    update: (body: Partial<Profile>, signal?: AbortSignal, accessToken?: string | null) =>
      // Profile payloads are small and may be triggered by debounced settings.
      // Keep an already-started save alive when the user reloads or navigates.
      apiFetch<Profile>(
        '/api/profile',
        { method: 'PATCH', body: JSON.stringify(body), keepalive: true, signal },
        accessToken,
      ),
    activity: () => apiFetch<ActivityLog[]>('/api/profile/activity'),
    /** Permanently deletes the authenticated Supabase user (cascades to profile/projects). */
    deleteAccount: () =>
      apiFetch<{ deleted: boolean }>('/api/profile', {
        method: 'DELETE',
        body: JSON.stringify({ confirm: 'DELETE' }),
      }),
  },
  github: {
    oauthUrl: () => {
      const redirectUri = githubOAuthCallbackUrl();
      return apiFetch<{ url: string; redirectUri: string }>(
        `/api/github/oauth?redirect_uri=${encodeURIComponent(redirectUri)}`
      );
    },
    connect: (code: string, state: string, repoStrategy?: string, defaultRepo?: string) =>
      apiFetch<{ connected: boolean; username: string }>('/api/github/connect', {
        method: 'POST',
        body: JSON.stringify({
          code,
          state,
          repoStrategy,
          defaultRepo,
          redirectUri: githubOAuthCallbackUrl(),
        }),
      }),
    status: () => apiFetch<GitHubStatus>('/api/github/status'),
    updateSettings: (repoStrategy: string, defaultRepo?: string) =>
      apiFetch('/api/github/settings', {
        method: 'PATCH',
        body: JSON.stringify({ repoStrategy, defaultRepo }),
      }),
    disconnect: () => apiFetch('/api/github/disconnect', { method: 'DELETE' }),
    listRepos: () =>
      apiFetch<{ repos: GitHubRepo[] }>('/api/github/repos'),
    listBranches: (owner: string, repo: string) =>
      apiFetch<{ branches: GitHubBranch[] }>(
        `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`
      ),
    redeployPreview: (payload: {
      repoName?: string;
      html?: string;
      css?: string;
      js?: string;
      platform?: 'vercel' | 'netlify' | 'both';
      projectSlug?: string;
    }) =>
      apiFetch<{
        deployUrl: string;
        deployVerified: boolean;
        deployPlatform: 'vercel' | 'netlify' | 'none';
        vercelDeploymentId?: string;
        netlifyDeployId?: string;
        vercel?: { deployUrl: string; deployVerified: boolean; error?: string };
        netlify?: { deployUrl: string; deployVerified: boolean; error?: string };
      }>('/api/github/redeploy-preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    pushBuild: (payload: {
      html?: string;
      css?: string;
      js?: string;
      repoName: string;
      branch?: string;
      projectSlug?: string;
      projectName?: string;
      userPrompt?: string;
      incremental?: boolean;
      files?: Array<{ path: string; content: string }>;
    }) =>
      apiFetch<{
        githubRepoUrl: string;
        githubRepoName: string;
        commitSha?: string;
        pushed: boolean;
        fileCount?: number;
        generatedFiles?: string[];
        incremental?: boolean;
      }>('/api/github/push-build', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    rollback: (payload: { repoName: string; commitSha: string; branch?: string }) =>
      apiFetch<{
        ok: boolean;
        branch: string;
        commitSha: string;
        htmlUrl: string;
        deployUrl?: string;
        deployVerified?: boolean;
      }>('/api/github/rollback', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getBuildFiles: (repoName: string) =>
      apiFetch<{ html: string; css: string; js: string }>(
        `/api/github/build-files?repoName=${encodeURIComponent(repoName)}`
      ),
    analyzeRepo: (repoName: string, branch?: string, opts?: { lite?: boolean }) =>
      apiFetch<{
        repoName: string;
        defaultBranch: string;
        fileCount: number;
        topLevelEntries: string[];
        hasBuildFiles: boolean;
        languages: Record<string, number>;
        buildFiles: { html: string; css: string; js: string };
        treeSample: Array<{ path: string; size?: number }>;
        summary: string;
        techStack: string[];
        filesAnalyzed: number;
        totalLinesEstimate: number;
        report: string;
      }>(
        `/api/github/analyze?repoName=${encodeURIComponent(repoName)}${
          branch ? `&branch=${encodeURIComponent(branch)}` : ''
        }${opts?.lite === false ? '' : '&lite=1'}`
      ),
  },
  vercel: {
    oauthUrl: () => {
      const redirectUri = vercelOAuthCallbackUrl();
      return apiFetch<{ url: string | null; redirectUri: string; oauthConfigured: boolean }>(
        `/api/vercel/oauth?redirect_uri=${encodeURIComponent(redirectUri)}`
      );
    },
    connect: (code: string, state: string) =>
      apiFetch<{
        connected: boolean;
        username: string;
        canDeploy: boolean;
        managedDeployAvailable?: boolean;
      }>('/api/vercel/connect', {
        method: 'POST',
        body: JSON.stringify({ code, state, redirectUri: vercelOAuthCallbackUrl() }),
      }),
    status: () =>
      apiFetch<{
        connected: boolean;
        username?: string;
        oauthConfigured?: boolean;
        tokenValid?: boolean | null;
        canDeploy?: boolean | null;
        managedDeployAvailable?: boolean;
        warning?: string;
        error?: string;
      }>('/api/vercel/status'),
    disconnect: () => apiFetch('/api/vercel/disconnect', { method: 'DELETE' }),
    projects: () =>
      apiFetch<{
        projects: Array<{
          id: string;
          name: string;
          framework?: string;
          teamId?: string;
          teamName?: string;
        }>;
        error?: string;
      }>('/api/vercel/projects'),
    deploy: (payload: {
      html: string;
      css?: string;
      js?: string;
      projectSlug?: string;
      projectName?: string;
      teamId?: string;
    }) =>
      apiFetch<{ deployUrl: string; deploymentId?: string; deployVerified?: boolean; error?: string }>(
        '/api/vercel/deploy',
        { method: 'POST', body: JSON.stringify(payload) }
      ),
    listDomains: (project: string) =>
      apiFetch<{ ok: boolean; project: string; domains: unknown[]; error?: string }>(
        `/api/vercel/domains?project=${encodeURIComponent(project)}`,
      ),
    addDomain: (project: string, domain: string) =>
      apiFetch<{
        ok: boolean;
        domain?: { name: string; verified: boolean; verification?: unknown[] };
        message?: string;
        error?: string;
      }>('/api/vercel/domains', {
        method: 'POST',
        body: JSON.stringify({ project, domain }),
      }),
    verifyDomain: (project: string, domain: string) =>
      apiFetch<{
        ok: boolean;
        verified: boolean;
        domain?: { name: string; verified: boolean; verification?: unknown[] };
        message?: string;
        error?: string;
      }>('/api/vercel/domains/verify', {
        method: 'POST',
        body: JSON.stringify({ project, domain }),
      }),
    removeDomain: (project: string, domain: string) =>
      apiFetch<{ ok: boolean; error?: string }>('/api/vercel/domains', {
        method: 'DELETE',
        body: JSON.stringify({ project, domain }),
      }),
  },
  supabase: {
    oauthUrl: () => {
      const redirectUri = supabaseOAuthCallbackUrl();
      return apiFetch<{
        url: string | null;
        redirectUri: string;
        oauthConfigured: boolean;
        message?: string;
      }>(`/api/supabase/oauth?redirect_uri=${encodeURIComponent(redirectUri)}`);
    },
    connect: (code: string, state: string) =>
      apiFetch<{
        ok: boolean;
        oauthConnected?: boolean;
        projects?: Array<{ id: string; ref: string; name: string; region?: string }>;
        autoSelected?: string | null;
        needsProjectPick?: boolean;
        provision?: { ok?: boolean; schemaApplied?: boolean; message?: string };
        status?: { ready?: boolean; provisioned?: boolean; message?: string };
        message?: string;
        error?: string;
      }>('/api/supabase/connect', {
        method: 'POST',
        body: JSON.stringify({ code, state, redirectUri: supabaseOAuthCallbackUrl() }),
      }),
    status: () =>
      apiFetch<{
        connected: boolean;
        ready: boolean;
        provisioned?: boolean;
        oauthConnected?: boolean;
        oauthConfigured?: boolean;
        message: string;
      }>('/api/supabase/status'),
    projects: () =>
      apiFetch<{
        projects: Array<{ id: string; ref: string; name: string; region?: string }>;
      }>('/api/supabase/projects'),
    selectProject: (body: {
      projectRef: string;
      projectName?: string;
      vercelProject?: string;
    }) =>
      apiFetch<{
        ok: boolean;
        provision?: { ok?: boolean; schemaApplied?: boolean; message?: string };
        status?: { ready?: boolean; provisioned?: boolean; message?: string };
        message?: string;
        error?: string;
      }>('/api/supabase/select-project', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    organizations: () =>
      apiFetch<{
        organizations: Array<{ id: string; name: string; slug?: string }>;
      }>('/api/supabase/organizations'),
    createProject: (body: {
      name: string;
      organizationId: string;
      region?: string;
      vercelProject?: string;
    }) =>
      apiFetch<{
        ok: boolean;
        projectRef?: string;
        provision?: { message?: string };
        message?: string;
        error?: string;
      }>('/api/supabase/create-project', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    disconnect: () => apiFetch('/api/supabase/disconnect', { method: 'DELETE' }),
  },
  integrations: {
    aiCatalog: () =>
      apiFetch<{
        catalog: Array<{
          id: string;
          name: string;
          category: string;
          freeTier: boolean;
          requiresApiKey: boolean;
          endpoint: string;
          signupUrl?: string;
          topUpUrl?: string;
          userGuidance: string;
          xrogaProvided?: boolean;
        }>;
        xrogaResearch: Record<string, unknown>;
      }>('/api/integrations/ai-catalog'),
    providerKeys: () =>
      apiFetch<{
        keys: Array<{ provider: string; connected: boolean; masked?: string; envVar?: string }>;
      }>('/api/integrations/provider-keys'),
    saveProviderKey: (
      provider: string,
      apiKey: string,
      opts?: { envVarName?: string; vercelProject?: string },
    ) =>
      apiFetch<{
        ok: boolean;
        provider: string;
        masked?: string;
        envVar?: string;
        envSync?: unknown;
      }>('/api/integrations/provider-keys', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          apiKey,
          envVarName: opts?.envVarName,
          vercelProject: opts?.vercelProject,
        }),
      }),
    deleteProviderKey: (provider: string) =>
      apiFetch(`/api/integrations/provider-keys/${encodeURIComponent(provider)}`, { method: 'DELETE' }),
    syncVercelEnv: (projectSlug: string) =>
      apiFetch<{ ok: boolean; result?: unknown }>('/api/integrations/sync-vercel-env', {
        method: 'POST',
        body: JSON.stringify({ projectSlug }),
      }),
    supabaseStatus: () =>
      apiFetch<{
        connected: boolean;
        ready: boolean;
        provisioned?: boolean;
        hasUrl: boolean;
        hasAnonKey: boolean;
        hasServiceRole: boolean;
        hasAccessToken?: boolean;
        hasDbPassword?: boolean;
        urlMasked?: string;
        message: string;
      }>('/api/integrations/supabase/status'),
    listSupabaseProjects: (accessToken: string) =>
      apiFetch<{
        projects: Array<{ id: string; ref: string; name: string; region?: string }>;
        error?: string;
      }>('/api/integrations/supabase/list-projects', {
        method: 'POST',
        body: JSON.stringify({ accessToken }),
      }),
    oneClickSupabase: (body: {
      accessToken: string;
      projectRef: string;
      projectName?: string;
      vercelProject?: string;
    }) =>
      apiFetch<{
        ok: boolean;
        status?: {
          connected: boolean;
          ready: boolean;
          provisioned?: boolean;
          message: string;
        };
        provision?: {
          ok: boolean;
          schemaApplied?: boolean;
          memoryTablesReady?: boolean;
          buckets?: string[];
          message?: string;
        };
        message?: string;
        error?: string;
        envSync?: unknown;
      }>('/api/integrations/supabase/one-click', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    connectSupabase: (body: {
      projectUrl: string;
      anonKey: string;
      serviceRoleKey?: string;
      accessToken?: string;
      dbPassword?: string;
      projectName?: string;
      vercelProject?: string;
    }) =>
      apiFetch<{
        ok: boolean;
        status?: {
          connected: boolean;
          ready: boolean;
          provisioned?: boolean;
          hasUrl: boolean;
          hasAnonKey: boolean;
          hasServiceRole: boolean;
          message: string;
        };
        provision?: {
          ok: boolean;
          schemaApplied?: boolean;
          message?: string;
        };
        message?: string;
        error?: string;
        envSync?: unknown;
      }>('/api/integrations/supabase/connect', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    provisionSupabase: (projectName?: string) =>
      apiFetch<{ ok: boolean; provision?: unknown; message?: string; error?: string }>(
        '/api/integrations/supabase/provision',
        {
          method: 'POST',
          body: JSON.stringify({ projectName }),
        },
      ),
  },
  publish: {
    status: () =>
      apiFetch<{
        ok: boolean;
        web: {
          ready: boolean;
          githubConnected: boolean;
          vercelConnected: boolean;
          checklist: Array<{
            id: string;
            label: string;
            done: boolean;
            required: boolean;
            hint?: string;
            href?: string;
          }>;
        };
        chrome?: {
          ready: boolean;
          cwsConnected?: boolean;
          checklist: Array<{
            id: string;
            label: string;
            done: boolean;
            required: boolean;
            hint?: string;
            href?: string;
          }>;
          installSteps: string[];
        };
        desktop?: {
          ready: boolean;
          cscSaved?: boolean;
          notarizationSaved?: boolean;
          checklist: Array<{
            id: string;
            label: string;
            done: boolean;
            required: boolean;
            hint?: string;
            href?: string;
          }>;
          runSteps: string[];
        };
        mobile: {
          ready: boolean;
          expoTokenSaved: boolean;
          expoTokenValid: boolean | null;
          appleSaved: boolean;
          appleAscApiSaved?: boolean;
          googlePlaySaved: boolean;
          easProjectLinked?: boolean;
          checklist: Array<{
            id: string;
            label: string;
            done: boolean;
            required: boolean;
            hint?: string;
            href?: string;
          }>;
          commands: string[];
        };
        costs: { xrogaPays: string[]; userPays: string[] };
        easProjectId?: string | null;
        message?: string;
      }>('/api/publish/status'),
    saveExpoToken: (token: string) =>
      apiFetch<{
        ok: boolean;
        verified?: boolean;
        username?: string;
        masked?: string;
        envVar?: string;
        message?: string;
        easProjectId?: string | null;
        easLinked?: boolean;
        easCreated?: boolean;
        needsProjectPick?: boolean;
      }>('/api/publish/expo-token', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    verifyExpo: () =>
      apiFetch<{ ok: boolean; verified?: boolean; username?: string }>('/api/publish/verify-expo', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    saveEasProject: (projectId: string) =>
      apiFetch<{ ok: boolean; message?: string }>('/api/publish/eas-project', {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      }),
    listExpoApps: () =>
      apiFetch<{
        ok: boolean;
        apps: Array<{ id: string; name: string; slug?: string }>;
      }>('/api/publish/expo-apps'),
    easPublish: (body: {
      platform: 'android' | 'ios';
      projectId?: string;
      gitRef?: string;
      submit?: boolean;
    }) =>
      apiFetch<{
        ok: boolean;
        url?: string;
        workflowRunId?: string;
        message?: string;
        error?: string;
        fileName?: string;
      }>('/api/publish/eas-publish', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    saveCwsCredentials: (body: {
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      extensionId: string;
      publisherId: string;
      skipValidate?: boolean;
    }) =>
      apiFetch<{ ok: boolean; message?: string; validated?: boolean }>('/api/publish/cws-credentials', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    startCwsOAuth: (body: {
      clientId: string;
      clientSecret: string;
      extensionId: string;
      publisherId: string;
      redirectUri?: string;
    }) =>
      apiFetch<{
        ok: boolean;
        url?: string;
        redirectUri?: string;
        hint?: string;
        error?: string;
      }>('/api/publish/cws-oauth/start', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    completeCwsOAuth: (body: { code: string; state: string; redirectUri?: string }) =>
      apiFetch<{ ok: boolean; message?: string; error?: string }>('/api/publish/cws-oauth/callback', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    cwsStatus: () =>
      apiFetch<{
        ok: boolean;
        status?: string;
        dashboardUrl?: string;
        message?: string;
      }>('/api/publish/cws-status'),
    syncPlayCredentials: () =>
      apiFetch<{ ok: boolean; message?: string }>('/api/publish/sync-play-credentials', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    syncAppleCredentials: (body?: { bundleIdentifier?: string }) =>
      apiFetch<{ ok: boolean; message?: string }>('/api/publish/sync-apple-credentials', {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }),
    syncElectronSecrets: (repoFullName: string) =>
      apiFetch<{ ok: boolean; message?: string; synced?: string[] }>(
        '/api/publish/sync-electron-secrets',
        {
          method: 'POST',
          body: JSON.stringify({ repoFullName }),
        },
      ),
    easBuilds: () =>
      apiFetch<{
        ok: boolean;
        builds: Array<{
          id: string;
          status: string;
          platform?: string;
          artifactUrl?: string;
          buildDetailsPageUrl?: string;
        }>;
      }>('/api/publish/eas-builds'),
  },
  notifications: {
    list: () => apiFetch<Notification[]>('/api/notifications'),
    unreadCount: () => apiFetch<{ count: number }>('/api/notifications/unread-count'),
    markRead: (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => apiFetch('/api/notifications/read-all', { method: 'PATCH' }),
    delete: (id: string) => apiFetch(`/api/notifications/${id}`, { method: 'DELETE' }),
  },
  swarm: {
    execute: (prompt: string, projectId?: string) =>
      apiFetch('/api/swarm/execute', {
        method: 'POST',
        body: JSON.stringify({ prompt, projectId }),
      }),
    stream: streamSwarmExecute,
    history: () => apiFetch<SwarmRunSummary[]>('/api/swarm/history'),
    getRun: (runId: string, afterSequence = 0) =>
      apiFetch<SwarmRunSummary>(
        `/api/swarm/runs/${runId}?afterSequence=${Math.max(0, Math.floor(afterSequence))}`,
      ),
    cancelRun: (runId: string) =>
      apiFetch<{ cancelled: boolean; status: string }>(`/api/swarm/runs/${runId}/cancel`, {
        method: 'POST',
      }),
    saveConversation: (runId: string, messages: unknown[]) =>
      apiFetch<{ saved: boolean }>(`/api/swarm/runs/${runId}/conversation`, {
        method: 'PATCH',
        body: JSON.stringify({ messages }),
      }),
  },
  billing: {
    plans: () => apiFetch<{ plans: unknown[] }>('/api/billing/plans'),
    status: () => apiFetch<{
      lemonApi: boolean;
      lemonWebhook: boolean;
      lemonStore: boolean;
      environment: 'test' | 'live' | 'unconfigured';
      testMode: boolean;
      trialDays: number | null;
      plans: Array<{ tier: string; name: string; ready: boolean }>;
    }>('/api/billing/status'),
    entitlement: () => apiFetch<{
      state: 'promotional_eligible' | 'promotional_active' | 'promotional_expired' | 'paid_active' | 'past_due' | 'paused' | 'cancelled' | 'billing_unavailable';
      pacing: 'balanced_month' | 'full_access' | null;
      startsAt: string | null;
      endsAt: string | null;
      nextUnlockAt: string | null;
      capacityRemainingPercent: number | null;
      availableNowPercent: number | null;
      promotionActivationDeadline: string;
      requiresCard: boolean;
      autoChargesAtPromotionEnd: boolean;
    }>('/api/billing/entitlement'),
    activatePromotion: () => apiFetch<{
      state: string;
      startsAt: string;
      endsAt: string;
      pacing: 'balanced_month' | 'full_access';
    }>('/api/billing/promotion/activate', { method: 'POST' }),
    setPacing: (pacing: 'balanced_month' | 'full_access', confirmed: boolean) =>
      apiFetch('/api/billing/pacing', {
        method: 'POST',
        body: JSON.stringify({ pacing, confirmed }),
      }),
    createCheckout: (planTier: string) =>
      apiFetch<{
        checkoutUrl?: string;
        priceId: string;
        customData: Record<string, string>;
      }>('/api/billing/create-checkout', {
        method: 'POST',
        body: JSON.stringify({ planTier }),
      }),
    portal: () =>
      apiFetch<{ portalUrl: string }>('/api/billing/portal', { method: 'POST' }),
  },
  dashboard: {
    summary: () => apiFetch<DashboardSummary>('/api/dashboard/summary'),
    platformReady: () =>
      apiFetch<{
        ready: boolean;
        requiredOk: number;
        requiredTotal: number;
        checks: Array<{
          id: string;
          label: string;
          ok: boolean;
          required: boolean;
          hint?: string;
        }>;
      }>('/api/dashboard/platform-ready'),
    shipAnalytics: () =>
      apiFetch<{
        totals: {
          runs: number;
          shipped: number;
          handoff: number;
          blocked: number;
          failed: number;
        };
        byKind: Record<string, number>;
        recent: Array<{
          id: string;
          prompt: string;
          status: string;
          ship: string;
          scaffoldKind?: string;
          created_at: string;
        }>;
      }>('/api/dashboard/ship-analytics'),
  },
  phase1: {
    chat: (
      message: string,
      history?: Array<{ role: 'user' | 'assistant'; content: string }>,
      attachments?: ChatAttachment[],
    ) =>
      apiFetch<Phase1ChatResult>('/api/phase1/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          history,
          ...(attachments?.length ? { attachments } : {}),
        }),
      }),
    usage: () => apiFetch<{ usage: TokenUsage }>('/api/phase1/usage'),
    economics: () =>
      apiFetch<{
        currency: string;
        freeUserMonthlyTokens: number;
        freeUserWorstCaseApiUsd: number;
        perBuild: Array<{
          tier: string;
          label: string;
          totalTokens: number;
          totalUsd: number;
          buildsPerFreeMonth: number;
          howAi: string;
        }>;
        planProfitIfFullTokenBurn: Array<{
          tier: string;
          priceUsd: number;
          tokens: number;
          apiCostIfFullBurnUsd: number;
          grossProfitUsd: number;
          marginPct: number;
        }>;
      }>('/api/phase1/economics'),
  },
  tasks: {
    list: () => apiFetch<{ tasks: TaskItem[] }>('/api/tasks'),
    checkIn: () =>
      apiFetch<{ success: boolean; message: string }>('/api/tasks/check-in', { method: 'POST' }),
    submit: (taskId: string, body: { link?: string; screenshotSize?: number }) =>
      apiFetch<{ success: boolean; message: string }>(`/api/tasks/${taskId}/submit`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  referrals: {
    summary: () => apiFetch<ReferralSummary>('/api/referrals/summary'),
    apply: (code: string) =>
      apiFetch<{ success: boolean; message: string }>('/api/referrals/apply', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
  },
  community: {
    pool: () => apiFetch<CommunityPoolStatus>('/api/community/pool'),
    requestPool: () =>
      apiFetch<{ success: boolean; message: string; newBalance?: number }>('/api/community/pool/request', {
        method: 'POST',
      }),
  },
  tokenDistribution: {
    preview: () => apiFetch<TokenDistributionPreview>('/api/token-distribution/preview'),
    confirm: (body: { rollover: boolean; shareTarget?: 'community' | 'friends' | 'team' }) =>
      apiFetch<{ success: boolean; message: string }>('/api/token-distribution/confirm', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  marketplace: {
    categories: () => apiFetch<{ categories: string[] }>('/api/marketplace/categories'),
    listings: (opts?: { category?: string; mine?: boolean }) => {
      const params = new URLSearchParams();
      if (opts?.category) params.set('category', opts.category);
      if (opts?.mine) params.set('mine', '1');
      const q = params.toString();
      return apiFetch<{ listings: MarketplaceListing[] }>(`/api/marketplace/listings${q ? `?${q}` : ''}`);
    },
    stats: () => apiFetch<MarketplaceStats>('/api/marketplace/stats'),
    create: (body: CreateListingBody) =>
      apiFetch<{ success: boolean; message: string; listing?: MarketplaceListing }>('/api/marketplace/listings', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    purchase: (listingId: string) =>
      apiFetch<{ success: boolean; message: string }>(`/api/marketplace/listings/${listingId}/purchase`, {
        method: 'POST',
      }),
  },
  influencer: {
    dashboard: () => apiFetch<InfluencerDashboard>('/api/influencer/dashboard'),
    apply: (body: InfluencerApplyBody) =>
      apiFetch<{ success: boolean; message: string }>('/api/influencer/apply', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  analytics: {
    dashboard: () => apiFetch<AnalyticsDashboard>('/api/analytics/dashboard'),
  },
  chat: {
    send: (message: string, _userId?: string, onDelta?: (delta: string) => void) =>
      streamSwarmExecute(message, { onDelta }),
  },
};

export interface Profile {
  id?: string;
  role?: 'member' | 'moderator' | 'admin' | 'owner' | 'user';
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  language: string;
  companion_preferences?: import('@/lib/companion').CompanionPreferences | null;
}

export interface Project {
  id: string;
  name: string;
  type: string;
  status: string;
  actions_used: number;
  github_repo_url: string | null;
  github_repo_name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Metadata for a stored terminal session.
 *
 * Deliberately has no `prompt` and no `messages`: list responses return many of
 * these, and carrying a 20 KB prompt plus a full transcript per row made routine
 * sidebar refreshes cost megabytes. Use `terminalSessions.get(id)` for a session
 * the user actually opens.
 */
export interface CloudTerminalSessionSummary {
  id: string;
  githubRepoName: string;
  githubBranch: string;
  terminalNumber: number;
  title: string;
  preview: string;
  kind: string;
  status: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One fully-loaded session, returned only by `get`. */
export interface CloudTerminalSession extends CloudTerminalSessionSummary {
  prompt: string;
  messages: unknown[];
}

export interface CloudTerminalSessionPage {
  sessions: CloudTerminalSessionSummary[];
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
}

export interface ProjectFile {
  id: string;
  file_name: string;
  file_path: string | null;
  file_type: string;
  file_url: string | null;
  content: string | null;
  version: number;
  created_at: string;
}

export interface ProjectMessage {
  id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ProjectDetail extends Project {
  project_files: ProjectFile[];
  project_messages: ProjectMessage[];
}

export interface ActivityLog {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  projects?: { name: string } | null;
}

export interface GitHubStatus {
  connected: boolean;
  username?: string;
  repoStrategy?: string;
  defaultRepo?: string | null;
}

export interface GitHubRepo {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  updatedAt: string;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface ActionBalance {
  total: number;
  used: number;
  remaining: number;
  planTier: string;
  resetDate: string;
  concurrencyLimit?: number;
}

export interface SwarmRunSummary {
  id: string;
  prompt: string;
  status: string;
  output: unknown;
  featureCategory?: string;
  tokenUsage?: SwarmCompleteEvent['tokenUsage'];
  created_at: string;
  completed_at: string | null;
  iteration_count: number;
  events?: Array<{
    sequence: number;
    type: 'progress';
    data: Record<string, unknown>;
    createdAt: string;
  }>;
  lastSequence?: number;
}

export interface DashboardSummary {
  now: string;
  /** Transitional field accepted during rolling deploys; current API does not expose internal pools. */
  tokens?: {
    totalLimit: number;
    totalUsed: number;
    totalRemaining: number;
    percentUsed: number;
    inputUsed: number;
    inputLimit: number;
    inputRemaining: number;
    outputUsed: number;
    outputLimit: number;
    outputRemaining: number;
    emergencyAvailable: boolean;
    emergencyClaimed: boolean;
    daysRemaining: number;
    estimatedDailyUsage: number;
    quotaPeriodStart: string;
    planBudgetUsd?: number;
    rolloverUsd?: number;
    spentUsd?: number;
    creditRemainingUsd?: number;
    percentCreditUsed?: number;
    byModel?: Array<{
      role: string;
      label: string;
      tagline?: string;
      inputUsed: number;
      outputUsed: number;
      inputLimit: number;
      outputLimit: number;
      totalUsed: number;
      totalLimit: number;
      percentUsed: number;
      budgetUsd?: number;
      spentUsd?: number;
      creditRemainingUsd?: number;
    }>;
  } | null;
  billing: {
    planTier: string;
    planName: string;
    planPrice: string;
    nextBilling: string | null;
  };
  entitlement: {
    state: 'promotional_eligible' | 'promotional_active' | 'promotional_expired' | 'paid_active' | 'past_due' | 'paused' | 'cancelled' | 'billing_unavailable';
    pacing: 'balanced_month' | 'full_access' | null;
    startsAt: string | null;
    endsAt: string | null;
    nextUnlockAt: string | null;
    capacityRemainingPercent: number | null;
    availableNowPercent: number | null;
    promotionActivationDeadline: string;
    requiresCard: boolean;
    autoChargesAtPromotionEnd: boolean;
  };
  recentActivity: Array<{
    action: string;
    created_at: string;
    projectName?: string;
  }>;
}

export interface TokenUsage {
  inputTokensUsed: number;
  outputTokensUsed: number;
  totalTokensUsed: number;
  inputTokensRemaining: number;
  outputTokensRemaining: number;
  totalTokensRemaining: number;
  percentUsed: number;
  quotaPeriodStart: string;
  emergencyTokensAvailable: boolean;
  emergencyTokensClaimedThisMonth: boolean;
  totalLimit?: number;
  planBudgetUsd?: number;
  rolloverUsd?: number;
  spentUsd?: number;
  creditRemainingUsd?: number;
  percentCreditUsed?: number;
  planTier?: string;
}

import type { HackathonBriefCardData } from '@/lib/hackathonBrief';

export interface Phase1ChatResult {
  response: string;
  intent: string;
  usage: TokenUsage;
  webSources?: Array<{
    title: string;
    url: string;
    snippet: string;
    source: string;
    thumbnailUrl?: string;
  }>;
  hackathonBrief?: HackathonBriefCardData;
}

export interface TaskItem {
  id: string;
  cadence: 'daily' | 'weekly' | 'monthly' | 'once' | 'special';
  title: string;
  description: string;
  platform?: string;
  frequency?: string;
  xrgReward: number;
  tokenBoost: number;
  verification: 'screenshot' | 'screenshot_link' | 'automatic';
  requirements?: string[];
  examplePost?: string;
  completed: boolean;
  completedAt: string | null;
  pendingReview: boolean;
}

export interface ReferralProfile {
  code: string;
  referralCount: number;
  discountPercent: number;
  lifetimeDiscountPercent: number;
  referredByCode: string | null;
  shareUrl: string;
}

export interface ReferralListItem {
  id: string;
  referredLabel: string;
  createdAt: string;
  instantRewarded: boolean;
  retentionReleased: boolean;
}

export interface ReferralSummary {
  profile: ReferralProfile;
  referrals: ReferralListItem[];
  totalAiTokensEarned: number;
  totalXrgEarned: number;
  nextDiscountPercent: number;
}

export interface CommunityPoolStatus {
  poolBalance: number;
  accountAgeDays: number;
  remainingTokens: number;
  requestsThisMonth: number;
  maxRequestsPerMonth: number;
  maxPerMonth: number;
  requestAmount: number;
  eligible: boolean;
  eligibilityReasons: string[];
  nextAvailableAt: string | null;
  history: Array<{
    id: string;
    amount: number;
    status: string;
    reason: string | null;
    createdAt: string;
  }>;
}

export interface TokenDistributionPreview {
  unusedTokens: number;
  manualTotal: number;
  autoTotal: number;
  rolloverAmount: number;
  shareAmount: number;
  autoPlatform: number;
  autoCommunity: number;
  autoHeavyUsers: number;
  autoBuilders: number;
  alreadyDistributed: boolean;
}

export interface MarketplaceListing {
  id: string;
  sellerId: string;
  sellerName: string;
  title: string;
  description: string;
  category: string;
  priceXrg: number;
  previewUrl: string | null;
  tags: string[];
  status: string;
  salesCount: number;
  createdAt: string;
  owned?: boolean;
  purchased?: boolean;
}

export interface MarketplaceStats {
  totalListings: number;
  myListings: number;
  mySales: number;
  myPurchases: number;
}

export interface CreateListingBody {
  title: string;
  description: string;
  category: string;
  priceXrg: number;
  previewUrl?: string;
  tags?: string[];
}

export interface InfluencerApplyBody {
  followerCount: number;
  usernameSlug?: string;
  applicationNote?: string;
  socialLinks?: Record<string, string>;
}

export interface InfluencerDashboard {
  status: 'none' | 'pending' | 'approved' | 'rejected';
  tier: string | null;
  commissionPercent: number;
  followerCount: number;
  nextTier: string | null;
  nextTierFollowers: number | null;
  usernameSlug: string | null;
  shareUrl: string | null;
  stats: {
    totalReferrals: number;
    activeReferrals: number;
    pendingReferrals: number;
    monthlyCommissionUsd: number;
    totalCommissionUsd: number;
    aiTokensEarned: number;
    xrgTokensEarned: number;
  };
  perks: string[];
  tiers: Array<{
    tier: string;
    minFollowers: number;
    maxFollowers: number | null;
    commissionPercent: number;
    aiTokensOneTime: number;
    xrgTokensOneTime: number;
    perks: string[];
  }>;
}

export interface AnalyticsDashboard {
  generatedAt: string;
  user: {
    tokensUsed: number;
    tokensRemaining: number;
    percentUsed: number;
    xrgBalance: number;
    referralCount: number;
    projectsCount: number;
    daysActiveThisMonth: number;
  };
  platform: {
    dau: number;
    mau: number;
    dauMauRatio: number;
    totalUsers: number;
    mrrUsd: number;
    arrUsd: number;
    communityPoolTokens: number;
    marketplaceListings: number;
    totalAiTokensConsumed: number;
    avgTokensPerUser: number;
  };
  targets: {
    dauMauTarget: number;
    churnTarget: number;
    mrrGrowthTarget: number;
    tokenUsageTarget: number;
    referralRateTarget: number;
    npsTarget: number;
  };
  revenue: {
    planTier: string;
    planPriceUsd: number;
    monthlyValueUsd: number;
    estimatedArrUsd: number;
  };
  community: {
    poolBalance: number;
    myReferrals: number;
    marketplaceSales: number;
    marketplacePurchases: number;
  };
}
