import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createClient } from '@/lib/supabase/client';
import {
  swarmOutputToText,
  type SwarmCompleteEvent,
  type SwarmProgressEvent,
} from '@/lib/swarm';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function resolveApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
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
    priorSite?: {
      html: string;
      css?: string;
      js?: string;
      projectName?: string;
    };
  };
  onProgress?: (event: SwarmProgressEvent) => void;
  onDelta?: (delta: string) => void;
  onComplete?: (event: SwarmCompleteEvent & { followUps?: string[] }) => void;
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

  while (true) {
    if (options.signal?.aborted) {
      await reader.cancel().catch(() => {});
      throw new DOMException('Aborted', 'AbortError');
    }

    const { done, value } = await reader.read();
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

      const payload = JSON.parse(dataLine) as Record<string, unknown>;

      if (eventName === 'error' || payload.error) {
        if (payload.code === 'OUT_OF_ACTIONS') {
          throw new ApiError(
            String(payload.error ?? 'Out of tokens'),
            402,
            payload as Record<string, unknown>
          );
        }
        throw new Error(String(payload.error ?? 'Swarm stream error'));
      }

      if (eventName === 'start' || eventName === 'pipeline') {
        options.onProgress?.({
          agent: 'routing',
          status: 'connecting',
          message: String(payload.message ?? 'Ready'),
        } as SwarmProgressEvent);
      }

      if (eventName === 'progress') {
        options.onProgress?.(payload as SwarmProgressEvent);
      }

      if (eventName === 'delta' && typeof payload.delta === 'string' && payload.delta) {
        finalText += payload.delta;
        options.onDelta?.(payload.delta);
      }

      if (eventName === 'complete') {
        const complete = payload as SwarmCompleteEvent & { followUps?: string[] };
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
      }
    }
  }

  return finalText || 'Swarm task complete.';
}

export interface StreamChatOptions {
  projectId?: string;
  onDelta: (delta: string) => void;
}

/** Parse SSE lines from a streaming /chat response and invoke onDelta for each chunk. */
export async function streamChatMessage(
  message: string,
  userId: string,
  options: StreamChatOptions
): Promise<void> {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message,
      userId,
      ...(options.projectId ? { projectId: options.projectId } : {}),
    }),
  });

  if (res.status === 404) {
    throw new Error(
      'Chat API not deployed on Fly.io yet. Run: fly deploy . --config fly.api.toml -a xroga-api'
    );
  }

  const contentType = res.headers.get('content-type') ?? '';

  if (!res.ok && !contentType.includes('text/event-stream')) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    const hint =
      data.error?.includes('messages') || data.error?.includes('schema cache')
        ? ' Run migration 004_messages.sql in Supabase SQL Editor.'
        : '';
    throw new Error((data.error ?? `Chat failed (${res.status})`) + hint);
  }

  if (!res.body) {
    throw new Error('No response body from chat stream');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
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

      const payload = JSON.parse(dataLine) as { delta?: string; error?: string; complete?: boolean };

      if (eventName === 'error' || payload.error) {
        throw new Error(payload.error ?? 'Stream error');
      }

      if (payload.delta) {
        options.onDelta(payload.delta);
      }
    }
  }
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

