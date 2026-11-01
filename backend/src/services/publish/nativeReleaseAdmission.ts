import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {preparedActionDigest} from '../../security/authority/digest.js';
import {AuthorityError, authorityContextForPermit, consumeAuthorityPermit} from '../../security/authority/enforce.js';
import type {AuthorityPermit} from '../../security/authority/types.js';
import {requireTenantContext, requireResourceOwner, type TenantContext} from '../../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../../security/serviceRoleGuard.js';
import {enforceEgress} from '../../security/egress/egressPolicy.js';
import {persistSecurityDecision} from '../../security/egress/securityDecision.js';
import {runtimeCredentialVault} from '../integrations/credentialVaultRuntime.js';
import {actionPlanDigest, businessActionAuthorityScope, snapshotBusinessActionPlan, type BusinessActionPlan} from '../integrations/businessAction.js';
import {createBusinessActionConfirmation} from '../integrations/businessActionConfirmations.js';
import {readNativeArtifact, storeNativeArtifact, type NativeArtifactFlavor, type NativeArtifactReference} from './nativeArtifact.js';
import type {ProjectFile} from '../integrations/githubDeploy.js';

const toolkit = 'xroga-native-release';
const useCase = 'Publish an owned native project artifact';
const denied = () => new AuthorityError('NATIVE_RELEASE_ADMISSION_DENIED');
const digest = (value: unknown) => preparedActionDigest(JSON.parse(JSON.stringify(value)));
const operation = (flavor: NativeArtifactFlavor) => flavor === 'chrome' ? 'XROGA_PUBLISH_CHROME_ZIP' : 'XROGA_PUBLISH_ELECTRON_ZIP';
const identity = (context: TenantContext, nonce: string, value: unknown) => ({tenant: context.tenantId, owner: context.userId, provider: 'native-release-plan', account: 'github', credentialType: 'artifact-admission', recordId: nonce, revision: digest(value), scope: 'native-release'});
const proofInput = (plan: BusinessActionPlan | Omit<BusinessActionPlan, 'planDigest'>) => {
  const {scopeRequirements: _proof, ...unsigned} = plan;
  const {planDigest: _digest, ...value} = unsigned as BusinessActionPlan;
  return value;
};
export async function nativeReleaseConnection(context: TenantContext, provider: 'github' | 'vercel' = 'github'): Promise<string> {
  if (provider !== 'github' && provider !== 'vercel') throw denied();
  const actor = requireTenantContext(context);
  const {data, error} = await getTenantSupabaseAdmin(actor).from('user_integrations').select('user_id,provider,access_token,credential_revision,metadata').eq('user_id', actor.userId).eq('provider', provider).maybeSingle();
  if (error || !data || data.user_id !== actor.userId || data.provider !== provider || typeof data.access_token !== 'string' || !data.access_token || data.metadata?.revoked === true) throw denied();
  return digest([data.user_id, data.provider, data.access_token, data.credential_revision, data.metadata ?? {}]);
}
export function nativeReleaseActor(userId: string, supplied: TenantContext | undefined, original?: BusinessActionPlan, permit?: AuthorityPermit) {
  const plan = original ? snapshotBusinessActionPlan(original) : undefined;
  const scope = plan ? businessActionAuthorityScope(plan) : undefined;
  const binding = scope ? {userId, provider: scope.provider, connectedAccountId: scope.connectedAccountId, operation: scope.operation, targetDigest: scope.targetDigest, planDigest: scope.planDigest} : undefined;
  const context = binding ? authorityContextForPermit(permit, binding) : requireTenantContext(supplied);
  requireResourceOwner(context, userId);
  return {context, plan, scope, binding};
}
export async function prepareNativeRelease(input: {
  context: TenantContext; repository: string; tag: string; flavor: NativeArtifactFlavor; files: ProjectFile[]; token: string;
  connection: string; projectId?: string; releaseId: number | null; oldAssetId: number | null; createBody: Record<string, unknown>;
  check: () => Promise<void>;
}) {
  const artifact = await storeNativeArtifact(input.context, input.repository, input.files, input.flavor, [input.token], input.projectId);
  const nonce = randomUUID(), issuedAt = new Date().toISOString();
  const unsigned: Omit<BusinessActionPlan, 'planDigest'> = {
    version: '1.0', sessionId: `trs_native_release_${nonce}`, useCase, toolkit, toolSlug: operation(input.flavor),
    arguments: {repository: input.repository, tag: input.tag, flavor: input.flavor, artifact, connection: input.connection, releaseId: input.releaseId, oldAssetId: input.oldAssetId, createBody: input.createBody, destination: `https://github.com/${input.repository}/releases/tag/${input.tag}`},
    risk: 'write', requiresConfirmation: true, forceConfirmation: true,
    summary: `Publish ${input.flavor === 'chrome' ? 'extension.zip' : 'desktop.zip'} to ${input.repository} at ${input.tag}${input.oldAssetId === null ? '' : ', replacing the existing asset'}. This makes the approved source artifact available through GitHub Releases.`,
    requiredScopes: ['xroga:native-release'],
    authority: {version: '1', userId: input.context.userId, tenantId: input.context.tenantId, connectedAccountId: `github:${input.repository}`, actionClass: 'PUBLISH', projectId: artifact.projectId, runId: null, issuedAt, expiresAt: new Date(Date.parse(issuedAt) + 15 * 60000).toISOString(), nonce, maxSpendMicroUsd: null, currency: null},
  };
  const value = proofInput(unsigned);
  const nativeReleaseProof = await runtimeCredentialVault().seal(input.context, identity(input.context, nonce, value), digest(value));
  await input.check();
  if (await nativeReleaseConnection(input.context) !== input.connection) throw denied();
  unsigned.scopeRequirements = {nativeReleaseProof};
  const confirmation = await createBusinessActionConfirmation(input.context.userId, {...unsigned, planDigest: actionPlanDigest(unsigned)});
  return {ok: false, needsConfirmation: true, confirmation, reviewUrl: `/dashboard/actions/confirm/${confirmation.id}`, preparedArtifact: artifact, tag: input.tag};
}

