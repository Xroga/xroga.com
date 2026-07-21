/**
 * Sync Electron code-signing secrets into the user's GitHub repo
 * so Actions can produce signed installers when certs exist.
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
  // GitHub requires libsodium seal — use Actions public key + tweetnacl-style encrypt.
  // Without sodium in deps, fall back to documenting failure honestly.
  try {
    const { createPublicKey, publicEncrypt, constants } = await import('crypto');
    // GitHub uses libsodium sealed box, NOT RSA — Node crypto cannot seal for Actions.
    // Use NaCl if available via dynamic import of 'libsodium-wrappers' — may not be installed.
    let sodiumMod: typeof import('libsodium-wrappers') | null = null;
    try {
      sodiumMod = await import('libsodium-wrappers');
    } catch {
      sodiumMod = null;
    }
    if (!sodiumMod) {
      void createPublicKey;
      void publicEncrypt;
      void constants;
      console.warn(
        '[electronSecrets] libsodium-wrappers not installed — cannot encrypt GitHub Actions secrets',
      );
      return false;
    }
    await sodiumMod.ready;
    const sodium = sodiumMod;

    const keyRes = await fetch(
      `https://api.github.com/repos/${opts.owner}/${opts.repo}/actions/secrets/public-key`,
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
      `https://api.github.com/repos/${opts.owner}/${opts.repo}/actions/secrets/${encodeURIComponent(opts.name)}`,
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
    return put.status === 201 || put.status === 204 || put.ok;
  } catch (err) {
    console.warn('[electronSecrets]', (err as Error).message);
    return false;
  }
}

function splitRepo(fullName: string): { owner: string; repo: string } | null {
  const parts = fullName.replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '').split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
}

/** Push CSC_LINK / CSC_KEY_PASSWORD from vault → GitHub Actions secrets when present. */
export async function syncElectronSigningSecretsToGitHub(opts: {
  userId: string;
  repoFullName: string;
}): Promise<{ ok: boolean; synced: string[]; message: string }> {
  const token = await getGitHubToken(opts.userId);
  if (!token) return { ok: false, synced: [], message: 'GitHub not connected' };
  const parsed = splitRepo(opts.repoFullName);
  if (!parsed) return { ok: false, synced: [], message: 'Invalid repo' };

  const cscLink = await getUserProviderKey(opts.userId, 'electron_csc_link');
  const cscPass = await getUserProviderKey(opts.userId, 'electron_csc_password');
  if (!cscLink) {
    return {
      ok: true,
      synced: [],
      message:
        'No code-signing cert in vault — Actions will produce unsigned installers (Linux/Windows). Add CSC_LINK for signed builds.',
    };
  }

  const synced: string[] = [];
  const linkOk = await putRepoSecret({
    token,
    owner: parsed.owner,
    repo: parsed.repo,
    name: 'CSC_LINK',
    value: cscLink,
  });
  if (linkOk) synced.push('CSC_LINK');
  if (cscPass) {
    const passOk = await putRepoSecret({
      token,
      owner: parsed.owner,
      repo: parsed.repo,
      name: 'CSC_KEY_PASSWORD',
      value: cscPass,
    });
    if (passOk) synced.push('CSC_KEY_PASSWORD');
  }

  if (!synced.length) {
    return {
      ok: false,
      synced: [],
      message:
        'Could not write GitHub Actions secrets (needs libsodium + repo secrets permission). Unsigned installers still build.',
    };
  }
  return {
    ok: true,
    synced,
    message: `Synced ${synced.join(', ')} to GitHub Actions secrets for signed desktop builds.`,
  };
}
