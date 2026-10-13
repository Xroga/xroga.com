const APPROVED_PROJECT_REF = process.env.NEXT_PUBLIC_XROGA_AUTH_PROJECT_REF || 'nzenxdfumxrnsmybazmo';
const LOCAL_BUILD = APPROVED_PROJECT_REF === 'local-disposable';
const APPROVED_PUBLIC_URL = LOCAL_BUILD ? 'http://127.0.0.1:54321' : `https://${APPROVED_PROJECT_REF}.supabase.co`;

function legacyRole(key: string): string | null {
  if (!key.includes('.')) return null;
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = globalThis.atob(payload);
    return JSON.parse(json).role ?? null;
  } catch { return null; }
}

export function getSupabasePublicConfig(): { url: string; publishableKey: string; projectRef: string } {
  // next.config validates a build-only isolated CI realm; production remains pinned.
  // Keep the selected build's public endpoint
  // canonical so a stale hosting variable cannot redirect browser credentials
  // to a different Supabase project. The publishable key remains configurable
  // for rotation and is validated below.
  const url = APPROVED_PUBLIC_URL;
  if (!LOCAL_BUILD && !/^[a-z]{20}$/.test(APPROVED_PROJECT_REF)) throw new Error('Supabase public URL does not match the approved project');
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  if (!publishableKey) throw new Error('Supabase public configuration is missing');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Supabase public URL is invalid'); }
  const projectRef = APPROVED_PROJECT_REF;
  if (LOCAL_BUILD ? parsed.origin !== 'http://127.0.0.1:54321' : (parsed.protocol !== 'https:' || parsed.hostname !== `${APPROVED_PROJECT_REF}.supabase.co`)) throw new Error('Supabase public URL does not match the approved project');
  if (publishableKey.startsWith('sb_secret_') || legacyRole(publishableKey) === 'service_role') throw new Error('A server credential was supplied to the browser configuration');
  if (!publishableKey.startsWith('sb_publishable_') && legacyRole(publishableKey) !== 'anon') throw new Error('Supabase publishable key is invalid');
  return { url: parsed.origin, publishableKey, projectRef };
}
