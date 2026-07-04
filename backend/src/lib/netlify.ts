import crypto from 'crypto';
import { getSecret } from '../config/envSecrets.js';

interface NetlifyDeploy {
  id: string;
  url?: string;
  ssl_url?: string;
  deploy_ssl_url?: string;
  state?: string;
  required?: string[];
}

interface NetlifyFile {
  path: string;
  content: string;
}

function getNetlifyToken(): string | undefined {
  return getSecret('NETLIFY_ACCESS_TOKEN');
}

function sha1(content: string): string {
  return crypto.createHash('sha1').update(content, 'utf8').digest('hex');
}

function netlifyPath(filePath: string): string {
  return filePath.startsWith('/') ? filePath : `/${filePath}`;
}

/** Deploy static files to Netlify (SHA1 digest + required file upload). */
export async function deployToNetlify(
  siteName: string,
  files: NetlifyFile[]
): Promise<{ deployUrl: string; deployId: string }> {
  const token = getNetlifyToken();
  if (!token) throw new Error('NETLIFY_ACCESS_TOKEN not configured');

  const slug = siteName.slice(0, 60).replace(/[^a-z0-9-]/gi, '-').toLowerCase();

  const siteRes = await fetch('https://api.netlify.com/api/v1/sites', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: slug,
      custom_domain: null,
    }),
  });

  let siteId: string;
  let defaultUrl: string;

  if (siteRes.ok) {
    const site = (await siteRes.json()) as { id: string; ssl_url?: string; url?: string };
    siteId = site.id;
    defaultUrl = site.ssl_url ?? site.url ?? `https://${slug}.netlify.app`;
  } else {
    const listRes = await fetch(`https://api.netlify.com/api/v1/sites?filter=all&name=${slug}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) throw new Error(`Netlify site lookup failed: ${listRes.status}`);
    const sites = (await listRes.json()) as Array<{ id: string; ssl_url?: string; url?: string; name?: string }>;
    const existing = sites.find((s) => s.name === slug) ?? sites[0];
    if (!existing) throw new Error('Netlify site creation failed');
    siteId = existing.id;
    defaultUrl = existing.ssl_url ?? existing.url ?? `https://${slug}.netlify.app`;
  }

  const fileHashes: Record<string, string> = {};
  const hashToContent = new Map<string, string>();

  for (const file of files) {
    const path = netlifyPath(file.path);
    const hash = sha1(file.content);
    fileHashes[path] = hash;
    hashToContent.set(hash, file.content);
  }

  const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: fileHashes }),
  });

  if (!deployRes.ok) {
    const err = await deployRes.text();
    throw new Error(`Netlify deploy failed: ${deployRes.status} ${err}`);
  }

  const deploy = (await deployRes.json()) as NetlifyDeploy;

  if (deploy.required?.length) {
    for (const hash of deploy.required) {
      const content = hashToContent.get(hash);
      if (!content) continue;
      const uploadRes = await fetch(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files/${hash}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: content,
      });
      if (!uploadRes.ok) {
        throw new Error(`Netlify file upload failed: ${uploadRes.status}`);
      }
    }
  }

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
  maxWaitMs = 120_000
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
