// Source-reviewed resources for the managed Workspace staging topology.
export const stagingProject = 'project-c40d4821-e647-4fa2-92d';
export const stagingRegion = 'us-east4';
export const stagingAuthRef = 'dqxnatoessviphudbhei';
export const stagingAuthOrigin = `https://${stagingAuthRef}.supabase.co`;
export const stagingApiAudience = 'https://xroga-api-universal-staging-422lt7eujq-uk.a.run.app';
export const stagingWebService = 'xroga-workspace-openui-staging';
export const stagingWebOrigin = `https://${stagingWebService}-574998934848.${stagingRegion}.run.app`;
export const stagingOperatorOrigin = 'http://localhost:3217';
export const stagingWebIdentity = `${stagingWebService}@${stagingProject}.iam.gserviceaccount.com`;
const repository = `${stagingRegion}-docker.pkg.dev/${stagingProject}/cloud-run-source-deploy`;
const researchConfirmationPath = /^(\/api\/phase1\/business-actions\/confirmations\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(\/confirm)?$/i;

/** @param {string} path @param {string} method */
export function hostedResearchConfirmation(path, method) {
  const match = researchConfirmationPath.exec(path);
  return match && (match[2] ? method === 'POST' : method === 'GET') ? match[1] : null;
}

/** @type {Array<[RegExp, string[]]>} */
const routes = [
  [/^\/api\/phase1\/(?:plan|chat)$/, ['POST']],
  [/^\/api\/phase1\/(?:usage|economics)$/, ['GET']],
  [/^\/api\/message-shares$/, ['POST']],
  [/^\/api\/message-shares\/[A-Za-z0-9_-]{20,80}$/, ['GET', 'DELETE']],
  [/^\/api\/profile$/, ['GET']],
  [/^\/api\/billing\/(?:status|entitlement|pacing)$/, ['GET']],
  [/^\/api\/projects(?:\/[a-fA-F0-9-]{36}(?:\/files(?:\/[a-fA-F0-9-]{36}\/download)?)?)?$/, ['GET']],
  [/^\/api\/browser\/local\/session$/, ['GET']],
];

/** @param {string} path @param {string} method */
export function isHostedWorkspaceRoute(path, method) {
  return Boolean(hostedResearchConfirmation(path, method))
    || routes.some(([pattern, methods]) => pattern.test(path) && methods.includes(method));
}

/** @param {unknown} value */
export function validateHostedWorkspaceStaging(value) {
  const m = /** @type {any} */ (value);
  if (m?.version !== 2 || m.topology !== 'private_cloud_run_managed_supabase'
    || m.environment !== 'staging' || m.dataPolicy !== 'synthetic_only'
    || m.project !== stagingProject || m.region !== stagingRegion
    || !/^[a-f0-9]{40}$/.test(m.sourceSha ?? '')
    || m.api?.sourceSha !== m.sourceSha || m.web?.sourceSha !== m.sourceSha
    || m.auth?.projectRef !== stagingAuthRef || m.auth?.issuer !== `${stagingAuthOrigin}/auth/v1`
    || m.ledger?.projectRef !== stagingAuthRef || m.storage?.projectRef !== stagingAuthRef
    || m.api?.service !== 'xroga-api-universal-staging'
    || m.api?.identity !== `xroga-universal-staging@${stagingProject}.iam.gserviceaccount.com`
    || m.api?.audience !== stagingApiAudience
    || m.api?.origin !== `https://openui-${m.sourceSha.slice(0, 7)}---${new URL(stagingApiAudience).hostname}`
    || !imagePin(m.api?.image, 'xroga-api-migration')
    || m.api?.defaultTrafficPercent !== 0
    || m.api?.rollbackRevision !== 'xroga-api-universal-staging-00001-tdc'
    || m.web?.service !== stagingWebService || m.web?.origin !== stagingWebOrigin
    || m.web?.identity !== stagingWebIdentity || m.web?.operatorOrigin !== stagingOperatorOrigin
    || m.web?.requiresInvoker !== true || m.api?.requiresInvoker !== true) {
    throw new Error('Hosted Workspace staging requires the reviewed source and isolated service bindings');
  }
  return structuredClone(m);
}

/** @param {unknown} image @param {string} name */
function imagePin(image, name) {
  const prefix = `${repository}/${name}@sha256:`;
  return typeof image === 'string' && image.startsWith(prefix) && /^[a-f0-9]{64}$/.test(image.slice(prefix.length));
}

/** @param {Record<string,string|undefined>} environment @param {unknown} manifest */
export function requireHostedWorkspaceBuild(environment, manifest) {
  const reviewed = validateHostedWorkspaceStaging(manifest);
  if (environment.CI !== 'true' || environment.VERCEL_ENV
    || environment.XROGA_DEPLOYMENT_ENVIRONMENT !== 'staging'
    || environment.XROGA_ISOLATED_AUTH_BUILD === '1'
    || environment.XROGA_RELEASE_SHA !== reviewed.sourceSha
    || environment.SUPABASE_URL !== stagingAuthOrigin
    || environment.NEXT_PUBLIC_SUPABASE_URL !== stagingAuthOrigin
    || environment.NEXT_PUBLIC_API_URL !== stagingOperatorOrigin
    || environment.FRONTEND_URL !== stagingWebOrigin
    || environment.NEXT_PUBLIC_XROGA_DRIVE === '1'
    || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(environment.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '')) {
    throw new Error('Hosted Workspace build does not match the reviewed staging realm');
  }
  return reviewed;
}

/** @param {string} sourceSha @param {string} apiDigest */
export function hostedWorkspaceManifest(sourceSha, apiDigest) {
  return validateHostedWorkspaceStaging({
    version: 2, topology: 'private_cloud_run_managed_supabase',
    environment: 'staging', dataPolicy: 'synthetic_only', project: stagingProject, region: stagingRegion, sourceSha,
    auth: { projectRef: stagingAuthRef, issuer: `${stagingAuthOrigin}/auth/v1` },
    ledger: { projectRef: stagingAuthRef },
    storage: { projectRef: stagingAuthRef },
    api: {
      sourceSha, service: 'xroga-api-universal-staging', audience: stagingApiAudience,
      origin: `https://openui-${sourceSha.slice(0, 7)}---${new URL(stagingApiAudience).hostname}`,
      image: `${repository}/xroga-api-migration@${apiDigest}`, defaultTrafficPercent: 0,
      identity: `xroga-universal-staging@${stagingProject}.iam.gserviceaccount.com`,
      rollbackRevision: 'xroga-api-universal-staging-00001-tdc', requiresInvoker: true,
    },
    web: {
      sourceSha, service: stagingWebService, identity: stagingWebIdentity, origin: stagingWebOrigin,
      operatorOrigin: stagingOperatorOrigin, requiresInvoker: true,
    },
  });
}

/**
 * Verifies an operator's Cloud Build readback against the approved upload receipt
 * and the manifest extracted from the frontend image at its immutable digest.
 * @param {any} build
 * @param {any} approval
 * @param {unknown} manifest
 */
export function verifyHostedWorkspaceBuildReceipt(build, approval, manifest) {
  const pin = validateHostedWorkspaceStaging(manifest);
  const actualSource = build?.sourceProvenance?.resolvedStorageSource;
  const uploaded = approval?.source;
  if (build?.status !== 'SUCCESS' || !approval?.buildId || build.id !== approval.buildId
    || pin.sourceSha !== approval.sourceSha || build.substitutions?._SOURCE_SHA !== pin.sourceSha
    || !uploaded?.bucket || !uploaded?.object || !/^[0-9]+$/.test(String(uploaded?.generation))
    || actualSource?.bucket !== uploaded.bucket || actualSource?.object !== uploaded.object
    || String(actualSource?.generation) !== String(uploaded.generation)) {
    throw new Error('Hosted Workspace build did not succeed with the approved source archive');
  }

  const results = build.results?.images;
  if (!Array.isArray(results) || results.length !== 2) throw new Error('Expected two exact-source staging images');
  const apiName = `${repository}/xroga-api-migration`;
  const webName = `${repository}/${stagingWebService}`;
  const apiDigest = results.find(image => image?.name === `${apiName}:${pin.sourceSha}`)?.digest;
  const webDigest = results.find(image => image?.name === `${webName}:${pin.sourceSha}`)?.digest;
  const webImage = `${webName}@${webDigest}`;
  if (pin.api.image !== `${apiName}@${apiDigest}` || !imagePin(webImage, stagingWebService)) {
    throw new Error('Hosted Workspace image digests do not match the approved source and embedded manifest');
  }
  return { sourceSha: pin.sourceSha, apiImage: pin.api.image, webImage };
}