export async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function uploadChatImage(file: File): Promise<string> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  try {
    const data = await apiFetch<{ url: string }>('/api/media/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || 'image/png',
        dataBase64,
      }),
    });
    return data.url;
  } catch {
    return `data:${file.type || 'image/png'};base64,${dataBase64}`;
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
      /failed to fetch|networkerror|load failed/i.test(raw)
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

export async function estimatePrompt(prompt: string): Promise<{
  estimatedActions: number;
  estimatedTime: string;
  featureName?: string;
}> {
  if (!prompt.trim()) return { estimatedActions: 1, estimatedTime: '5s' };
  try {
    return await apiFetch('/api/v1/estimate', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
  } catch {
    return { estimatedActions: 1, estimatedTime: '5s' };
  }
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
    list: (repo?: string) =>
      apiFetch<{ sessions: CloudTerminalSessionSummary[] }>(
        repo
          ? `/api/terminal-sessions?repo=${encodeURIComponent(repo)}`
          : '/api/terminal-sessions'
      ),
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
      apiFetch<{ session: CloudTerminalSession }>(`/api/terminal-sessions/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ ...body, id }),
      }),
    delete: (id: string) =>
      apiFetch<{ success: boolean; id: string }>(`/api/terminal-sessions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },
  profile: {
    get: () => apiFetch<Profile>('/api/profile'),
    update: (body: Partial<Profile>) =>
      apiFetch<Profile>('/api/profile', { method: 'PATCH', body: JSON.stringify(body) }),
    activity: () => apiFetch<ActivityLog[]>('/api/profile/activity'),
  },
  github: {
    oauthUrl: () => {
      const redirectUri = githubOAuthCallbackUrl();
      return apiFetch<{ url: string; redirectUri: string }>(
        `/api/github/oauth?redirect_uri=${encodeURIComponent(redirectUri)}`
      );
    },
    connect: (code: string, repoStrategy?: string, defaultRepo?: string) =>
      apiFetch<{ connected: boolean; username: string }>('/api/github/connect', {
        method: 'POST',
        body: JSON.stringify({
          code,
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
    connect: (code: string) =>
      apiFetch<{ connected: boolean; username: string }>('/api/vercel/connect', {
        method: 'POST',
        body: JSON.stringify({ code, redirectUri: vercelOAuthCallbackUrl() }),
      }),
    connectToken: (token: string) =>
      apiFetch<{ connected: boolean; username: string }>('/api/vercel/connect-token', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    status: () => apiFetch<{ connected: boolean; username?: string }>('/api/vercel/status'),
    disconnect: () => apiFetch('/api/vercel/disconnect', { method: 'DELETE' }),
    deploy: (payload: {
      html: string;
      css?: string;
      js?: string;
      projectSlug?: string;
      projectName?: string;
    }) =>
      apiFetch<{ deployUrl: string; deploymentId?: string; deployVerified?: boolean; error?: string }>(
        '/api/vercel/deploy',
        { method: 'POST', body: JSON.stringify(payload) }
      ),
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
      apiFetch<{ keys: Array<{ provider: string; connected: boolean; masked?: string }> }>(
        '/api/integrations/provider-keys'
      ),
    saveProviderKey: (provider: string, apiKey: string) =>
      apiFetch<{ ok: boolean; provider: string; masked?: string }>('/api/integrations/provider-keys', {
        method: 'POST',
        body: JSON.stringify({ provider, apiKey }),
      }),
    deleteProviderKey: (provider: string) =>
      apiFetch(`/api/integrations/provider-keys/${encodeURIComponent(provider)}`, { method: 'DELETE' }),
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
    getRun: (runId: string) => apiFetch<SwarmRunSummary>(`/api/swarm/runs/${runId}`),
    saveConversation: (runId: string, messages: unknown[]) =>
      apiFetch<{ saved: boolean }>(`/api/swarm/runs/${runId}/conversation`, {
        method: 'PATCH',
        body: JSON.stringify({ messages }),
      }),
  },
  billing: {
    plans: () => apiFetch<{ plans: unknown[] }>('/api/billing/plans'),
    createCheckout: (planTier: string) =>
      apiFetch<{
        checkoutUrl?: string;
        priceId: string;
        customData: Record<string, string>;
      }>('/api/billing/create-checkout', {
        method: 'POST',
        body: JSON.stringify({ planTier }),
      }),
  },
  dashboard: {
    summary: () => apiFetch<DashboardSummary>('/api/dashboard/summary'),
    claimEmergencyTokens: () =>
      apiFetch<{ success: boolean; message: string }>('/api/dashboard/emergency-tokens', {
        method: 'POST',
      }),
  },
  phase1: {
    chat: (message: string, history?: Array<{ role: 'user' | 'assistant'; content: string }>) =>
      apiFetch<Phase1ChatResult>('/api/phase1/chat', {
        method: 'POST',
        body: JSON.stringify({ message, history }),
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
    claimEmergencyTokens: () =>
      apiFetch<{ success: boolean; message: string }>('/api/phase1/emergency-tokens', {
        method: 'POST',
      }),
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
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  language: string;
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

export interface CloudTerminalSessionSummary {
  id: string;
  githubRepoName: string;
  githubBranch: string;
  terminalNumber: number;
  title: string;
  prompt: string;
  preview: string;
  kind: string;
  status: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CloudTerminalSession extends CloudTerminalSessionSummary {
  messages: unknown[];
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
  created_at: string;
  completed_at: string | null;
  iteration_count: number;
}

export interface DashboardSummary {
  now: string;
  tokens: {
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
    }>;
  } | null;
  aiBackend?: string;
  xrg: {
    totalXrg: number;
    availableXrg: number;
    vestedXrg: number;
    tokenBoostTotal: number;
    consistencyStreakMonths: number;
    consistencyBonusPercent: number;
  };
  billing: {
    planTier: string;
    planName: string;
    planPrice: string;
    nextBilling: string;
    tokensIncluded: number;
    tokensUsed: number;
    tokensRemaining: number;
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
}

import type { HackathonBriefCardData } from '@/components/terminal/HackathonBriefCard';

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
