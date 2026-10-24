/**
 * Sync Electron code-signing + macOS notarization secrets into the user's
 * GitHub repo so Actions can produce signed / notarized installers when certs exist.
 */

import { getGitHubToken } from '../integrations/githubAuth.js';
import { getUserProviderKey } from '../integrations/userProviderKeys.js';

async function putRepoSecret(opts: {
  token: string;
  owner: string;
  repo: string;
  name: string;
  value: string;
}): Promise<boolean> {
  // GitHub requires libsodium sealed box — Node RSA cannot encrypt Actions secrets.
  try {
    let sodiumMod: typeof import('libsodium-wrappers') | null = null;
    try {
      const imported = await import('libsodium-wrappers');
      sodiumMod = imported.default ?? imported;
    } catch {
      sodiumMod = null;
    }
    if (!sodiumMod) {
      console.warn(
        '[electronSecrets] libsodium-wrappers not installed — cannot encrypt GitHub Actions secrets',
      );
      return false;
    }
    await sodiumMod.ready;
    const sodium = sodiumMod;

    const keyRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(opts.owner)}/${encodeURIComponent(opts.repo)}/actions/secrets/public-key`,
      {
        headers: {
          Authorization: `Bearer ${opts.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (!keyRes.ok) return false;
    const keyData = (await keyRes.json()) as { key: string; key_id: string };
    const binKey = sodium.from_base64(keyData.key, sodium.base64_variants.ORIGINAL);
    const messageBytes = Buffer.from(opts.value);
    const encryptedBytes = sodium.crypto_box_seal(messageBytes, binKey);
    const encrypted = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

    const put = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(opts.owner)}/${encodeURIComponent(opts.repo)}/actions/secrets/${encodeURIComponent(opts.name)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${opts.token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ encrypted_value: encrypted, key_id: keyData.key_id }),
      },
    );
    return put.status === 201 || put.status === 204;
  } catch (err) {
    console.warn('[electronSecrets] GitHub secret sync failed');
    return false;
  }
}

export function parseElectronSecretRepository(fullName: string): { owner: string; repo: string } | null {
  if (typeof fullName !== 'string' || fullName !== fullName.trim()) return null;
  const parts = fullName.replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '').split('/');
  if (parts.length !== 2) return null;
  const owner = parts[0]!, repo = parts[1]!.replace(/\.git$/, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)
    || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo };
}

/**
 * Push CSC_* and optional Apple notarization secrets from vault → GitHub Actions.
 * Unsigned Linux/Windows installers still build when CSC is absent.
 */
export async function syncElectronSigningSecretsToGitHub(opts: {
  userId: string;
  repoFullName: string;
}): Promise<{ ok: boolean; synced: string[]; message: string }> {
  const parsed = parseElectronSecretRepository(opts.repoFullName);
  if (!parsed) return { ok: false, synced: [], message: 'Invalid repo' };
  const token = await getGitHubToken(opts.userId);
  if (!token) return { ok: false, synced: [], message: 'GitHub not connected' };

  const cscLink = await getUserProviderKey(opts.userId, 'electron_csc_link');
  const cscPass = await getUserProviderKey(opts.userId, 'electron_csc_password');
  const appleId = await getUserProviderKey(opts.userId, 'electron_apple_id');
  const applePass = await getUserProviderKey(opts.userId, 'electron_apple_password');
  const appleTeam = await getUserProviderKey(opts.userId, 'electron_apple_team_id');

  if (!cscLink && !appleId && !applePass && !appleTeam) {
    return {
      ok: true,
      synced: [],
      message:
        'No code-signing or notarization secrets in vault — Actions will produce unsigned installers (Linux/Windows). Add CSC_LINK / Apple ID in Publish for signed macOS builds.',
    };
  }

  const synced: string[] = [];
  const failed: string[] = [];

  async function trySync(name: string, value: string | null) {
    if (!value?.trim()) return;
    const ok = await putRepoSecret({
      token: token!,
      owner: parsed!.owner,
      repo: parsed!.repo,
      name,
      value: value.trim(),
    });
    if (ok) synced.push(name);
    else failed.push(name);
  }

  await trySync('CSC_LINK', cscLink);
  await trySync('CSC_KEY_PASSWORD', cscPass);
  await trySync('APPLE_ID', appleId);
  await trySync('APPLE_APP_SPECIFIC_PASSWORD', applePass);
  await trySync('APPLE_TEAM_ID', appleTeam);

  if (!synced.length) {
    return {
      ok: false,
      synced: [],
      message:
        'Could not write GitHub Actions secrets (needs libsodium + repo secrets permission). Unsigned installers still build.',
    };
  }

  const parts = [`Synced ${synced.join(', ')} to GitHub Actions secrets`];
  if (failed.length) parts.push(`failed: ${failed.join(', ')}`);
  if (cscLink && appleId && applePass && appleTeam) {
    parts.push('macOS notarization env is set for electron-builder');
  } else if (cscLink) {
    parts.push('signing cert synced — add Apple ID + app-specific password + Team ID for notarization');
  } else if (appleId || applePass || appleTeam) {
    parts.push('notarization secrets synced — add CSC_LINK for code signing');
  }

  return {
    ok: failed.length === 0,
    synced,
    message: `${parts.join('. ')}.`,
  };
}
