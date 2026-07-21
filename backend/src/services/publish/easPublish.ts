/**
 * EAS workflow dispatch for user-owned Expo projects.
 * Does not guarantee App Store / Play submission — only starts a workflow on Expo.
 */

import {
  getUserProviderKey,
  saveUserProviderKey,
} from '../integrations/userProviderKeys.js';
import { isGitHubConnected } from '../integrations/githubAuth.js';

const EXPO_API = 'https://api.expo.dev';

export type MobilePlatform = 'android' | 'ios';

async function expoFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await fetch(`${EXPO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text };
  }
  return { ok: res.ok, status: res.status, json, text };
}

/** List EAS apps visible to this Expo token (for project picker). */
export async function listExpoApps(token: string): Promise<
  Array<{ id: string; name: string; slug?: string }>
> {
  const query = `
    query XrogaListApps {
      me {
        accounts {
          name
          apps(limit: 50, offset: 0) {
            id
            name
            slug
            fullName
          }
        }
      }
    }
  `;
  const res = await expoFetch(token, '/graphql', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(
      `Expo GraphQL ${res.status}: ${(res.json as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message || res.text.slice(0, 160)}`,
    );
  }
  const data = res.json as {
    data?: {
      me?: {
        accounts?: Array<{
          apps?: Array<{ id?: string; name?: string; slug?: string; fullName?: string }>;
        }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };
  if (data.errors?.length) {
    throw new Error(data.errors[0]?.message || 'Expo GraphQL error');
  }
  const apps: Array<{ id: string; name: string; slug?: string }> = [];
  for (const account of data.data?.me?.accounts ?? []) {
    for (const app of account.apps ?? []) {
      if (app.id) {
        apps.push({
          id: app.id,
          name: app.fullName || app.name || app.slug || app.id,
          slug: app.slug,
        });
      }
    }
  }
  return apps;
}

export async function resolveExpoProjectId(
  userId: string,
  explicit?: string,
): Promise<string | null> {
  if (explicit?.trim()) return explicit.trim();
  const saved = await getUserProviderKey(userId, 'expo_project_id');
  if (saved?.trim()) return saved.trim();
  return null;
}

/**
 * Trigger EAS workflow dispatch (build, or build+submit only if Expo/EAS already has store creds).
 * Pasted Apple/Google keys in Xroga are stored for guidance — this call does not upload them to EAS.
 * Requires workflow files in the linked GitHub repo (Xroga Expo scaffold includes them).
 */
export async function triggerEasPublish(opts: {
  userId: string;
  platform: MobilePlatform;
  projectId?: string;
  gitRef?: string;
  submit?: boolean;
}): Promise<{
  ok: boolean;
  workflowRunId?: string;
  url?: string;
  fileName: string;
  message: string;
  error?: string;
}> {
  const token = await getUserProviderKey(opts.userId, 'expo');
  if (!token) {
    return {
      ok: false,
      fileName: '',
      message: 'Save an Expo access token first',
      error: 'NO_EXPO_TOKEN',
    };
  }

  const githubOk = await isGitHubConnected(opts.userId).catch(() => false);
  if (!githubOk) {
    return {
      ok: false,
      fileName: '',
      message: 'Connect GitHub first — EAS builds from your repo',
      error: 'NO_GITHUB',
    };
  }

  if (opts.platform === 'android') {
    const google = await getUserProviderKey(opts.userId, 'google_play');
    if (opts.submit !== false && !google) {
      // Still allow build-only
    }
  }
  if (opts.platform === 'ios') {
    const apple = await getUserProviderKey(opts.userId, 'apple_asc');
    if (opts.submit !== false && !apple) {
      // Still allow build-only — submit needs Apple creds on EAS
    }
  }

  let projectId = await resolveExpoProjectId(opts.userId, opts.projectId);
  if (!projectId) {
    try {
      const apps = await listExpoApps(token);
      if (apps.length === 1) {
        projectId = apps[0]!.id;
        await saveUserProviderKey(opts.userId, 'expo_project_id', projectId).catch(() => undefined);
      } else if (apps.length > 1) {
        return {
          ok: false,
          fileName: '',
          message: 'Pick which Expo project for the EAS workflow (multiple found on your Expo account)',
          error: 'NEED_PROJECT_PICK',
        };
      }
    } catch (err) {
      return {
        ok: false,
        fileName: '',
        message: (err as Error).message,
        error: 'LIST_APPS_FAILED',
      };
    }
  }

  if (!projectId) {
    return {
      ok: false,
      fileName: '',
      message:
        'No EAS project linked yet. Open expo.dev, create/link the app (or run eas init once), then paste the Project ID here — or rebuild so app.json has extra.eas.projectId.',
      error: 'NO_PROJECT_ID',
    };
  }

  const wantSubmit = opts.submit !== false;
  const fileName =
    opts.platform === 'android'
      ? wantSubmit
        ? 'publish-android.yml'
        : 'build-android.yml'
      : wantSubmit
        ? 'publish-ios.yml'
        : 'build-ios.yml';

  const gitRef = (opts.gitRef || 'main').trim() || 'main';
  const res = await expoFetch(token, '/v2/workflows/dispatch', {
    method: 'POST',
    body: JSON.stringify({
      appId: projectId,
      gitRef,
      fileName,
    }),
  });

  if (!res.ok) {
    const msg =
      (res.json as { message?: string; error?: string })?.message ||
      (res.json as { error?: string })?.error ||
      res.text.slice(0, 240);
    // Fallback: try build-only workflow if publish file missing
    if (/not found|404/i.test(msg) && wantSubmit) {
      const fallback = opts.platform === 'android' ? 'build-android.yml' : 'build-ios.yml';
      const retry = await expoFetch(token, '/v2/workflows/dispatch', {
        method: 'POST',
        body: JSON.stringify({ appId: projectId, gitRef, fileName: fallback }),
      });
      if (retry.ok) {
        const data = retry.json as { data?: { id?: string; url?: string } };
        return {
          ok: true,
          workflowRunId: data.data?.id,
          url: data.data?.url,
          fileName: fallback,
          message:
            `Build started on EAS (${fallback}). Submit needs store credentials configured in Expo — open the run URL to watch progress.`,
        };
      }
    }
    return {
      ok: false,
      fileName,
      message: msg || `EAS workflow dispatch failed (${res.status})`,
      error: 'DISPATCH_FAILED',
    };
  }

  const data = res.json as { data?: { id?: string; url?: string } };
  return {
    ok: true,
    workflowRunId: data.data?.id,
    url: data.data?.url,
    fileName,
    message: wantSubmit
      ? `EAS workflow started for ${opts.platform} (${fileName}). This is a build/submit handoff on your Expo account — not store approval. Submit only works if store credentials are already configured in Expo/EAS.`
      : `EAS build workflow started for ${opts.platform} on your Expo account.`,
  };
}
