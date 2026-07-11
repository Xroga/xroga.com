import { getSupabaseAdmin } from '../../config/supabase.js';
import { deployStaticSite, pollDeploymentReady } from '../../lib/vercel.js';
import { deployToNetlify, pollNetlifyDeploy } from '../../lib/netlify.js';
import { verifyLivePreviewUrl } from '../../lib/deployVerify.js';
import { normalizeBuildFiles } from '../../lib/normalizeBuildSource.js';
import { buildInlinePreviewDocument } from '../../lib/landingPreview.js';
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
  deployVerified: boolean;
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
  vercelPreviewUrl?: string;
  netlifyPreviewUrl?: string;
  vercel?: PlatformDeployResult;
  netlify?: PlatformDeployResult;
  deployError?: string;
}

interface GitHubIntegrationRow {
  access_token: string;
  repo_strategy: 'auto' | 'monorepo' | 'manual';
  default_repo: string | null;
}

interface PreviewDeployResult {
  deployUrl: string;
  platform: 'vercel' | 'netlify';
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
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

async function createRepo(token: string, name: string): Promise<{ fullName: string; htmlUrl: string; owner: string; repo: string }> {
  const res = await ghFetch(token, '/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      private: false,
      auto_init: true,
      description: 'Built with XROGA AI Swarm',
    }),
  });
  if (res.status === 422) {
    const username = await getGitHubUsername(token);
    return {
      fullName: `${username}/${name}`,
      htmlUrl: `https://github.com/${username}/${name}`,
      owner: username,
      repo: name,
    };
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub create repo failed: ${res.status} ${err}`);
  }
  const repo = (await res.json()) as { full_name: string; html_url: string };
  const [owner, repoName] = repo.full_name.split('/');
  return { fullName: repo.full_name, htmlUrl: repo.html_url, owner: owner!, repo: repoName! };
}

async function getBranchHeadSha(
  token: string,
  owner: string,
  repo: string,
  preferredBranch?: string
): Promise<{ sha: string | null; branch: string }> {
  const candidates = [
    ...(preferredBranch ? [preferredBranch] : []),
    'main',
    'master',
  ];
  for (const branch of candidates) {
    const res = await ghFetch(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    if (res.ok) {
      const data = (await res.json()) as { object: { sha: string } };
      return { sha: data.object.sha, branch };
    }
  }
  return { sha: null, branch: preferredBranch ?? 'main' };
}

async function isRepoEmpty(token: string, owner: string, repo: string): Promise<boolean> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}`);
  if (!res.ok) return true;
  const data = (await res.json()) as { size?: number };
  return (data.size ?? 0) === 0;
}

async function getExistingFileSha(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string | undefined> {
  const res = await ghFetch(
    token,
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`
  );
  if (!res.ok) return undefined;
  const data = (await res.json()) as { sha?: string };
  return data.sha;
}

/** Contents API — works on empty repos (Git Data API returns 409 on empty repos). */
async function pushFileViaContents(
  token: string,
  owner: string,
  repo: string,
  file: ProjectFile,
  message: string,
  branch: string,
  existingSha?: string
): Promise<void> {
  const body: Record<string, string> = {
    message,
    content: Buffer.from(file.content, 'utf8').toString('base64'),
    branch,
  };
  if (existingSha) body.sha = existingSha;

  const res = await ghFetch(
    token,
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub push ${file.path} failed: ${res.status} ${err.slice(0, 240)}`);
  }
}

async function pushFilesViaContents(
  token: string,
  owner: string,
  repo: string,
  files: ProjectFile[],
  message: string,
  branch: string
): Promise<void> {
  for (const file of files) {
    const sha = await getExistingFileSha(token, owner, repo, file.path, branch);
    await pushFileViaContents(token, owner, repo, file, message, branch, sha);
  }
}

