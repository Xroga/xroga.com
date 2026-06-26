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
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }
  return 'https://xroga.com';
}

export const API_URL = resolveApiUrl();

export interface StreamSwarmOptions {
  projectId?: string;
  onProgress?: (event: SwarmProgressEvent) => void;
  onDelta?: (delta: string) => void;
}

/** Stream SSE from POST /api/swarm/execute with JWT auth. */
export async function streamSwarmExecute(
  prompt: string,
  options: StreamSwarmOptions = {}
): Promise<string> {
  const token = await getAccessToken();
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
    }),
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
        data.error ?? 'Out of actions — subscribe to continue.',
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
            String(payload.error ?? 'Out of actions'),
            402,
            payload as Record<string, unknown>
          );
        }
        throw new Error(String(payload.error ?? 'Swarm stream error'));
      }

      if (eventName === 'progress') {
        options.onProgress?.(payload as SwarmProgressEvent);
      }

      if (eventName === 'delta' && typeof payload.delta === 'string') {
        finalText += payload.delta;
        options.onDelta?.(payload.delta);
      }

      if (eventName === 'complete') {
        const complete = payload as SwarmCompleteEvent;
        const text = swarmOutputToText(complete.output);
        if (text && !finalText) {
          finalText = text;
          options.onDelta?.(text);
        }
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

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
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
        message || 'Out of actions — subscribe to continue.',
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
    balance: () => apiFetch<{ total: number; used: number; remaining: number; planTier: string; resetDate: string }>('/api/actions/balance'),
  },
  projects: {
    list: () => apiFetch<Project[]>('/api/projects'),
    get: (id: string) => apiFetch<ProjectDetail>(`/api/projects/${id}`),
    files: (id: string) => apiFetch<ProjectFile[]>(`/api/projects/${id}/files`),
    create: (body: { name: string; type: string }) =>
      apiFetch<Project>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  },
  profile: {
    get: () => apiFetch<Profile>('/api/profile'),
    update: (body: Partial<Profile>) =>
      apiFetch<Profile>('/api/profile', { method: 'PATCH', body: JSON.stringify(body) }),
    activity: () => apiFetch<ActivityLog[]>('/api/profile/activity'),
  },
  github: {
    oauthUrl: () => apiFetch<{ url: string }>('/api/github/oauth'),
    connect: (code: string, repoStrategy?: string, defaultRepo?: string) =>
      apiFetch<{ connected: boolean; username: string }>('/api/github/connect', {
        method: 'POST',
        body: JSON.stringify({ code, repoStrategy, defaultRepo }),
      }),
    status: () => apiFetch<GitHubStatus>('/api/github/status'),
    updateSettings: (repoStrategy: string, defaultRepo?: string) =>
      apiFetch('/api/github/settings', {
        method: 'PATCH',
        body: JSON.stringify({ repoStrategy, defaultRepo }),
      }),
    disconnect: () => apiFetch('/api/github/disconnect', { method: 'DELETE' }),
  },
  notifications: {
    list: () => apiFetch<Notification[]>('/api/notifications'),
    unreadCount: () => apiFetch<{ count: number }>('/api/notifications/unread-count'),
    markRead: (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => apiFetch('/api/notifications/read-all', { method: 'PATCH' }),
  },
  swarm: {
    execute: (prompt: string, projectId?: string) =>
      apiFetch('/api/swarm/execute', {
        method: 'POST',
        body: JSON.stringify({ prompt, projectId }),
      }),
    stream: streamSwarmExecute,
    history: () => apiFetch<SwarmRunSummary[]>('/api/swarm/history'),
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

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  created_at: string;
}

export interface ActionBalance {
  total: number;
  used: number;
  remaining: number;
  planTier: string;
  resetDate: string;
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
