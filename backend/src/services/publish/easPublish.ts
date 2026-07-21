/**
 * EAS workflow dispatch for user-owned Expo projects.
 * Auto-links / creates Expo apps when possible.
 * Does not guarantee App Store / Play approval — only starts builds on the user's Expo account.
 */

import {
  getUserProviderKey,
  saveUserProviderKey,
} from '../integrations/userProviderKeys.js';
import { isGitHubConnected } from '../integrations/githubAuth.js';
import type { ProjectFile } from '../integrations/githubDeploy.js';

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

function slugifyProjectName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  return slug.length >= 3 ? slug : `app-${Date.now().toString(36).slice(-6)}`;
}

/** List EAS apps visible to this Expo token (for project picker). */
export async function listExpoApps(token: string): Promise<
  Array<{ id: string; name: string; slug?: string; accountId?: string; accountName?: string }>
> {
  const query = `
    query XrogaListApps {
      me {
        accounts {
          id
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
          id?: string;
          name?: string;
          apps?: Array<{ id?: string; name?: string; slug?: string; fullName?: string }>;
        }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };
  if (data.errors?.length) {
    throw new Error(data.errors[0]?.message || 'Expo GraphQL error');
  }
  const apps: Array<{
    id: string;
    name: string;
    slug?: string;
    accountId?: string;
    accountName?: string;
  }> = [];
  for (const account of data.data?.me?.accounts ?? []) {
    for (const app of account.apps ?? []) {
      if (app.id) {
        apps.push({
          id: app.id,
          name: app.fullName || app.name || app.slug || app.id,
          slug: app.slug,
          accountId: account.id,
          accountName: account.name,
        });
      }
    }
  }
  return apps;
}

async function listExpoAccounts(token: string): Promise<Array<{ id: string; name: string }>> {
  const query = `
    query XrogaAccounts {
      me {
        accounts {
          id
          name
        }
      }
    }
  `;
  const res = await expoFetch(token, '/graphql', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Expo accounts ${res.status}: ${res.text.slice(0, 160)}`);
  }
  const data = res.json as {
    data?: { me?: { accounts?: Array<{ id?: string; name?: string }> } };
    errors?: Array<{ message?: string }>;
  };
  if (data.errors?.length) throw new Error(data.errors[0]?.message || 'Expo GraphQL error');
  return (data.data?.me?.accounts ?? [])
    .filter((a): a is { id: string; name: string } => Boolean(a.id && a.name))
    .map((a) => ({ id: a.id, name: a.name }));
}

/** Create an unpublished Expo app on the user's account (same as `eas init`). */
export async function createExpoApp(
  token: string,
  opts: { accountId: string; projectName: string },
): Promise<string> {
  const mutation = `
    mutation XrogaCreateApp($appInput: AppInput!) {
      app {
        createApp(appInput: $appInput) {
          id
        }
      }
    }
  `;
  const res = await expoFetch(token, '/graphql', {
    method: 'POST',
    body: JSON.stringify({
      query: mutation,
      variables: {
        appInput: {
          accountId: opts.accountId,
          projectName: slugifyProjectName(opts.projectName),
        },
      },
    }),
  });
  const data = res.json as {
    data?: { app?: { createApp?: { id?: string } } };
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || data.errors?.length || !data.data?.app?.createApp?.id) {
    throw new Error(
      data.errors?.[0]?.message ||
        (res.json as { message?: string })?.message ||
        `Could not create Expo app (${res.status})`,
    );
  }
  return data.data.app.createApp.id;
}

/**
 * Resolve or auto-create an EAS project for this user.
 * Prefer vault → single existing app → create new app on first account.
 */
