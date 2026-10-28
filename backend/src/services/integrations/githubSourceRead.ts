import {requireTenantContext,requireResourceOwner,type TenantContext} from '../../security/tenantContext.js';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { getGitHubToken } from './githubAuth.js';
import {containsCredentialSecretText} from '../../security/egress/dataClassification.js';
import { publicHttpsUrl } from '../../security/egress/urlPolicy.js';

class GitHubSourceDenied extends Error {
  readonly code = 'CAPABILITY_AUTH_REQUIRED';
  readonly retryable = false;
  constructor() { super('GitHub source authorization changed. Reconnect and reload the project.'); }
}

/** A source-read lifetime, using the canonical vault consumer and authority row.
 * This is not write authority. A changed revision invalidates the entire snapshot,
 * even when a reconnect issued the same plaintext token. */
export async function createGitHubSourceReader(userId: string, token: string, repository: string, tenantContext?: TenantContext) {
  const context=requireTenantContext(tenantContext);requireResourceOwner(context,userId);
  if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(repository) || /^\.+$/.test(repository.split('/')[1])) throw new Error('Invalid GitHub repository target');
  const lifetime = new AbortController();
  let invalidated = false;
  const denied = () => {
    invalidated = true;
    lifetime.abort();
    return new GitHubSourceDenied();
  };
  const authority = async () => {
    requireResourceOwner(context,userId);
    const { data, error } = await getSupabaseAdmin().from('user_integrations')
      .select('user_id,provider,access_token,credential_revision,metadata')
      .eq('user_id', userId).eq('provider', 'github').maybeSingle();
    if (error || data?.user_id !== userId || data?.provider !== 'github' || !data.access_token
      || data.metadata?.revoked === true) throw denied();
    return JSON.stringify([data.access_token, data.credential_revision, data.metadata?.vault_revision]);
  };
  const selected = await authority();
  const assertCurrent = async () => {
    if (invalidated || await getGitHubToken(userId) !== token || await authority() !== selected || invalidated) throw denied();
  };
  await assertCurrent();
  const request = async (_token: string, path: string, init?: RequestInit): Promise<Response> => {
    if (_token !== token || typeof path !== 'string' || Buffer.byteLength(path)>8192 || (init?.method && init.method !== 'GET') || init?.body
      || !path.startsWith(`/repos/${repository}/`) && path !== `/repos/${repository}`
      || /[\\\r\n]/.test(path) || /(?:^|\/)\.\.?(?:\/|$)/.test(path.split('?')[0])) throw denied();
    // Validate both serialized and decoded paths. URL normalization and encoded
    // separators must not move a credential-bearing read outside its repository.
    const destination = `https://api.github.com${path}`;
    try {
      const url = publicHttpsUrl(destination);
      const decoded = decodeURIComponent(url.pathname);
      const selectedForms=new Set([token,encodeURIComponent(token),Buffer.from(token).toString('base64'),Buffer.from(token).toString('base64url'),JSON.stringify(token).slice(1,-1)]);
      if(containsCredentialSecretText(path)||containsCredentialSecretText(decoded)
        || token.length>=8&&[...selectedForms].some(value=>path.includes(value)||decoded.includes(value)))throw denied();
      if (url.href !== destination || url.origin !== 'https://api.github.com' || url.hash
        || /(?:^|\/)\.\.?(?:\/|$)/.test(decoded)
        || !decoded.startsWith(`/repos/${repository}/`) && decoded !== `/repos/${repository}`) throw denied();
    } catch { throw denied(); }
    const signal = init?.signal;
    if (signal?.aborted) throw denied();
    await assertCurrent();
    if (signal?.aborted || invalidated) throw denied();
    const response = await fetch(destination, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (signal?.aborted || response.redirected || response.status >= 300 && response.status < 400 || response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      throw denied();
    }
    // Finish and validate the body before exposing it to a parser or caller.
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body?.getReader();
    try {
      if (reader) for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16 * 1024 * 1024) throw new Error('GitHub source response exceeds the safe read limit');
        chunks.push(value);
      }
      await assertCurrent();
      if (signal?.aborted) throw denied();
      return new Response(size ? Buffer.concat(chunks) : null, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      invalidated = true;
      lifetime.abort();
      await reader?.cancel().catch(() => undefined);
      throw error;
    } finally { reader?.releaseLock(); }
  };
  return { request, assertCurrent };
}
