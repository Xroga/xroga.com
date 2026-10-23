import type { ProjectRuntimeSession } from '../projectRuntime/types.js';
import type { LivePreviewGrant } from './types.js';
import { configuredProjectRuntimeProviders } from '../projectRuntime/manager.js';

/** Revalidate persisted relationships at resolution, not just possession of a
 * signed hostname. Never derive an upstream address from a request parameter. */
export function authorizedPreviewTarget(grant: LivePreviewGrant, session: ProjectRuntimeSession | null, now = Date.now()): { host: string; port: number } | null {
  const expiry = Date.parse(grant.expiresAt);
  if (!session || grant.revokedAt || !Number.isFinite(expiry) || expiry <= now ||
    session.userId !== grant.userId || session.sessionId !== grant.sessionId ||
    session.projectId !== grant.projectId || session.status !== 'running' ||
    session.runtimeClass !== 'interactive' || !Number.isInteger(grant.port) ||
    grant.port === null || grant.port < 1 || grant.port > 65535) return null;
  if (session.expiresAt !== null && (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= now)) return null;
  if (!Array.isArray(session.ports) || !session.ports.some(port => port && port.port === grant.port && port.protocol === 'http' && ['declared', 'listening'].includes(port.status))) return null;
  if (!session.providerState || typeof session.providerState !== 'object' || Array.isArray(session.providerState)) return null;
  if (typeof session.providerId !== 'string' || !session.providerId) return null;
  try {
    const provider = configuredProjectRuntimeProviders().find(candidate => candidate.id === session.providerId);
    return provider?.resolvePreviewTarget?.(session, grant.port) ?? null;
  } catch { return null; }
}
