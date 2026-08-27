import { getSecret } from '../config/envSecrets.js';

interface VercelDeployment {
  id: string;
  url: string;
  readyState: string;
  alias?: string[];
}

export interface VercelFile {
  file: string;
  data: string;
}

export type VercelFramework = 'nextjs' | 'vite' | 'null' | null;

export interface DeploySiteOptions {
  /** Prefer user's personal account — only pass teamId when known for that user. */
  teamId?: string | null;
  framework?: VercelFramework;
  /** When true, upload full source tree (framework build). */
  sourceDeploy?: boolean;
  /** Production updates the project alias; preview returns an isolated deployment URL. */
  target?: 'production' | 'preview';
}

/**
 * Xroga's shared preview project must stay public because its generated deployment
 * URLs are the customer-facing result. Keep this separate from user-owned projects:
 * their deployment-protection policy is never changed by Xroga.
 */
export async function ensureManagedVercelProjectPublic(projectName: string): Promise<void> {
  const token = getSecret('VERCEL_API_KEY');
  if (!token) throw new Error('VERCEL_API_KEY not configured');

  const query = teamQuery(process.env.VERCEL_TEAM_ID ?? undefined);
  const response = await fetch(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}${query}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ssoProtection: null }),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    throw new Error(
      `Vercel managed preview publishing setup failed: ${response.status}${detail ? ` ${detail}` : ''}`,
    );
  }

  const project = (await response.json()) as { ssoProtection?: unknown };
  if (project.ssoProtection != null) {
    throw new Error('Vercel managed preview publishing setup did not disable deployment protection');
  }
}

async function resolveTeamId(token: string, preferred?: string | null): Promise<string | undefined> {
  if (preferred) return preferred;
  // Do NOT fall back to process.env.VERCEL_TEAM_ID for user tokens —
  // that is the Xroga platform team and breaks personal-account deploys.
  try {
    const res = await fetch('https://api.vercel.com/v2/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return undefined;
    // Personal tokens work without teamId; team tokens may still deploy without it.
    return undefined;
  } catch {
    return undefined;
  }
}

function teamQuery(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

export async function deployStaticSite(
  projectName: string,
  files: VercelFile[],
  opts?: DeploySiteOptions,
): Promise<{ deployUrl: string; deploymentId: string }> {
  const token = getSecret('VERCEL_API_KEY');
  if (!token) {
    throw new Error('VERCEL_API_KEY not configured');
  }
  return deployStaticSiteWithToken(projectName, files, token, {
    ...opts,
    // Platform key may use platform team
    teamId: opts?.teamId ?? process.env.VERCEL_TEAM_ID ?? null,
  });
}

/** Deploy through the user's Vercel App OAuth authorization (their account/project). */
export async function deployStaticSiteWithToken(
  projectName: string,
  files: VercelFile[],
  token: string,
  opts?: DeploySiteOptions,
): Promise<{ deployUrl: string; deploymentId: string }> {
  const teamId = await resolveTeamId(token, opts?.teamId);
  const query = teamQuery(teamId);
  const framework =
    opts?.framework === 'null' || opts?.framework === null || opts?.framework === undefined
      ? null
      : opts.framework;

  const body: Record<string, unknown> = {
    name: projectName,
    files,
    projectSettings: {
      framework,
      ...(framework === 'nextjs'
        ? {
            buildCommand: 'npm run build',
            installCommand: 'npm install',
            outputDirectory: '.next',
          }
        : framework === 'vite'
          ? { buildCommand: 'npm run build', installCommand: 'npm install' }
          : {}),
    },
    // Vercel creates a Preview deployment when target is omitted. This matters for
    // Xroga's shared managed project because one build must never replace another.
    ...(opts?.target === 'preview' ? {} : { target: 'production' }),
  };

  const response = await fetch(`https://api.vercel.com/v13/deployments${query}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    // Next/Vite: do NOT silently fall back to static — that ships a fake "live" site.
    // Static-only deploys may still retry without framework when the API rejects settings.
    if (framework && framework !== 'nextjs' && framework !== 'vite' && /framework|build|package/i.test(errText)) {
      const retry = await fetch(`https://api.vercel.com/v13/deployments${query}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName,
          files,
          projectSettings: { framework: null },
          ...(opts?.target === 'preview' ? {} : { target: 'production' }),
        }),
      });
      if (!retry.ok) {
        const retryErr = await retry.text();
        throw new Error(`Vercel deploy failed: ${retry.status} ${retryErr.slice(0, 200)}`);
      }
      const deployment = (await retry.json()) as VercelDeployment;
      const deployUrl = deployment.url.startsWith('http')
        ? deployment.url
        : `https://${deployment.url}`;
      return { deployUrl, deploymentId: deployment.id };
    }
    if (framework === 'nextjs' || framework === 'vite') {
      throw new Error(
        `Vercel ${framework} deploy failed (no silent static fallback): ${response.status} ${errText.slice(0, 280)}`,
      );
    }
    throw new Error(`Vercel deploy failed: ${response.status} ${errText.slice(0, 200)}`);
  }

  const deployment = (await response.json()) as VercelDeployment;
  const deployUrl = deployment.url.startsWith('http')
    ? deployment.url
    : `https://${deployment.url}`;

  return { deployUrl, deploymentId: deployment.id };
}

/** Poll until deployment is READY; returns stable preview URL */
export async function pollDeploymentReady(
  deploymentId: string,
  fallbackUrl: string,
  authToken?: string,
  maxWaitMs = 180_000,
  teamId?: string | null,
): Promise<string> {
  const token = authToken ?? getSecret('VERCEL_API_KEY');
  const resolvedTeam =
    teamId ?? (authToken ? undefined : process.env.VERCEL_TEAM_ID) ?? undefined;
  if (!token) return fallbackUrl;

  const query = teamQuery(resolvedTeam);
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    const res = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const dep = (await res.json()) as VercelDeployment;
      if (dep.readyState === 'READY') {
        const alias = dep.alias?.[0];
        if (alias) return alias.startsWith('http') ? alias : `https://${alias}`;
        return dep.url.startsWith('http') ? dep.url : `https://${dep.url}`;
      }
      if (dep.readyState === 'ERROR' || dep.readyState === 'CANCELED') break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  return fallbackUrl;
}
