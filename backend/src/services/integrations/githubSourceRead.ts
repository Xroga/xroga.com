import { getSupabaseAdmin } from '../../config/supabase.js';
import { getGitHubToken } from './githubAuth.js';

/** A source-read lifetime, using the canonical vault consumer and authority row.
 * This is not write authority. A changed revision invalidates the entire snapshot,
 * even when a reconnect issued the same plaintext token. */
export async function createGitHubSourceReader(userId: string, token: string, repository: string) {
  if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(repository) || /^\.+$/.test(repository.split('/')[1])) throw new Error('Invalid GitHub repository target');
  const lifetime = new AbortController();
  let invalidated = false;
  const denied = () => {
    invalidated = true;
    lifetime.abort();
    return new Error('GitHub source authorization changed. Reconnect and reload the project.');
  };
  const authority = async () => {
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
    if (_token !== token || (init?.method && init.method !== 'GET') || init?.body
      || !path.startsWith(`/repos/${repository}/`) && path !== `/repos/${repository}`
      || /[\\\r\n]/.test(path) || /(?:^|\/)\.\.?(?:\/|$)/.test(path.split('?')[0])) throw denied();
    await assertCurrent();
    const response = await fetch(`https://api.github.com${path}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(30_000), ...(init?.signal ? [init.signal] : [])]),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (response.status === 401 || response.status === 403) {
      void response.body?.cancel().catch(() => undefined);
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
