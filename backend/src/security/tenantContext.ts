import { randomUUID } from 'node:crypto';
import type { ResolvedIdentity } from '../lib/resolveIdentity.js';
import { TenantAccessError, resourceNotFound } from './tenantErrors.js';

export interface TenantContext {
  readonly userId: string;
  /** Current project ownership is user-scoped; operations memberships are separate. */
  readonly tenantId: string;
  readonly provenance: ResolvedIdentity['via'] | 'persisted_owner';
  readonly correlationId: string;
}
const issuedContexts = new WeakSet<object>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** INTERNAL boundary: call only after server verification or owner-scoped durable lookup. */
export function createTenantContext(identity: Pick<ResolvedIdentity, 'userId'> & { via: TenantContext['provenance'] }): TenantContext {
  if (!uuid.test(identity.userId) || !['local_jwt', 'remote_getuser', 'deduplicated', 'persisted_owner'].includes(identity.via)) {
    throw new TenantAccessError(401, 'TENANT_AUTH_REQUIRED');
  }
  const context = Object.freeze({ userId: identity.userId, tenantId: identity.userId, provenance: identity.via, correlationId: randomUUID() });
  issuedContexts.add(context);
  return context;
}

/** A JSON/body object or cloned job payload is not a request authority context. */
export function requireTenantContext(value: unknown): TenantContext {
  if (!value || typeof value !== 'object' || !issuedContexts.has(value)) throw new TenantAccessError(401, 'TENANT_AUTH_REQUIRED');
  return value as TenantContext;
}

export function requireResourceOwner(context: TenantContext, ownerId: unknown): void {
  const authenticated = requireTenantContext(context);
  if (ownerId !== authenticated.userId) resourceNotFound();
}