export async function ensureExpoProjectLinked(opts: {
  userId: string;
  projectName?: string;
  explicitProjectId?: string;
}): Promise<{
  projectId: string | null;
  created: boolean;
  message: string;
  error?: string;
}> {
  const token = await getUserProviderKey(opts.userId, 'expo');
  if (!token) {
    return {
      projectId: null,
      created: false,
      message: 'Save an Expo access token first',
      error: 'NO_EXPO_TOKEN',
    };
  }

  const existing = await resolveExpoProjectId(opts.userId, opts.explicitProjectId);
  if (existing) {
    return { projectId: existing, created: false, message: 'EAS project already linked' };
  }

  try {
    const apps = await listExpoApps(token);
    if (apps.length === 1) {
      const id = apps[0]!.id;
      await saveUserProviderKey(opts.userId, 'expo_project_id', id);
      return {
        projectId: id,
        created: false,
        message: `Linked existing Expo app ${apps[0]!.name}`,
      };
    }
    if (apps.length > 1) {
      return {
        projectId: null,
        created: false,
        message: 'Pick which Expo project to use (multiple found on your account)',
        error: 'NEED_PROJECT_PICK',
      };
    }

    const accounts = await listExpoAccounts(token);
    const account = accounts[0];
    if (!account) {
      return {
        projectId: null,
        created: false,
        message: 'No Expo account found for this token',
        error: 'NO_ACCOUNT',
      };
    }

    const name = opts.projectName || `xroga-app-${Date.now().toString(36).slice(-5)}`;
    const createdId = await createExpoApp(token, {
      accountId: account.id,
      projectName: name,
    });
    await saveUserProviderKey(opts.userId, 'expo_project_id', createdId);
    return {
      projectId: createdId,
      created: true,
      message: `Created Expo app @${account.name}/${slugifyProjectName(name)} and linked it`,
    };
  } catch (err) {
    return {
      projectId: null,
      created: false,
      message: (err as Error).message,
      error: 'ENSURE_FAILED',
    };
  }
}

/** Patch app.json extra.eas.projectId in generated files (in-memory before GitHub push). */
export function patchExpoProjectIdInFiles(
  files: ProjectFile[],
  projectId: string,
): ProjectFile[] {
  return files.map((f) => {
    if (f.path !== 'app.json' && !f.path.endsWith('/app.json')) return f;
    try {
      const json = JSON.parse(f.content) as {
        expo?: {
          extra?: { eas?: { projectId?: string }; [k: string]: unknown };
          [k: string]: unknown;
        };
        [k: string]: unknown;
      };
      if (!json.expo) return f;
      const extra = { ...(json.expo.extra || {}) };
      const eas = { ...((extra.eas as Record<string, unknown>) || {}), projectId };
      extra.eas = eas;
      json.expo = { ...json.expo, extra };
      return { ...f, content: `${JSON.stringify(json, null, 2)}\n` };
    } catch {
      // Fallback string replace for placeholder
      if (f.content.includes('REPLACE_WITH_EAS_PROJECT_ID')) {
        return {
          ...f,
          content: f.content.replace(/REPLACE_WITH_EAS_PROJECT_ID/g, projectId),
        };
      }
      return f;
    }
  });
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
 * Auto-creates/links an Expo project when none is set.
 * Pasted Apple/Google keys in Xroga are guidance — configure the same in Expo/EAS for submit.
 */
export async function triggerEasPublish(opts: {
  userId: string;
  platform: MobilePlatform;
  projectId?: string;
  gitRef?: string;
  submit?: boolean;
  projectName?: string;
}): Promise<{
  ok: boolean;
  workflowRunId?: string;
  url?: string;
  fileName: string;
  message: string;
  error?: string;
  projectId?: string;
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

  let projectId = await resolveExpoProjectId(opts.userId, opts.projectId);
  if (!projectId) {
    const ensured = await ensureExpoProjectLinked({
      userId: opts.userId,
      projectName: opts.projectName,
    });
    projectId = ensured.projectId;
    if (!projectId) {
      return {
        ok: false,
        fileName: '',
        message: ensured.message,
        error: ensured.error || 'NO_PROJECT_ID',
      };
    }
  }

  const wantSubmit = opts.submit === true;
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
          projectId,
          message:
            `Build started on EAS (${fallback}). Submit needs store credentials configured in Expo — open the run URL to watch progress.`,
        };
      }
    }
    return {
      ok: false,
      fileName,
      projectId,
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
    projectId,
    message: wantSubmit
      ? `EAS submit workflow started for ${opts.platform}. Watch the run — store approval is still Apple/Google’s decision.`
      : `EAS build started for ${opts.platform} on your Expo account. Download the binary from the run when green.`,
  };
}