async function pushFilesViaGitData(
  token: string,
  owner: string,
  repo: string,
  files: ProjectFile[],
  message: string,
  branch: string
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
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`GitHub blob failed: ${res.status} ${err.slice(0, 120)}`);
      }
      const blob = (await res.json()) as { sha: string };
      return { path: f.path, sha: blob.sha };
    })
  );

  const { sha: parentSha, branch: resolvedBranch } = await getBranchHeadSha(token, owner, repo, branch);

  const treeRes = await ghFetch(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_tree: parentSha ?? undefined,
      tree: blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    }),
  });
  if (!treeRes.ok) throw new Error(`GitHub tree failed: ${treeRes.status}`);
  const tree = (await treeRes.json()) as { sha: string };

  const commitRes = await ghFetch(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: parentSha ? [parentSha] : [],
    }),
  });
  if (!commitRes.ok) throw new Error(`GitHub commit failed: ${commitRes.status}`);
  const commit = (await commitRes.json()) as { sha: string };

  if (parentSha) {
    const updateRes = await ghFetch(token, `/repos/${owner}/${repo}/git/refs/heads/${resolvedBranch}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commit.sha }),
    });
    if (!updateRes.ok) throw new Error(`GitHub ref update failed: ${updateRes.status}`);
  } else {
    const refRes = await ghFetch(token, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${resolvedBranch}`, sha: commit.sha }),
    });
    if (!refRes.ok) throw new Error(`GitHub ref create failed: ${refRes.status}`);
  }
}

async function pushFilesToRepo(
  token: string,
  owner: string,
  repo: string,
  files: ProjectFile[],
  message: string,
  branch = 'main'
): Promise<void> {
  const empty = await isRepoEmpty(token, owner, repo);

  if (empty) {
    await pushFilesViaContents(token, owner, repo, files, message, branch);
    return;
  }

  try {
    await pushFilesViaGitData(token, owner, repo, files, message, branch);
  } catch (err) {
    const msg = (err as Error).message;
    if (/409|empty/i.test(msg)) {
      await pushFilesViaContents(token, owner, repo, files, message, branch);
      return;
    }
    throw err;
  }
}

export interface GitHubPushOptions {
  slug?: string;
  targetRepo?: string;
  targetBranch?: string;
}

export async function pushBuildToGitHub(
  userId: string,
  files: ProjectFile[],
  slugOrOpts?: string | GitHubPushOptions
): Promise<GitHubPushResult> {
  const opts: GitHubPushOptions =
    typeof slugOrOpts === 'string' ? { slug: slugOrOpts } : slugOrOpts ?? {};

  const integration = await getIntegration(userId);
  if (!integration?.access_token) throw new Error('GitHub not connected');

  const token = integration.access_token;

  const selectedRepo =
    opts.targetRepo ??
    (integration.default_repo?.includes('/') ? integration.default_repo : null);

  if (selectedRepo?.includes('/')) {
    const [owner, repo] = selectedRepo.split('/');
    const branch = opts.targetBranch ?? 'main';
    const htmlUrl = `https://github.com/${owner}/${repo}`;
    await pushFilesToRepo(
      token,
      owner!,
      repo!,
      files,
      `XROGA build — ${new Date().toISOString()}`,
      branch
    );
    return {
      repoName: `${owner}/${repo}`,
      repoUrl: htmlUrl,
      htmlUrl,
    };
  }

  const repoName = opts.slug ?? `xroga-build-${Date.now()}`;

  const created = await createRepo(token, repoName);
  const owner = created.owner;
  const repo = created.repo;
  const htmlUrl = created.htmlUrl;
  await pushFilesToRepo(token, owner, repo, files, 'Initial XROGA build');

  return { repoName: `${owner}/${repo}`, repoUrl: `https://github.com/${owner}/${repo}`, htmlUrl };
}