/** A permit authorizes one exact publication sequence, never an arbitrary
 * GitHub write. The immutable private source and full connection are checked
 * again after every wait. Uncertain/denied dispatch has no retry path. */
export async function admitNativeRelease(input: {
  actor: ReturnType<typeof nativeReleaseActor>; permit?: AuthorityPermit; flavor: NativeArtifactFlavor;
  repository: string; tag: string; token: string; connection: string; check: () => Promise<void>;
}) {
  const {context, plan, scope, binding} = input.actor;
  if (!plan || !scope || !binding || plan.toolkit !== toolkit || plan.toolSlug !== operation(input.flavor) || plan.useCase !== useCase
    || plan.risk !== 'write' || !plan.requiresConfirmation || plan.forceConfirmation !== true || !isDeepStrictEqual(plan.requiredScopes, ['xroga:native-release'])
    || scope.actionClass !== 'PUBLISH' || scope.connectedAccountId !== `github:${input.repository}` || scope.runId !== null || scope.maxSpendMicroUsd !== null || scope.currency !== null
    || plan.sessionId !== `trs_native_release_${scope.nonce}` || Date.parse(scope.expiresAt) - Date.parse(scope.issuedAt) > 15 * 60000) throw denied();
  const args = plan.arguments, artifact = args.artifact as NativeArtifactReference;
  if (args.repository !== input.repository || args.tag !== input.tag || args.flavor !== input.flavor || args.connection !== input.connection
    || args.destination !== `https://github.com/${input.repository}/releases/tag/${input.tag}` || artifact?.projectId !== scope.projectId || artifact.flavor !== input.flavor
    || ![args.releaseId, args.oldAssetId].every(value => value === null || Number.isSafeInteger(value) && Number(value) > 0)
    || !isDeepStrictEqual(Object.keys(args).sort(), ['artifact', 'connection', 'createBody', 'destination', 'flavor', 'oldAssetId', 'releaseId', 'repository', 'tag'])) throw denied();
  const value = proofInput(plan), proof = plan.scopeRequirements as {nativeReleaseProof?: unknown} | undefined;
  if (!proof || !isDeepStrictEqual(Object.keys(proof), ['nativeReleaseProof']) || typeof proof.nativeReleaseProof !== 'string') throw denied();
  try {if (await runtimeCredentialVault().open(context, identity(context, scope.nonce, value), proof.nativeReleaseProof) !== digest(value)) throw denied();} catch {throw denied();}
  const source = await readNativeArtifact(context, input.repository, artifact, [input.token]);
  let consumed = false, created = false, deleted = false, uploaded = false;
  let releaseId = args.releaseId as number | null;
  const check = async () => {
    await input.check(); await source.check();
    if (await nativeReleaseConnection(context) !== input.connection || Date.parse(scope.expiresAt) <= Date.now()) throw denied();
    if (consumed) {
      const {data, error} = await getTenantSupabaseAdmin(context).from('business_action_confirmations').select('id,user_id,status,plan_digest,expires_at,claimed_at,effect_started_at').eq('id', input.permit!.grantId).eq('user_id', context.userId).maybeSingle();
      if (error || data?.id !== input.permit!.grantId || data.user_id !== context.userId || data.status !== 'executing' || data.plan_digest !== scope.planDigest || Date.parse(data.expires_at) !== Date.parse(scope.expiresAt) || !Number.isFinite(Date.parse(data.claimed_at)) || !Number.isFinite(Date.parse(data.effect_started_at))) throw denied();
    }
    await input.check();
  };
  const begin = async () => {
    await check();
    if (!consumed) {
      await enforceEgress({context, actionClass: scope.actionClass, destination: String(args.destination), recipient: input.repository, purpose: 'native-project-publication', payload: {sessionId: plan.sessionId, useCase: plan.useCase, toolSlug: plan.toolSlug, arguments: args}, declaredClass: 'USER_PRIVATE', toolTrust: 'SERVER_REGISTERED', binding, authorityPermit: input.permit}, receipt => persistSecurityDecision(context, receipt));
      await consumeAuthorityPermit(input.permit, binding); consumed = true;
      await check();
    }
  };
  return {
    files: source.files, zip: source.zip, close: () => source.zip.fill(0), check,
    release(id: number, wasCreated: boolean) {if (wasCreated ? !created || releaseId !== null : releaseId !== id) throw denied(); releaseId = id;},
    oldAsset(id: number | undefined) {if ((id ?? null) !== args.oldAssetId) throw denied();},
    async write(path: string, init: RequestInit) {
      const prefix = `/repos/${input.repository}/`, method = init.method;
      if (method === 'POST' && path === prefix + 'releases' && args.releaseId === null && !created && !deleted && !uploaded
        && isDeepStrictEqual(JSON.parse(String(init.body)), args.createBody)) created = true;
      else if (method === 'DELETE' && args.oldAssetId !== null && path === prefix + `releases/assets/${args.oldAssetId}` && !deleted && !uploaded && releaseId !== null) deleted = true;
      else throw denied();
      await begin();
    },
    async beforeAssetWrite(id: number, zip: Buffer) {
      if (uploaded || id !== releaseId || (args.oldAssetId !== null && !deleted) || zip !== source.zip) throw denied();
      uploaded = true; await begin();
    },
  };
}
