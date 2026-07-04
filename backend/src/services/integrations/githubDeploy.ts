import { getSupabaseAdmin } from '../../config/supabase.js';
import { deployStaticSite, pollDeploymentReady } from '../../lib/vercel.js';
import { deployToNetlify, pollNetlifyDeploy } from '../../lib/netlify.js';
import { getSecret } from '../../config/envSecrets.js';
import { getGitHubToken, isGitHubConnected as checkGitHubConnected, getGitHubStorageMeta } from './githubAuth.js';

export interface ProjectFile {
  path: string;
  content: string;
}

export interface GitHubPushResult {
  repoName: string;
  repoUrl: string;
  htmlUrl: string;
}

export interface DeployPipelineResult {
  github: GitHubPushResult;
  deployUrl: string;
  deployPlatform: 'vercel' | 'netlify' | 'none';
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
}

interface GitHubIntegrationRow {
  access_token: string;
  repo_strategy: 'auto' | 'monorepo' | 'manual';
  default_repo: string | null;
}

async function getIntegration(userId: string): Promise<GitHubIntegrationRow | null> {
  const token = await getGitHubToken(userId);
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('github_integrations')
    .select('access_token, repo_strategy, default_repo')
    .eq('user_id', userId)
    .maybeSingle();

  if (data?.access_token) return data as GitHubIntegrationRow;

  const storageMeta = await getGitHubStorageMeta(userId);
  return {
    access_token: token,
    repo_strategy: storageMeta?.repo_strategy ?? 'auto',
    default_repo: storageMeta?.default_repo ?? null,
  };
}

export async function isGitHubConnected(userId: string): Promise<boolean> {
  return checkGitHubConnected(userId);
}

async function ghFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
}

async function getGitHubUsername(token: string): Promise<string> {
  const res = await ghFetch(token, '/user');
  if (!res.ok) throw new Error(`GitHub user lookup failed: ${res.status}`);
  const user = (await res.json()) as { login: string };
  return user.login;
}

async function createRepo(token: string, name: string): Promise<{ fullName: string; htmlUrl: string }> {
  const res = await ghFetch(token, '/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      private: false,
      auto_init: false,
      description: 'Built with XROGA AI Swarm',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub create repo failed: ${res.status} ${err}`);
  }
  const repo = (await res.json()) as { full_name: string; html_url: string };
  return { fullName: repo.full_name, htmlUrl: repo.html_url };
}

async function pushFilesToRepo(
  token: string,
  owner: string,
  repo: string,
  files: ProjectFile[],
  message: string
): Promise<void> {
  const blobs = await Promise.all(
    files.map(async (f) => {
      const res = await ghFetch(token, `/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: Buffer.from(f.content, 'utf8').toString('base64'),
          encoding: 'base64',
        }),
      });
      if (!res.ok) throw new Error(`GitHub blob failed: ${res.status}`);
      const blob = (await res.json()) as { sha: string };
      return { path: f.path, sha: blob.sha };
    })
  );

  const treeRes = await ghFetch(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tree: blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    }),
  });
  if (!treeRes.ok) throw new Error(`GitHub tree failed: ${treeRes.status}`);
  const tree = (await treeRes.json()) as { sha: string };

  const commitRes = await ghFetch(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: tree.sha, parents: [] }),
  });
  if (!commitRes.ok) throw new Error(`GitHub commit failed: ${commitRes.status}`);
  const commit = (await commitRes.json()) as { sha: string };

  const refRes = await ghFetch(token, `/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'refs/heads/main', sha: commit.sha }),
  });
  if (!refRes.ok) {
    const updateRes = await ghFetch(token, `/repos/${owner}/${repo}/git/refs/heads/main`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
    if (!updateRes.ok) throw new Error(`GitHub ref failed: ${refRes.status}`);
  }
}

export async function pushBuildToGitHub(
  userId: string,
  files: ProjectFile[],
  slug?: string
): Promise<GitHubPushResult> {
  const integration = await getIntegration(userId);
  if (!integration?.access_token) throw new Error('GitHub not connected');

  const token = integration.access_token;
  const username = await getGitHubUsername(token);
  const repoName =
    integration.repo_strategy === 'manual' && integration.default_repo
      ? integration.default_repo.split('/').pop()!
      : slug ?? `xroga-build-${Date.now()}`;

  let owner = username;
  let repo = repoName;
  let htmlUrl = `https://github.com/${username}/${repoName}`;

  if (integration.repo_strategy === 'manual' && integration.default_repo?.includes('/')) {
    const [o, r] = integration.default_repo.split('/');
    owner = o!;
    repo = r!;
    htmlUrl = `https://github.com/${owner}/${repo}`;
    await pushFilesToRepo(token, owner, repo, files, `XROGA build — ${new Date().toISOString()}`);
  } else {
    const created = await createRepo(token, repoName);
    const [o, r] = created.fullName.split('/');
    owner = o!;
    repo = r!;
    htmlUrl = created.htmlUrl;
    await pushFilesToRepo(token, owner, repo, files, 'Initial XROGA build');
  }

  return { repoName: `${owner}/${repo}`, repoUrl: `https://github.com/${owner}/${repo}`, htmlUrl };
}