export function landingFilesFromOutput(html: string, css: string, js: string): ProjectFile[] {
  const normalized = normalizeBuildFiles(html, css, js);
  const fullHtml = normalized.html.includes('<!DOCTYPE')
    ? normalized.html
    : `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body>${normalized.html}<script src="script.js"></script></body></html>`;

  return [
    { path: 'index.html', content: fullHtml },
    { path: 'styles.css', content: normalized.css },
    { path: 'script.js', content: normalized.js },
    { path: 'README.md', content: '# XROGA Build\n\nAuto-generated by XROGA AI Swarm.\n' },
  ];
}

/** Single merged index.html for Vercel/Netlify — matches in-card preview exactly. */
export function landingDeployFilesFromOutput(html: string, css: string, js: string): ProjectFile[] {
  const merged = buildInlinePreviewDocument(html, css, js);
  return [{ path: 'index.html', content: merged }];
}

function hostingDeployFiles(files: ProjectFile[]): ProjectFile[] {
  const html = files.find((f) => f.path === 'index.html')?.content ?? '';
  const css = files.find((f) => f.path === 'styles.css')?.content ?? '';
  const js = files.find((f) => f.path === 'script.js')?.content ?? '';
  if (!html.trim()) return files.filter((f) => !f.path.endsWith('.md'));

  const hasExternalCssLink = /<link[^>]+href=["']styles\.css/i.test(html);
  const hasInlineStyle = /<style[^>]*>[\s\S]{40,}<\/style>/i.test(html);
  if (!hasExternalCssLink && hasInlineStyle && !css.trim()) {
    return [{ path: 'index.html', content: html }];
  }

  return landingDeployFilesFromOutput(html, css, js);
}

async function deployToVercel(projectSlug: string, staticFiles: ProjectFile[]): Promise<PreviewDeployResult> {
  const vercelFiles = staticFiles.map((f) => ({ file: f.path, data: f.content }));
  const deployment = await deployStaticSite(projectSlug, vercelFiles);
  const deployUrl = await pollDeploymentReady(deployment.deploymentId, deployment.deployUrl);
  return {
    deployUrl,
    platform: 'vercel',
    vercelDeploymentId: deployment.deploymentId,
  };
}

async function deployToNetlifyPreview(projectSlug: string, staticFiles: ProjectFile[]): Promise<PreviewDeployResult> {
  const netlifyFiles = staticFiles.map((f) => ({ path: f.path, content: f.content }));
  const deployment = await deployToNetlify(projectSlug, netlifyFiles);
  const deployUrl = await pollNetlifyDeploy(deployment.deployId, deployment.deployUrl);
  return {
    deployUrl,
    platform: 'netlify',
    netlifyDeployId: deployment.deployId,
  };
}

/** Try Vercel first, then Netlify; verify URL before returning. Retries alternate platform on failure. */
export async function deployStaticPreview(
  projectSlug: string,
  files: ProjectFile[]
): Promise<{ deployUrl: string; platform: 'vercel' | 'netlify' | 'none'; deployVerified: boolean; vercelDeploymentId?: string; netlifyDeployId?: string }> {
  const staticFiles = hostingDeployFiles(files);
  const hasVercel = Boolean(getSecret('VERCEL_API_KEY'));
  const hasNetlify = Boolean(getSecret('NETLIFY_ACCESS_TOKEN'));

  const attempts: Array<{ name: string; run: () => Promise<PreviewDeployResult> }> = [];
  if (hasVercel) attempts.push({ name: 'vercel', run: () => deployToVercel(projectSlug, staticFiles) });
  if (hasNetlify) attempts.push({ name: 'netlify', run: () => deployToNetlifyPreview(projectSlug, staticFiles) });
  // If Netlify was first to fail verify, retry Vercel explicitly when both keys exist
  if (hasVercel && hasNetlify) {
    attempts.push({ name: 'vercel-retry', run: () => deployToVercel(projectSlug, staticFiles) });
  }

  for (const attempt of attempts) {
    try {
      const result = await attempt.run();
      const verified = await verifyLivePreviewUrl(result.deployUrl);
      if (verified) {
        console.info(`[githubDeploy] Live preview verified on ${result.platform}: ${result.deployUrl}`);
        return {
          deployUrl: result.deployUrl,
          platform: result.platform,
          deployVerified: true,
          vercelDeploymentId: result.vercelDeploymentId,
          netlifyDeployId: result.netlifyDeployId,
        };
      }
      console.warn(`[githubDeploy] ${attempt.name} URL failed verification: ${result.deployUrl}`);
    } catch (err) {
      console.warn(`[githubDeploy] ${attempt.name}:`, (err as Error).message);
    }
  }

  return { deployUrl: '', platform: 'none', deployVerified: false };
}

export interface PlatformDeployResult {
  deployUrl: string;
  deployVerified: boolean;
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
  error?: string;
}

/** Deploy to Vercel and Netlify when keys exist — returns both preview URLs. */
export async function deployToAllPlatforms(
  projectSlug: string,
  files: ProjectFile[]
): Promise<{
  vercel?: PlatformDeployResult;
  netlify?: PlatformDeployResult;
  deployUrl: string;
  deployPlatform: 'vercel' | 'netlify' | 'none';
  deployVerified: boolean;
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
  deployError?: string;
}> {
  const staticFiles = hostingDeployFiles(files);
  const hasVercel = Boolean(getSecret('VERCEL_API_KEY'));
  const hasNetlify = Boolean(getSecret('NETLIFY_ACCESS_TOKEN'));
  const errors: string[] = [];

  let vercel: PlatformDeployResult | undefined;
  let netlify: PlatformDeployResult | undefined;

  if (hasVercel) {
    try {
      const result = await deployToVercel(projectSlug, staticFiles);
      const verified = await verifyLivePreviewUrl(result.deployUrl);
      vercel = {
        deployUrl: result.deployUrl,
        deployVerified: verified,
        vercelDeploymentId: result.vercelDeploymentId,
      };
      if (!verified) errors.push('Vercel URL failed verification');
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`Vercel: ${msg.slice(0, 120)}`);
      vercel = { deployUrl: '', deployVerified: false, error: msg.slice(0, 240) };
    }
  } else {
    errors.push('Vercel: VERCEL_API_KEY not set on server');
    vercel = { deployUrl: '', deployVerified: false, error: 'VERCEL_API_KEY not configured on server' };
  }

  if (hasNetlify) {
    try {
      const result = await deployToNetlifyPreview(projectSlug, staticFiles);
      const verified = await verifyLivePreviewUrl(result.deployUrl);
      netlify = {
        deployUrl: result.deployUrl,
        deployVerified: verified,
        netlifyDeployId: result.netlifyDeployId,
      };
      if (!verified) errors.push('Netlify URL failed verification');
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`Netlify: ${msg.slice(0, 120)}`);
      netlify = { deployUrl: '', deployVerified: false, error: msg.slice(0, 240) };
    }
  } else {
    errors.push('Netlify: NETLIFY_ACCESS_TOKEN not set on server');
    netlify = { deployUrl: '', deployVerified: false, error: 'NETLIFY_ACCESS_TOKEN not configured on server' };
  }

  const primary =
    vercel?.deployVerified && vercel.deployUrl
      ? { url: vercel.deployUrl, platform: 'vercel' as const, id: vercel.vercelDeploymentId }
      : netlify?.deployVerified && netlify.deployUrl
        ? { url: netlify.deployUrl, platform: 'netlify' as const, id: netlify.netlifyDeployId }
        : vercel?.deployUrl
          ? { url: vercel.deployUrl, platform: 'vercel' as const, id: vercel.vercelDeploymentId }
          : netlify?.deployUrl
            ? { url: netlify.deployUrl, platform: 'netlify' as const, id: netlify.netlifyDeployId }
            : null;

  return {
    vercel,
    netlify,
    deployUrl: primary?.url ?? '',
    deployPlatform: primary?.platform ?? 'none',
    deployVerified: Boolean(vercel?.deployVerified || netlify?.deployVerified),
    vercelDeploymentId: vercel?.vercelDeploymentId,
    netlifyDeployId: netlify?.netlifyDeployId,
    deployError: primary ? undefined : errors.join(' · '),
  };
}

