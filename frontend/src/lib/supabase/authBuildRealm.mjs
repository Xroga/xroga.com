export const productionAuthProject = 'nzenxdfumxrnsmybazmo';
export const localAuthProject = 'local-disposable';
export const localAuthUrl = 'http://127.0.0.1:54321';

/** Build-only, server-side admission. This chooses a test issuer, never user privilege. */
/** @param {Record<string, string | undefined>} environment */
export function resolveAuthBuildRealm(environment = process.env) {
  if (environment.XROGA_ISOLATED_AUTH_BUILD !== '1') return productionAuthProject;
  const reference = environment.E2E_ISOLATED_PROJECT_REF?.trim();
  if (reference === localAuthProject) {
    if (environment.CI !== 'true' || environment.VERCEL_ENV === 'production' || environment.XB01_DISPOSABLE_SUPABASE !== '1' || environment.NEXT_PUBLIC_SUPABASE_URL !== localAuthUrl || environment.SUPABASE_URL !== localAuthUrl) {
      throw new Error('Isolated auth build requires the disposable loopback Supabase stack');
    }
    return localAuthProject;
  }
  if (environment.CI !== 'true' || environment.VERCEL_ENV === 'production' || !/^[a-z]{20}$/.test(reference ?? '') || [productionAuthProject, 'lztqfktsahpzitybthld'].includes(reference)) {
    throw new Error('Isolated auth build requires an approved non-production CI test realm');
  }
  if (environment.NEXT_PUBLIC_SUPABASE_URL !== `https://${reference}.supabase.co` || environment.SUPABASE_URL !== environment.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Isolated auth build URLs must match the approved test realm');
  }
  return reference;
}
