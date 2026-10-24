import { validateStagingManifest } from '../../../../scripts/security/staging-preflight.mjs';
export const productionAuthProject = 'nzenxdfumxrnsmybazmo';
export const localAuthProject = 'local-disposable';
export const localAuthUrl = 'http://127.0.0.1:54321';
export const stagingAuthProject = 'self-hosted-staging';

/** Build-only, server-side admission. This chooses a test issuer, never user privilege. */
/**
 * @param {Record<string, string | undefined>} environment
 * @param {unknown} stagingManifest
 */
export function resolveAuthBuildRealm(environment = process.env, stagingManifest = undefined) {
  if(environment.XROGA_STAGING_AUTH_BUILD==='1') {
    if(environment.CI!=='true'||environment.VERCEL_ENV!=='preview'||environment.XROGA_DEPLOYMENT_ENVIRONMENT!=='staging'||environment.XROGA_ISOLATED_AUTH_BUILD==='1')throw new Error('Staging auth requires an explicit non-production build');
    const reviewed=validateStagingManifest(stagingManifest);
    const sha=environment.XROGA_RELEASE_SHA??environment.VERCEL_GIT_COMMIT_SHA;
    if(sha!==reviewed.sourceSha || environment.SUPABASE_URL!==reviewed.auth.origin || environment.NEXT_PUBLIC_SUPABASE_URL!==reviewed.auth.origin || environment.NEXT_PUBLIC_API_URL!==reviewed.api.origin || environment.FRONTEND_URL!==reviewed.web.origin)throw new Error('Staging auth must match the exact reviewed environment and revision');
    return stagingAuthProject;
  }
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

/** Next configuration compiles public origin only; the review file/flags remain server build inputs. */
/**
 * @param {Record<string, string | undefined>} environment
 * @param {unknown} stagingManifest
 */
export function resolveAuthBuildConfiguration(environment=process.env,stagingManifest=undefined) {
  const projectRef=resolveAuthBuildRealm(environment,stagingManifest);
  return {projectRef,url:projectRef===localAuthProject?localAuthUrl:projectRef===stagingAuthProject?validateStagingManifest(stagingManifest).auth.origin:`https://${projectRef}.supabase.co`};
}