/** Deploy generated code directly to one platform (no GitHub required). */
export async function deployPreviewToPlatform(
  projectSlug: string,
  files: ProjectFile[],
  platform: 'vercel' | 'netlify'
): Promise<PlatformDeployResult> {
  const staticFiles = hostingDeployFiles(files);
  try {
    const result =
      platform === 'vercel'
        ? await deployToVercel(projectSlug, staticFiles)
        : await deployToNetlifyPreview(projectSlug, staticFiles);
    const verified = await verifyLivePreviewUrl(result.deployUrl);
    return {
      deployUrl: result.deployUrl,
      deployVerified: verified,
      vercelDeploymentId: result.vercelDeploymentId,
      netlifyDeployId: result.netlifyDeployId,
    };
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`[githubDeploy] ${platform} deploy:`, msg);
    return { deployUrl: '', deployVerified: false, error: msg.slice(0, 240) };
  }
}

/** Deploy from inline html/css/js — tries both platforms when requested. */
export async function deployPreviewFromSource(
  projectSlug: string,
  html: string,
  css: string,
  js: string,
  platform: 'vercel' | 'netlify' | 'both' = 'both'
): Promise<{
  vercel?: PlatformDeployResult;
  netlify?: PlatformDeployResult;
  files: ProjectFile[];
}> {
  const files = landingDeployFilesFromOutput(html, css, js);
  const out: { vercel?: PlatformDeployResult; netlify?: PlatformDeployResult; files: ProjectFile[] } = {
    files,
  };

  if (platform === 'vercel' || platform === 'both') {
    out.vercel = await deployPreviewToPlatform(projectSlug, files, 'vercel');
  }
  if (platform === 'netlify' || platform === 'both') {
    out.netlify = await deployPreviewToPlatform(projectSlug, files, 'netlify');
  }

  return out;
}

