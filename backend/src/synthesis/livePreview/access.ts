import type { ProjectRuntimeSession } from '../projectRuntime/types.js';
import type { LivePreviewGrant } from './types.js';

/** Revalidate persisted relationships at resolution, not just possession of a
 * signed hostname. Never derive an upstream address from a request parameter. */
export function authorizedPreviewSession(grant:LivePreviewGrant,session:ProjectRuntimeSession|null,now=Date.now()):session is ProjectRuntimeSession {
  const expiry = Date.parse(grant.expiresAt);
  if (!session || grant.revokedAt || !Number.isFinite(expiry) || expiry <= now ||
    session.userId !== grant.userId || session.sessionId !== grant.sessionId ||
    session.projectId !== grant.projectId || session.status !== 'running' ||
    session.runtimeClass !== 'interactive' || !Number.isInteger(grant.port) ||
    grant.port === null || grant.port < 1 || grant.port > 65535) return false;
  if (session.expiresAt !== null && (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= now)) return false;
  if (!Array.isArray(session.ports) || !session.ports.some(port => port && port.port === grant.port && port.protocol === 'http' && ['declared', 'listening'].includes(port.status))) return false;
  return !!session.providerState && typeof session.providerState==='object' && !Array.isArray(session.providerState);
}

export function authorizedPreviewTarget(grant: LivePreviewGrant, session: ProjectRuntimeSession | null, now = Date.now()): { host: string; port: number } | null {
  if(!authorizedPreviewSession(grant,session,now))return null;
  const { machineId, app } = session.providerState;
  if (typeof machineId !== 'string' || !/^[a-z0-9]{1,64}$/.test(machineId) ||
    typeof app !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(app)) return null;
  return { host: `${machineId}.vm.${app}.internal`, port: grant.port! };
}
