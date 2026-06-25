import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createClient } from '@/lib/supabase/client';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

export const api = {
  actions: {
    balance: () => apiFetch<ActionBalance>('/api/actions/balance'),
    costs: () => apiFetch<Record<string, number>>('/api/actions/costs'),
  },
  billing: {
    createCheckout: (planId: string, region: string = 'global') =>
      apiFetch<{ checkoutUrl: string }>('/api/billing/create-checkout', {
        method: 'POST',
        body: JSON.stringify({ planId, region }),
      }),
    portal: () => apiFetch<{ portalUrl: string }>('/api/billing/portal', { method: 'POST' }),
    subscription: () => apiFetch<SubscriptionInfo>('/api/billing/subscription'),
    invoices: () => apiFetch<Invoice[]>('/api/billing/invoices'),
    cancel: () => apiFetch<{ canceled: boolean }>('/api/billing/cancel', { method: 'POST' }),
    createCryptoCharge: (packId: string) =>
      apiFetch<{ chargeUrl: string; chargeId: string; actions: number }>('/api/billing/crypto/create-charge', {
        method: 'POST',
        body: JSON.stringify({ packId }),
      }),
    cryptoPacks: () => apiFetch<{ id: string; actions: number; usd: number }[]>('/api/billing/crypto-packs'),
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
    completeOnboarding: () => apiFetch<{ completed: boolean }>('/api/profile/onboarding/complete', { method: 'POST' }),
    onboardingStatus: () => apiFetch<{ completed: boolean }>('/api/profile/onboarding/status'),
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
  isTrial?: boolean;
  trialExpiresAt?: string | null;
  subscriptionStatus?: string;
  trialExpired?: boolean;
}

export interface SubscriptionInfo {
  planTier: string;
  subscriptionStatus: string;
  isTrial: boolean;
  trialExpiresAt: string | null;
  renewalDate: string | null;
  subscription: Record<string, unknown> | null;
  paymentMethod: { last4: string; brand: string } | null;
}

export interface Invoice {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  description: string | null;
  receipt_url: string | null;
  invoice_url: string | null;
  plan_tier: string | null;
  actions_purchased: number | null;
  created_at: string;
}