/** Push build files to GitHub, then optionally deploy. */
export async function pushBuildFromSource(
  userId: string,
  html: string,
  css: string,
  js: string,
  opts?: GitHubPushOptions
): Promise<GitHubPushResult> {
  const files = landingFilesFromOutput(html, css, js);
  return pushBuildToGitHub(userId, files, opts);
}

function parseRepoName(input: string): { owner: string; repo: string } {
  const trimmed = input.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '');
  const [owner, repo] = trimmed.split('/');
  if (!owner || !repo) throw new Error('Invalid GitHub repo name');
  return { owner, repo };
}

async function fetchRepoTextFile(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}/contents/${path}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (data.encoding !== 'base64' || !data.content) return null;
  return Buffer.from(data.content, 'base64').toString('utf8');
}

/** Pull build files from an existing GitHub repo (no rebuild required). */
export async function fetchBuildFilesFromGitHub(
  userId: string,
  repoName: string
): Promise<ProjectFile[]> {
  const integration = await getIntegration(userId);
  if (!integration?.access_token) throw new Error('GitHub not connected');

  const { owner, repo } = parseRepoName(repoName);
  const token = integration.access_token;

  const indexHtml = (await fetchRepoTextFile(token, owner, repo, 'index.html')) ?? '';
  const css = (await fetchRepoTextFile(token, owner, repo, 'styles.css')) ?? '';
  const js = (await fetchRepoTextFile(token, owner, repo, 'script.js')) ?? '';

  if (!indexHtml.trim()) throw new Error('No index.html found in GitHub repo');

  return [
    { path: 'index.html', content: indexHtml },
    { path: 'styles.css', content: css },
    { path: 'script.js', content: js },
  ];
}

