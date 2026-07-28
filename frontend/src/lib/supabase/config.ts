const APPROVED_PROJECT_REF = 'nzenxdfumxrnsmybazmo';
const APPROVED_PUBLIC_URL = `https://${APPROVED_PROJECT_REF}.supabase.co`;

function legacyRole(key: string): string | null {
  if (!key.includes('.')) return null;
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = globalThis.atob(payload);
    return JSON.parse(json).role ?? null;
  } catch { return null; }
}

export function getSupabasePublicConfig(): { url: string; publishableKey: string; projectRef: string } {
  // Xroga has one approved production auth project. Keep its public endpoint
  // canonical so a stale hosting variable cannot redirect browser credentials
  // to a different Supabase project. The publishable key remains configurable
  // for rotation and is validated below.
  const url = APPROVED_PUBLIC_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  if (!publishableKey) throw new Error('Supabase public configuration is missing');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Supabase public URL is invalid'); }
  const projectRef = parsed.hostname.split('.')[0];
  if (parsed.protocol !== 'https:' || parsed.hostname !== `${APPROVED_PROJECT_REF}.supabase.co`) throw new Error('Supabase public URL does not match the approved project');
  if (publishableKey.startsWith('sb_secret_') || legacyRole(publishableKey) === 'service_role') throw new Error('A server credential was supplied to the browser configuration');
  if (!publishableKey.startsWith('sb_publishable_') && legacyRole(publishableKey) !== 'anon') throw new Error('Supabase publishable key is invalid');
  return { url: parsed.origin, publishableKey, projectRef };
}
