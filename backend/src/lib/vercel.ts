import { getSecret } from '../config/envSecrets.js';

interface VercelDeployment {
  id: string;
  url: string;
  readyState: string;
  alias?: string[];
}

interface VercelFile {
  file: string;
  data: string;
}

export async function deployStaticSite(
  projectName: string,
  files: VercelFile[]
): Promise<{ deployUrl: string; deploymentId: string }> {
  const token = getSecret('VERCEL_API_KEY');
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token) {
    throw new Error('VERCEL_API_KEY not configured');
  }

  const query = teamId ? `?teamId=${teamId}` : '';
  const response = await fetch(`https://api.vercel.com/v13/deployments${query}`, {
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

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Vercel deploy failed: ${response.status} ${errText}`);
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
  maxWaitMs = 120_000
): Promise<string> {
  const token = getSecret('VERCEL_API_KEY');
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token) return fallbackUrl;

  const query = teamId ? `?teamId=${teamId}` : '';
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