export interface GitHubRepoAnalysis {
  repoName: string;
  defaultBranch: string;
  fileCount: number;
  topLevelEntries: string[];
  hasBuildFiles: boolean;
  languages: Record<string, number>;
  buildFiles: { html: string; css: string; js: string };
  treeSample: Array<{ path: string; size?: number }>;
  summary: string;
  techStack: string[];
  filesAnalyzed: number;
  totalLinesEstimate: number;
  report: string;
}

/** Full repository scan before builds — tree, languages, and core site files. */
export async function analyzeGitHubRepo(
  userId: string,
  repoName: string
): Promise<GitHubRepoAnalysis> {
  const integration = await getIntegration(userId);
  if (!integration?.access_token) throw new Error('GitHub not connected');

  const { owner, repo } = parseRepoName(repoName);
  const token = integration.access_token;

  const repoRes = await ghFetch(token, `/repos/${owner}/${repo}`);
  if (!repoRes.ok) throw new Error(`GitHub repo lookup failed: ${repoRes.status}`);
  const repoMeta = (await repoRes.json()) as { default_branch?: string; language?: string };
  const defaultBranch = repoMeta.default_branch ?? 'main';

  const langRes = await ghFetch(token, `/repos/${owner}/${repo}/languages`);
  const languages: Record<string, number> = langRes.ok ? ((await langRes.json()) as Record<string, number>) : {};

  let fileCount = 0;
  let treeSample: Array<{ path: string; size?: number }> = [];
  let topLevelEntries: string[] = [];

  const branchRes = await ghFetch(token, `/repos/${owner}/${repo}/branches/${encodeURIComponent(defaultBranch)}`);
  let treeSha: string | null = null;
  if (branchRes.ok) {
    const branchData = (await branchRes.json()) as { commit?: { commit?: { tree?: { sha?: string } } } };
    treeSha = branchData.commit?.commit?.tree?.sha ?? null;
  }

  if (treeSha) {
    const treeRes = await ghFetch(token, `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`);
    if (treeRes.ok) {
      const tree = (await treeRes.json()) as { tree?: Array<{ path: string; type: string; size?: number }> };
      const blobs = (tree.tree ?? []).filter((t) => t.type === 'blob');
      fileCount = blobs.length;
      treeSample = blobs.slice(0, 60).map((f) => ({ path: f.path, size: f.size }));
      topLevelEntries = [
        ...new Set(blobs.map((f) => f.path.split('/')[0]).filter((e): e is string => Boolean(e))),
      ].slice(0, 24);
    }
  }

  let buildFiles = { html: '', css: '', js: '' };
  let hasBuildFiles = false;
  try {
    const files = await fetchBuildFilesFromGitHub(userId, repoName);
    hasBuildFiles = true;
    buildFiles = {
      html: files.find((f) => f.path === 'index.html')?.content ?? '',
      css: files.find((f) => f.path === 'styles.css')?.content ?? '',
      js: files.find((f) => f.path === 'script.js')?.content ?? '',
    };
  } catch {
    /* repo may not have static build files yet */
  }

  const paths = treeSample.map((f) => f.path);
  const techStack: string[] = [];
  if (paths.some((p) => p === 'package.json' || p.endsWith('/package.json'))) techStack.push('Node.js / npm');
  if (paths.some((p) => /next\.config/i.test(p))) techStack.push('Next.js');
  if (paths.some((p) => /tailwind\.config/i.test(p))) techStack.push('Tailwind CSS');
  if (paths.some((p) => p.includes('supabase') || p.includes('migrations'))) techStack.push('Supabase');
  if (paths.some((p) => p === 'index.html')) techStack.push('Static HTML/CSS/JS');
  if (paths.some((p) => /\.tsx?$/.test(p))) techStack.push('TypeScript');
  if (techStack.length === 0) techStack.push('Fresh project (scaffold on build)');

  const criticalPaths = [
    'package.json',
    'next.config.js',
    'next.config.ts',
    'tailwind.config.js',
    'app/layout.tsx',
    'app/page.tsx',
    'index.html',
    'styles.css',
    'script.js',
    'README.md',
  ];
  const filesAnalyzed = criticalPaths.filter((cp) => paths.some((p) => p === cp || p.endsWith(`/${cp}`))).length
    + Math.min(paths.length, 40);
  const totalLinesEstimate = treeSample.reduce((sum, f) => sum + Math.ceil((f.size ?? 200) / 40), 0);

  const langList = Object.keys(languages).slice(0, 6).join(', ') || repoMeta.language || 'Unknown';
  const summary = hasBuildFiles
    ? `Repository ${repoName} (${defaultBranch}): ${fileCount} files. Static site detected. Stack: ${techStack.join(', ')}. Languages: ${langList}.`
    : `Repository ${repoName} (${defaultBranch}): ${fileCount} files. Stack: ${techStack.join(', ')}. Languages: ${langList}.`;

  const report = [
    `# Repository Analysis: ${repoName}`,
    `- Branch: ${defaultBranch}`,
    `- Total files: ${fileCount}`,
    `- Files analyzed: ${filesAnalyzed}`,
    `- Estimated lines: ~${totalLinesEstimate.toLocaleString()}`,
    `- Tech stack: ${techStack.join(', ')}`,
    `- Languages: ${langList}`,
    hasBuildFiles ? '- Build files: index.html, styles.css, script.js ✓' : '- Build files: none yet (fresh build)',
  ].join('\n');

  return {
    repoName,
    defaultBranch,
    fileCount,
    topLevelEntries,
    hasBuildFiles,
    languages,
    buildFiles,
    treeSample,
    summary,
    techStack,
    filesAnalyzed,
    totalLinesEstimate,
    report,
  };
}

