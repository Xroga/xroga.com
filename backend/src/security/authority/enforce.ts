import { requireTenantContext, type TenantContext } from '../tenantContext.js';
import { canonicalAuthorityJson, preparedActionDigest } from './digest.js';
import { ACTION_POLICIES } from './risk.js';
import type { AuthorityDispatchBinding, AuthorityPermit, DurableAuthorityClaim, PreparedAuthorityScope } from './types.js';

export class AuthorityError extends Error {
  constructor(readonly code: string, readonly status = 403) { super('This action requires current approval for its exact account, target and parameters.'); this.name = 'AuthorityError'; }
}
const denied = (code = 'AUTHORITY_REQUIRED'): never => { throw new AuthorityError(code); };
interface PermitState {
  scope: Readonly<PreparedAuthorityScope>;
  used: boolean;
  revalidate: () => Promise<DurableAuthorityClaim>;
  claim: Readonly<DurableAuthorityClaim>;
}
const permits = new WeakMap<object, PermitState>();
const digest = /^[a-f0-9]{64}$/;
function fresh(scope: PreparedAuthorityScope): void {
  const issued = Date.parse(scope.issuedAt), expires = Date.parse(scope.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > Date.now() || expires <= Date.now() || expires <= issued) denied('AUTHORITY_EXPIRED');
}
function verifyClaim(scope: PreparedAuthorityScope, claim: DurableAuthorityClaim): void {
  if (!claim || typeof claim.id !== 'string' || !claim.id || claim.userId !== scope.userId
    || claim.scopeDigest !== preparedActionDigest(scope) || claim.expiresAt !== scope.expiresAt
    || !Number.isFinite(Date.parse(claim.claimedAt))) denied('AUTHORITY_CLAIM_MISMATCH');
}

/** One canonical executor over existing business/Operations durable adapters.
 * The supplied adapter is trusted server code, not a request-supplied grant. */
export async function executeAuthorizedAction<T>(input: {
  context: TenantContext;
  scope: PreparedAuthorityScope;
  claim: DurableAuthorityClaim;
  revalidateBeforeEffect: () => Promise<DurableAuthorityClaim>;
}, effect: (permit: AuthorityPermit) => Promise<T>): Promise<T> {
  const context = requireTenantContext(input.context);
  const scope = Object.freeze(JSON.parse(canonicalAuthorityJson(input.scope)) as PreparedAuthorityScope);
  if (['userId', 'tenantId', 'provider', 'connectedAccountId', 'operation', 'targetDigest', 'planDigest', 'risk', 'issuedAt', 'expiresAt', 'nonce']
    .some(key => typeof scope[key as keyof PreparedAuthorityScope] !== 'string' || !scope[key as keyof PreparedAuthorityScope])) denied('AUTHORITY_SCOPE_MISMATCH');
  if (scope.version !== '1' || scope.userId !== context.userId || scope.tenantId !== context.tenantId
    || !Object.hasOwn(ACTION_POLICIES, scope.actionClass) || !digest.test(scope.planDigest) || !digest.test(scope.targetDigest)
    || !scope.nonce || !scope.provider || !scope.operation || !scope.connectedAccountId) denied('AUTHORITY_SCOPE_MISMATCH');
  const policy = ACTION_POLICIES[scope.actionClass];
  if (policy.requiresSpendBinding && (!scope.maxSpendMicroUsd || !/^[1-9]\d{0,15}$/.test(scope.maxSpendMicroUsd) || scope.currency !== 'USD')) denied('AUTHORITY_SPEND_BINDING_REQUIRED');
  fresh(scope);
  const claim = Object.freeze({ ...input.claim }); verifyClaim(scope, claim);
  const permit: AuthorityPermit = Object.freeze({ grantId: claim.id });
  permits.set(permit, { scope, claim, used: false, revalidate: input.revalidateBeforeEffect });
  try { return await effect(permit); }
  finally { permits.delete(permit); }
}

export function assertAuthorityPermit(value: unknown, binding: AuthorityDispatchBinding): void {
  if (!value || typeof value !== 'object') denied();
  const state = permits.get(value as object);
  if (!state || state.used) return denied('AUTHORITY_ALREADY_USED_OR_MISSING');
  fresh(state.scope);
  for (const key of ['userId', 'provider', 'connectedAccountId', 'operation', 'targetDigest', 'planDigest'] as const) {
    if (binding[key] !== state.scope[key]) denied('AUTHORITY_SCOPE_MISMATCH');
  }
}

/** Called by the actual effect adapter after metadata/account waits. Mark used
 * before awaiting to prevent two in-process consumers racing one DB claim. */
export async function consumeAuthorityPermit(value: unknown, binding: AuthorityDispatchBinding): Promise<void> {
  assertAuthorityPermit(value, binding);
  const state = permits.get(value as object)!;
  state.used = true;
  const receipt = await state.revalidate();
  verifyClaim(state.scope, receipt);
  if (receipt.id !== state.claim.id || receipt.claimedAt !== state.claim.claimedAt) denied('AUTHORITY_CLAIM_MISMATCH');
  fresh(state.scope);
}
