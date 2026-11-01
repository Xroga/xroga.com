import {publishingProviderRequest as fetch} from './publishingProviderRequest.js';
import {EgressDenied} from '../security/egress/egressPolicy.js';
/**
 * Sync decrypted user vault secrets → Vercel project environment variables.
 * Requires a Vercel OAuth credential with project environment write access.
 */

export interface VercelEnvSyncResult {
  ok: boolean;
  projectName: string;
  upserted: string[];
  // Includes attempted writes without a verified receipt, not proof of no effect.
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

function projectReceipt(value: unknown, expectedName: string): { id: string; name: string } {
  const row = value as { id?: unknown; name?: unknown } | null;
  if (!row || typeof row.id !== 'string' || !/^prj_[A-Za-z0-9]+$/.test(row.id)
    || row.name !== expectedName) throw new Error('Invalid Vercel project receipt');
  return { id: row.id, name: expectedName };
}

function validEnvReceipt(value: unknown, key: string, existingId?: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const targets = row.target;
  return row.key === key && row.type === 'encrypted'
    && (row.visibility === undefined || row.visibility === 'secret')
    && (row.id === undefined || (typeof row.id === 'string' && /^[A-Za-z0-9_-]+$/.test(row.id)
      && (existingId === undefined || row.id === existingId)))
    && Array.isArray(targets) && targets.length === 3
    && new Set(targets).size === 3 && ['production','preview','development'].every(target => targets.includes(target))
    && row.gitBranch == null
    && (row.customEnvironmentIds === undefined || (Array.isArray(row.customEnvironmentIds) && row.customEnvironmentIds.length === 0));
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
    return projectReceipt(await getRes.json(), projectName);
  }
  if (getRes.status !== 404) throw new Error('Vercel project lookup unavailable');

  const createRes = await fetch(`https://api.vercel.com/v10/projects${q}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: projectName, framework: null }),
  });
  if (!createRes.ok) {
    throw new Error('Vercel project creation unavailable');
  }
  return projectReceipt(await createRes.json(), projectName);
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
  if (!res.ok) throw new Error('Vercel environment lookup unavailable');
  const data = (await res.json()) as { envs?: VercelEnvItem[] } | VercelEnvItem[];
  const rows = Array.isArray(data) ? data : data?.envs;
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(row.id)
    || typeof row.key !== 'string' || !row.key) || new Set(rows.map(row => row.key)).size !== rows.length) {
    throw new Error('Invalid Vercel environment receipt');
  }
  return rows;
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
    return patchRes.ok && validEnvReceipt(await patchRes.json(), key, existingId);
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
  if (!postRes.ok) return false;
  const receipt = await postRes.json() as { failed?: unknown; created?: unknown } | null;
  if (!receipt || !Array.isArray(receipt.failed) || receipt.failed.length) return false;
  const created = Array.isArray(receipt.created) ? receipt.created : [receipt.created];
  return created.length === 1 && validEnvReceipt(created[0], key);
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
  // Preserve the user's exact target. Never redirect secrets via normalization.
  const { projectName, token, teamId } = opts;
  const env = { ...opts.env };
  const keys = Object.keys(env);
  if (!/^[a-z0-9._-]{1,100}$/.test(projectName) || projectName.includes('---')) {
    return { ok: false, projectName, upserted: [], skipped: keys, error: 'Invalid Vercel project name' };
  }
  if (!keys.length) {
    return { ok: true, projectName, upserted: [], skipped: [] };
  }
  const upserted: string[] = [];
  const skipped: string[] = [];

  try {
    const project = await ensureProject(token, projectName, teamId);
    if (!project) {
      return {
        ok: false,
        projectName,
        upserted: [],
        skipped: keys,
        error: 'Could not resolve Vercel project for env sync',
      };
    }

    const existing = await listEnv(token, project.id, teamId);
    const byKey = new Map(existing.filter((e) => e.key).map((e) => [e.key!, e]));

    for (const [key, value] of Object.entries(env)) {
      if (!key || !value) {
        skipped.push(key);
        continue;
      }
      const prev = byKey.get(key);
      const ok = await upsertEnvVar(
        token,
        project.id,
        key,
        value,
        prev?.id,
        teamId,
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
          ? `Could not verify ${skipped.length} env var(s). Some writes may have applied. Check Vercel project environment access before retrying.`
          : undefined,
    };
  } catch (err) {
    if(err instanceof EgressDenied)throw err;
    return {
      ok: false,
      projectName,
      upserted,
      skipped: keys.filter(key => !upserted.includes(key)),
      error: 'Vercel environment sync failed. Unverified writes may have applied. Check project state before retrying.',
    };
  }
}
