/**
 * Free-path ship helpers for Chrome / Electron (not store automation).
 * Uses the user's GitHub token after sticky push.
 */

import { getGitHubToken } from '../integrations/githubAuth.js';
import type { ProjectFile } from '../integrations/githubDeploy.js';
import { chromeExtensionZipFilter, packageBuildZip } from '../scaffolds/packageBuildZip.js';

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

function splitRepo(fullName: string): { owner: string; repo: string } | null {
  const parts = fullName.replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '').split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
}

export type ChromeZipShipResult = {
  ok: boolean;
  downloadUrl?: string;
  releaseUrl?: string;
  tag?: string;
  error?: string;
};

/**
 * Package Chrome MV3 files into a zip and attach as a GitHub Release asset.
 * Free path: user downloads zip → sideload or upload to CWS (they pay ~$5).
 */
export async function shipChromeExtensionZip(opts: {
  userId: string;
  repoFullName: string;
  files: ProjectFile[];
  version?: string;
}): Promise<ChromeZipShipResult> {
  const token = await getGitHubToken(opts.userId);
  if (!token) return { ok: false, error: 'GitHub not connected' };
  const parsed = splitRepo(opts.repoFullName);
  if (!parsed) return { ok: false, error: 'Invalid repo name' };

  const zip = packageBuildZip(opts.files, { include: chromeExtensionZipFilter });
  if (zip.length < 64) return { ok: false, error: 'Zip empty — missing extension files' };

  const tag = opts.version?.startsWith('v') ? opts.version : `v${opts.version || '1.0.0'}-extension`;
  const { owner, repo } = parsed;

  // Create or reuse release
  let releaseId: number | null = null;
  let uploadUrl: string | null = null;
  let htmlUrl: string | undefined;

  const existing = await ghFetch(token, `/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  if (existing.ok) {
    const data = (await existing.json()) as {
      id: number;
      upload_url?: string;
      html_url?: string;
    };
    releaseId = data.id;
    uploadUrl = data.upload_url ?? null;
    htmlUrl = data.html_url;
  } else {
    const created = await ghFetch(token, `/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag,
        name: `Chrome extension ${tag}`,
        body: 'Sideload zip packaged by Xroga. Load unpacked from the repo, or download this zip for Chrome Web Store (~$5 on your account).',
        draft: false,
        prerelease: false,
      }),
    });
    if (!created.ok) {
      const err = await created.text();
      return { ok: false, error: `Could not create release: ${err.slice(0, 200)}` };
    }
    const data = (await created.json()) as {
      id: number;
      upload_url?: string;
      html_url?: string;
    };
    releaseId = data.id;
    uploadUrl = data.upload_url ?? null;
    htmlUrl = data.html_url;
  }

  if (!uploadUrl || !releaseId) {
    return { ok: false, error: 'Release missing upload URL', releaseUrl: htmlUrl };
  }

  // upload_url looks like .../assets{?name,label}
  const assetUrl = `${uploadUrl.replace(/\{[^}]*\}/, '')}?name=${encodeURIComponent('extension.zip')}`;

  // Delete existing extension.zip asset if re-shipping same tag
  const assetsRes = await ghFetch(token, `/repos/${owner}/${repo}/releases/${releaseId}/assets`);
  if (assetsRes.ok) {
    const assets = (await assetsRes.json()) as Array<{ id: number; name: string }>;
    const old = assets.find((a) => a.name === 'extension.zip');
    if (old) {
      await ghFetch(token, `/repos/${owner}/${repo}/releases/assets/${old.id}`, { method: 'DELETE' });
    }
  }

  const upload = await fetch(assetUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/zip',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: zip,
  });

  if (!upload.ok) {
    const err = await upload.text();
    return {
      ok: false,
      error: `Zip upload failed: ${err.slice(0, 200)}`,
      releaseUrl: htmlUrl,
      tag,
    };
  }

  const asset = (await upload.json()) as { browser_download_url?: string; url?: string };
  return {
    ok: true,
    tag,
    releaseUrl: htmlUrl,
    downloadUrl: asset.browser_download_url || htmlUrl,
  };
}

export type DesktopReleaseResult = {
  ok: boolean;
  tag?: string;
  actionsUrl?: string;
  releasesUrl?: string;
  error?: string;
};

/**
 * Create a v* tag (triggers Desktop release workflow) or workflow_dispatch fallback.
 * Free path: unsigned zip on GitHub Releases when Actions finishes.
 */
export async function triggerElectronDesktopRelease(opts: {
  userId: string;
  repoFullName: string;
  commitSha?: string;
  version?: string;
}): Promise<DesktopReleaseResult> {
  const token = await getGitHubToken(opts.userId);
  if (!token) return { ok: false, error: 'GitHub not connected' };
  const parsed = splitRepo(opts.repoFullName);
  if (!parsed) return { ok: false, error: 'Invalid repo name' };
  const { owner, repo } = parsed;

  const tag = opts.version?.startsWith('v') ? opts.version : `v${opts.version || '1.0.0'}`;
  const releasesUrl = `https://github.com/${owner}/${repo}/releases`;
  const actionsUrl = `https://github.com/${owner}/${repo}/actions`;

  // Resolve SHA for the tag
  let sha = opts.commitSha;
  if (!sha) {
    const ref = await ghFetch(token, `/repos/${owner}/${repo}/git/ref/heads/main`);
    if (ref.ok) {
      const data = (await ref.json()) as { object?: { sha?: string } };
      sha = data.object?.sha;
    }
    if (!sha) {
      const master = await ghFetch(token, `/repos/${owner}/${repo}/git/ref/heads/master`);
      if (master.ok) {
        const data = (await master.json()) as { object?: { sha?: string } };
        sha = data.object?.sha;
      }
    }
  }
  if (!sha) return { ok: false, error: 'No commit SHA to tag', actionsUrl, releasesUrl };

  // Create annotated tag object + ref (idempotent-ish: if tag exists, try dispatch)
  const tagObj = await ghFetch(token, `/repos/${owner}/${repo}/git/tags`, {
    method: 'POST',
    body: JSON.stringify({
      tag,
      message: `Xroga desktop release ${tag}`,
      object: sha,
      type: 'commit',
    }),
  });

  if (tagObj.ok) {
    const tagData = (await tagObj.json()) as { sha?: string };
    const refRes = await ghFetch(token, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/tags/${tag}`,
        sha: tagData.sha || sha,
      }),
    });
    if (refRes.ok || refRes.status === 422) {
      // 422 = ref already exists — still OK for user
      return { ok: true, tag, actionsUrl, releasesUrl };
    }
  }

  // Fallback: workflow_dispatch on release.yml
  const dispatch = await ghFetch(token, `/repos/${owner}/${repo}/actions/workflows/release.yml/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'main' }),
  });
  if (dispatch.status === 204 || dispatch.ok) {
    return { ok: true, tag, actionsUrl, releasesUrl };
  }

  // Try master ref for dispatch
  const dispatchMaster = await ghFetch(
    token,
    `/repos/${owner}/${repo}/actions/workflows/release.yml/dispatches`,
    {
      method: 'POST',
      body: JSON.stringify({ ref: 'master' }),
    },
  );
  if (dispatchMaster.status === 204 || dispatchMaster.ok) {
    return { ok: true, tag, actionsUrl, releasesUrl };
  }

  const err = await dispatch.text().catch(() => '');
  return {
    ok: false,
    tag,
    actionsUrl,
    releasesUrl,
    error: `Could not tag or dispatch release: ${err.slice(0, 180) || 'check Actions permissions'}`,
  };
}