/** Redeploy live preview from code already on GitHub — Vercel preferred, Netlify fallback. */
export async function redeployPreviewFromGitHub(
  userId: string,
  repoName: string
): Promise<{
  deployUrl: string;
  deployPlatform: 'vercel' | 'netlify' | 'none';
  deployVerified: boolean;
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
  files: ProjectFile[];
}> {
  const files = await fetchBuildFilesFromGitHub(userId, repoName);
  const slug = repoName.split('/').pop()?.replace(/^xroga-/, '') ?? 'xroga-build';
  const preview = await deployStaticPreview(slug, files);
  return {
    deployUrl: preview.deployUrl,
    deployPlatform: preview.platform,
    deployVerified: preview.deployVerified,
    vercelDeploymentId: preview.vercelDeploymentId,
    netlifyDeployId: preview.netlifyDeployId,
    files,
  };
}

/** Push to GitHub then deploy to Vercel (preferred) or Netlify — only returns URL when verified live. */
export async function pushAndDeployLivePreview(
  userId: string,
  files: ProjectFile[],
  projectSlug: string,
  githubTarget?: { targetRepo?: string; targetBranch?: string }
): Promise<DeployPipelineResult> {
  const github = await pushBuildToGitHub(userId, files, {
    slug: projectSlug,
    targetRepo: githubTarget?.targetRepo,
    targetBranch: githubTarget?.targetBranch,
  });
  const preview = await deployToAllPlatforms(projectSlug, files);
  return {
    github,
    deployUrl: preview.deployUrl,
    deployPlatform: preview.deployPlatform,
    deployVerified: preview.deployVerified,
    vercelDeploymentId: preview.vercelDeploymentId,
    netlifyDeployId: preview.netlifyDeployId,
    vercelPreviewUrl: preview.vercel?.deployUrl,
    netlifyPreviewUrl: preview.netlify?.deployUrl,
    vercel: preview.vercel,
    netlify: preview.netlify,
    deployError: preview.deployError,
  };
}
