import { getSecret } from '../config/envSecrets.js';

interface NetlifyDeploy {
  id: string;
  url?: string;
  ssl_url?: string;
  deploy_ssl_url?: string;
  state?: string;
}

interface NetlifyFile {
  path: string;
  content: string;
}

function getNetlifyToken(): string | undefined {
  return getSecret('NETLIFY_ACCESS_TOKEN');
}

/** Deploy static files to Netlify via Site API (creates site if needed) */
export async function deployToNetlify(
  siteName: string,
  files: NetlifyFile[]
): Promise<{ deployUrl: string; deployId: string }> {
  const token = getNetlifyToken();
  if (!token) throw new Error('NETLIFY_ACCESS_TOKEN not configured');

  const siteRes = await fetch('https://api.netlify.com/api/v1/sites', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: siteName.slice(0, 60).replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
      custom_domain: null,
    }),
  });

  let siteId: string;
  let defaultUrl: string;

  if (siteRes.ok) {
    const site = (await siteRes.json()) as { id: string; ssl_url?: string; url?: string };
    siteId = site.id;
    defaultUrl = site.ssl_url ?? site.url ?? `https://${siteName}.netlify.app`;
  } else {
    const listRes = await fetch(`https://api.netlify.com/api/v1/sites?filter=all&name=${siteName}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) throw new Error(`Netlify site lookup failed: ${listRes.status}`);
    const sites = (await listRes.json()) as Array<{ id: string; ssl_url?: string; url?: string }>;
    const existing = sites[0];
    if (!existing) throw new Error('Netlify site creation failed');
    siteId = existing.id;
    defaultUrl = existing.ssl_url ?? existing.url ?? `https://${siteName}.netlify.app`;
  }

  const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: Object.fromEntries(
        files.map((f) => [f.path, Buffer.from(f.content, 'utf8').toString('base64')])
      ),
      async: false,
      draft: false,
    }),
  });

  if (!deployRes.ok) {
    const err = await deployRes.text();
    throw new Error(`Netlify deploy failed: ${deployRes.status} ${err}`);
  }

  const deploy = (await deployRes.json()) as NetlifyDeploy;
  const deployUrl =
    deploy.ssl_url ??
    deploy.deploy_ssl_url ??
    deploy.url ??
    defaultUrl;

  return {
    deployUrl: deployUrl.startsWith('http') ? deployUrl : `https://${deployUrl}`,
    deployId: deploy.id,
  };
}

export async function pollNetlifyDeploy(
  deployId: string,
  fallbackUrl: string,
  maxWaitMs = 90_000
): Promise<string> {
  const token = getNetlifyToken();
  if (!token) return fallbackUrl;

  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const res = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const dep = (await res.json()) as NetlifyDeploy;
      if (dep.state === 'ready' || dep.state === 'published') {
        const url = dep.ssl_url ?? dep.deploy_ssl_url ?? dep.url;
        if (url) return url.startsWith('http') ? url : `https://${url}`;
      }
      if (dep.state === 'error') break;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return fallbackUrl;
}
