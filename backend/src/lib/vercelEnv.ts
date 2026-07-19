/**
 * Sync decrypted user vault secrets → Vercel project environment variables.
 * Requires a Vercel token with project/env write access (Full Account PAT recommended).
 */

export interface VercelEnvSyncResult {
  ok: boolean;
  projectName: string;
  upserted: string[];
  skipped: string[];
  error?: string;
}

interface VercelEnvItem {
  id?: string;
  key?: string;
  target?: string[];
}

function teamQuery(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

async function ensureProject(
  token: string,
  projectName: string,
  teamId?: string,
): Promise<{ id: string; name: string } | null> {
  const q = teamQuery(teamId);
  const getRes = await fetch(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}${q}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (getRes.ok) {
    const p = (await getRes.json()) as { id: string; name: string };
    return { id: p.id, name: p.name };
  }

  const createRes = await fetch(`https://api.vercel.com/v10/projects${q}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: projectName, framework: null }),
  });
  if (!createRes.ok) {
    // Project may be created implicitly on first deploy — continue with name
    return { id: projectName, name: projectName };
  }
  const created = (await createRes.json()) as { id: string; name: string };
  return { id: created.id, name: created.name };
}

async function listEnv(
  token: string,
  projectIdOrName: string,
  teamId?: string,
): Promise<VercelEnvItem[]> {
  const q = teamQuery(teamId);
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectIdOrName)}/env${q}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { envs?: VercelEnvItem[] } | VercelEnvItem[];
  if (Array.isArray(data)) return data;
  return data.envs ?? [];
}

async function upsertEnvVar(
  token: string,
  projectIdOrName: string,
  key: string,
  value: string,
  existingId: string | undefined,
  teamId?: string,
): Promise<boolean> {
  const q = teamQuery(teamId);
  const targets = ['production', 'preview', 'development'];

  if (existingId) {
    const patchRes = await fetch(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(projectIdOrName)}/env/${existingId}${q}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value, type: 'encrypted', target: targets }),
      },
    );
    if (patchRes.ok) return true;
  }

  const postRes = await fetch(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(projectIdOrName)}/env${q}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key,
        value,
        type: 'encrypted',
        target: targets,
      }),
    },
  );
  return postRes.ok;
}

/**
 * Upsert all vault env vars onto the user's Vercel project.
 * Never logs secret values.
 */
export async function syncEnvVarsToVercelProject(opts: {
  token: string;
  projectName: string;
  env: Record<string, string>;
  teamId?: string;
}): Promise<VercelEnvSyncResult> {
  const projectName = opts.projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
  const keys = Object.keys(opts.env);
  if (!keys.length) {
    return { ok: true, projectName, upserted: [], skipped: [] };
  }

  try {
    const project = await ensureProject(opts.token, projectName, opts.teamId);
    if (!project) {
      return {
        ok: false,
        projectName,
        upserted: [],
        skipped: keys,
        error: 'Could not resolve Vercel project for env sync',
      };
    }

    const existing = await listEnv(opts.token, project.id, opts.teamId);
    const byKey = new Map(existing.filter((e) => e.key).map((e) => [e.key!, e]));

    const upserted: string[] = [];
    const skipped: string[] = [];

    for (const [key, value] of Object.entries(opts.env)) {
      if (!key || !value) {
        skipped.push(key);
        continue;
      }
      const prev = byKey.get(key);
      const ok = await upsertEnvVar(
        opts.token,
        project.id,
        key,
        value,
        prev?.id,
        opts.teamId,
      );
      if (ok) upserted.push(key);
      else skipped.push(key);
    }

    const ok = skipped.length === 0;
    return {
      ok,
      projectName: project.name || projectName,
      upserted,
      skipped,
      error: ok
        ? undefined
        : skipped.length
          ? `Could not write ${skipped.length} env var(s). Use a Vercel Full Account token under Integrations (OAuth "deployment" scope cannot set env).`
          : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      projectName,
      upserted: [],
      skipped: keys,
      error: (err as Error).message.slice(0, 200),
    };
  }
}
