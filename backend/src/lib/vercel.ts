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

/** Deploy using a user's Vercel OAuth/PAT token (their account). No GitHub↔Vercel link required. */
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
    target: 'production',
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
    // Retry as static if framework build rejected
    if (framework && /framework|build|package/i.test(errText)) {
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
          target: 'production',
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
