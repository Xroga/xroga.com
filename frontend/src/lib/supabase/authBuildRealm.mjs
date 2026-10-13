export const productionAuthProject = 'nzenxdfumxrnsmybazmo';

/** Build-only, server-side admission. This chooses a test issuer, never user privilege. */
/** @param {Record<string, string | undefined>} environment */
export function resolveAuthBuildRealm(environment = process.env) {
  if (environment.XROGA_ISOLATED_AUTH_BUILD !== '1') return productionAuthProject;
  const reference = environment.E2E_ISOLATED_PROJECT_REF?.trim();
  if (environment.CI !== 'true' || environment.VERCEL_ENV === 'production' || !/^[a-z]{20}$/.test(reference ?? '') || [productionAuthProject, 'lztqfktsahpzitybthld'].includes(reference)) {
    throw new Error('Isolated auth build requires an approved non-production CI test realm');
  }
  if (environment.NEXT_PUBLIC_SUPABASE_URL !== `https://${reference}.supabase.co` || environment.SUPABASE_URL !== environment.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Isolated auth build URLs must match the approved test realm');
  }
  return reference;
}
