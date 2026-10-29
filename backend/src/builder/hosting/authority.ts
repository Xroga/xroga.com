import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { requireTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { classifyOutboundData, containsCredentialSecretText } from '../../security/egress/dataClassification.js';
import { getVercelToken } from '../../services/integrations/vercelAuth.js';
import { nativeReleaseConnection } from '../../services/publish/nativeReleaseAdmission.js';
import { inspectNativeArtifactSource } from '../../services/publish/nativeArtifact.js';
import { assertNoPrivilegedEnv } from '../data/env.js';
import { builderAdmissionDenied, builderProviderAdmission, currentBuilderEffect, isBuilderSecurityDenial, type BuilderEffect } from '../providerAuthority.js';
import type { Phase2Store } from '../phase2Store.js';
import type { BuilderService } from '../service.js';
import type { ExternalOperation } from '../types.js';
import type { ProjectFile } from '../../ai/patches.js';
import type { VercelTransport } from './restPort.js';
import type { PreviewPlan, PromotionPlan } from './service.js';

export const builderSourceDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Fixed provider transport under the existing Builder approval/CAS adapter.
 * Preview admission never admits production promotion, Git linking or secrets. */
export function createBuilderVercelBoundary(supplied: TenantContext, deps: {
  phase2: Phase2Store;
  builder: BuilderService;
  filesFor: (operation: ExternalOperation) => Promise<ProjectFile[]>;
  appEnvironment: (projectId: string) => Promise<Record<string, string> | null>;
}) {
  const context = requireTenantContext(supplied);
  let pinned: { token: string; fingerprint: string } | undefined;
  let invalid = false;
  const pin = async () => {
    if (invalid) throw builderAdmissionDenied();
    requireTenantContext(context);
    const token = await getVercelToken(context.userId);
    if (!token) return null;
    const fingerprint = await nativeReleaseConnection(context, 'vercel');
    if (pinned && (token !== pinned.token || fingerprint !== pinned.fingerprint)) { invalid = true; throw builderAdmissionDenied(); }
    pinned ??= { token, fingerprint };
    return pinned;
  };
  const requirePin = async () => { const value = await pin(); if (!value) throw builderAdmissionDenied(); return value; };
  const source = async (operation: ExternalOperation) => {
    const files = inspectNativeArtifactSource(await deps.filesFor(operation), [(await requirePin()).token]);
    if (operation.plan.sourceDigest !== builderSourceDigest(files)) throw builderAdmissionDenied();
    const environment = await deps.appEnvironment(operation.projectId) ?? {};
    assertNoPrivilegedEnv(environment);
    if (operation.plan.environmentDigest !== builderSourceDigest(environment)) throw builderAdmissionDenied();
    return { sourceDigest: builderSourceDigest(files), environmentDigest: builderSourceDigest(environment) };
  };
  const admission = builderProviderAdmission({ context, provider: 'vercel', phase2: deps.phase2, builder: deps.builder,
    fingerprint: async () => (await requirePin()).fingerprint,
    checkConnection: async () => { await requirePin(); }, sourcePayload: source });
  const states = new WeakMap<BuilderEffect, { projectId: string | null; created: boolean; deployed: boolean; promoted: boolean; deploymentId: string | null }>();
  const transport: VercelTransport = async (token, path, init) => {
    const connection = await requirePin();
    if (token !== connection.token || typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[%\\#\x00-\x20\x7f]/.test(path) || containsCredentialSecretText(path)) throw builderAdmissionDenied();
    const url = new URL('https://api.vercel.com' + path), method = init?.method ?? 'GET', effect = currentBuilderEffect();
    const segment = '[A-Za-z0-9_-]{1,100}';
    const read = method === 'GET' && init?.body === undefined && (['/v2/user', '/v2/teams'].includes(url.pathname)
      || new RegExp(`^/v9/projects/${segment}$`).test(url.pathname)
      || new RegExp(`^/v13/deployments/${segment}$`).test(url.pathname)
      || new RegExp(`^/v3/deployments/${segment}/events$`).test(url.pathname));
    let body: unknown;
    if (init?.body !== undefined) { if (typeof init.body !== 'string' || Buffer.byteLength(init.body) > 32 * 1024 * 1024) throw builderAdmissionDenied(); try { body = JSON.parse(init.body); } catch { throw builderAdmissionDenied(); } }
    for (const [key, value] of url.searchParams) {
      if (url.searchParams.getAll(key).length !== 1 || !(key === 'teamId' && /^team_[A-Za-z0-9]{8,40}$/.test(value)
        || key === 'limit' && value === '40' && url.pathname.endsWith('/events')
        || key === 'upsert' && value === 'true' && url.pathname.endsWith('/env')
        || ['forceNew', 'skipAutoDetectionConfirmation'].includes(key) && value === '1' && url.pathname === '/v13/deployments')) throw builderAdmissionDenied();
    }
    let state: ReturnType<typeof states.get>;
    let plan: PreviewPlan | PromotionPlan | undefined;
    if (effect) {
      if (effect.context !== context || effect.operation.provider !== 'vercel' || !['deploy_preview', 'promote_production'].includes(effect.operation.action)) throw builderAdmissionDenied();
      plan = effect.operation.plan as unknown as PreviewPlan | PromotionPlan;
      if (url.searchParams.get('teamId') !== plan.scope.id) throw builderAdmissionDenied();
      state = states.get(effect);
      if (!state) { state = { projectId: plan.action === 'promote_production' ? plan.vercelProjectId : typeof plan.remoteProjectId === 'string' ? plan.remoteProjectId : null, created: false, deployed: false, promoted: false, deploymentId: plan.action === 'promote_production' ? plan.deploymentId : null }; states.set(effect, state); }
      await effect.check();
    }
    if (!read) {
      if (!effect || !plan || !state || method !== 'POST') throw builderAdmissionDenied();
      if (plan.action === 'deploy_preview') {
        if (url.pathname === '/v11/projects') {
          if (plan.project.mode !== 'create' || state.created || !isDeepStrictEqual(body, { name: plan.project.name, framework: plan.framework })) throw builderAdmissionDenied();
          state.created = true;
        } else if (state.projectId && url.pathname === '/v10/projects/' + state.projectId + '/env') {
          const environment = await deps.appEnvironment(effect.operation.projectId) ?? {};
          assertNoPrivilegedEnv(environment);
          if (!isDeepStrictEqual(body, Object.entries(environment).map(([key, value]) => ({ key, value, type: 'encrypted', target: ['preview'] })))) throw builderAdmissionDenied();
        } else if (url.pathname === '/v13/deployments') {
          const files = inspectNativeArtifactSource(await deps.filesFor(effect.operation), [token]);
          const expected = { name: plan.project.name, project: plan.project.name,
            files: files.map(file => ({ file: file.path, data: Buffer.from(file.content).toString('base64'), encoding: 'base64' })),
            meta: { xrogaProject: effect.operation.projectId, xrogaRevision: plan.revision.id, xrogaContentSha256: plan.revision.contentSha256, ...(plan.githubCommitSha ? { githubCommitSha: plan.githubCommitSha } : {}) },
            ...(plan.framework ? { projectSettings: { framework: plan.framework } } : {}) };
          if (!state.projectId || state.deployed || !isDeepStrictEqual(body, expected)) throw builderAdmissionDenied();
          state.deployed = true;
        } else throw builderAdmissionDenied();
      } else {
        if (state.promoted || url.pathname !== '/v10/projects/' + plan.vercelProjectId + '/promote/' + plan.deploymentId || body !== undefined) throw builderAdmissionDenied();
        state.promoted = true;
      }
      // Provider authentication is carried only in the native request header.
      // Source was inspected before base64 encoding and public env is checked above.
      if (body !== undefined && classifyOutboundData(url.pathname.endsWith('/env') ? { publicEnvironmentDigest: builderSourceDigest(body) } : url.pathname === '/v13/deployments' ? { sourceDigest: plan.sourceDigest } : body, 'USER_PRIVATE').classification === 'CREDENTIAL_SECRET') throw builderAdmissionDenied();
      await effect.begin();
    }
    await requirePin(); await effect?.check();
    const signal = AbortSignal.any([AbortSignal.timeout(30_000), ...(init?.signal ? [init.signal] : [])]);
    const response = await fetch(url, { method, body: init?.body, redirect: 'manual', signal, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
    if (response.redirected || response.status >= 300 && response.status < 400 || response.status === 401 || response.status === 403) { await response.body?.cancel().catch(() => undefined); invalid = true; throw builderAdmissionDenied(); }
    const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
    try { if (reader) for (;;) { const next = await reader.read(); if (next.done) break; signal.throwIfAborted(); bytes += next.value.length; if (bytes > 2 * 1024 * 1024) throw builderAdmissionDenied(); chunks.push(next.value); } }
    finally { await reader?.cancel().catch(() => undefined); reader?.releaseLock(); }
    await requirePin(); await effect?.check(); signal.throwIfAborted();
    if (!response.ok) return new Response(null, { status: response.status });
    if (!bytes) return new Response(null, { status: response.status });
    let data: unknown; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw builderAdmissionDenied(); }
    if (effect && state && plan) {
      const value = data as Record<string, any>;
      if (url.pathname === '/v2/user' && value.user?.id !== plan.viewer.id) throw builderAdmissionDenied();
      if (url.pathname.startsWith('/v9/projects/') || url.pathname === '/v11/projects') {
        const name = plan.action === 'deploy_preview' ? plan.project.name : plan.projectName;
        if (typeof value.id !== 'string' || value.name !== name || value.link || value.accountId !== (plan.scope.id ?? plan.viewer.id) || state.projectId && state.projectId !== value.id) throw builderAdmissionDenied();
        state.projectId = value.id;
      }
      if (url.pathname.startsWith('/v13/deployments')) {
        if (value.projectId !== state.projectId || value.meta?.xrogaRevision !== plan.revision.id || value.meta?.xrogaContentSha256 !== plan.revision.contentSha256 || plan.action === 'deploy_preview' && value.target === 'production' || state.deploymentId && value.id !== state.deploymentId || typeof value.id !== 'string') throw builderAdmissionDenied();
        state.deploymentId = value.id;
      }
    }
    return Response.json(data, { status: response.status });
  };
  return { transport, admission, tokenFor: async (userId: string) => { if (userId !== context.userId) throw builderAdmissionDenied(); return (await pin())?.token ?? null; } };
}