export function landingFilesFromOutput(html: string, css: string, js: string): ProjectFile[] {
  const fullHtml = html.includes('<!DOCTYPE')
    ? html
    : `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body>${html}<script src="script.js"></script></body></html>`;

  return [
    { path: 'index.html', content: fullHtml },
    { path: 'styles.css', content: css },
    { path: 'script.js', content: js },
    { path: 'README.md', content: '# XROGA Build\n\nAuto-generated by XROGA AI Swarm.\n' },
  ];
}

async function deployStaticPreview(
  projectSlug: string,
  files: ProjectFile[]
): Promise<{ deployUrl: string; platform: 'vercel' | 'netlify' | 'none'; vercelDeploymentId?: string; netlifyDeployId?: string }> {
  const staticFiles = files.filter((f) => !f.path.endsWith('.md'));

  if (getSecret('VERCEL_API_KEY')) {
    try {
      const vercelFiles = staticFiles.map((f) => ({ file: f.path, data: f.content }));
      const deployment = await deployStaticSite(projectSlug, vercelFiles);
      const deployUrl = await pollDeploymentReady(deployment.deploymentId, deployment.deployUrl);
      return { deployUrl, platform: 'vercel', vercelDeploymentId: deployment.deploymentId };
    } catch (err) {
      console.warn('[githubDeploy] Vercel:', (err as Error).message);
    }
  }

  if (getSecret('NETLIFY_ACCESS_TOKEN')) {
    try {
      const netlifyFiles = staticFiles.map((f) => ({ path: f.path, content: f.content }));
      const deployment = await deployToNetlify(projectSlug, netlifyFiles);
      const deployUrl = await pollNetlifyDeploy(deployment.deployId, deployment.deployUrl);
      return { deployUrl, platform: 'netlify', netlifyDeployId: deployment.deployId };
    } catch (err) {
      console.warn('[githubDeploy] Netlify:', (err as Error).message);
    }
  }

  return { deployUrl: `https://${projectSlug}.vercel.app`, platform: 'none' };
}

/** Push to GitHub then deploy to Vercel (preferred) or Netlify */
export async function pushAndDeployLivePreview(
  userId: string,
  files: ProjectFile[],
  projectSlug: string
): Promise<DeployPipelineResult> {
  const github = await pushBuildToGitHub(userId, files, projectSlug);
  const preview = await deployStaticPreview(projectSlug, files);
  return {
    github,
    deployUrl: preview.deployUrl,
    deployPlatform: preview.platform,
    vercelDeploymentId: preview.vercelDeploymentId,
    netlifyDeployId: preview.netlifyDeployId,
  };
}
