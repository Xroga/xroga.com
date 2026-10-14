import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProjectRuntimeSession } from '../projectRuntime/types.js';
import type { LivePreviewGrant } from './types.js';
import { authorizedPreviewTarget } from './access.js';

const now = Date.parse('2026-10-14T00:00:00Z');
const grant: LivePreviewGrant = { previewId: 'fixture', userId: 'owner', projectId: 'project', sessionId: 'session', runId: 'run', kind: 'browser', port: 3000, expiresAt: new Date(now + 60_000).toISOString(), revokedAt: null, createdAt: new Date(now).toISOString() };
const session: ProjectRuntimeSession = { schemaVersion: '1.0.0', providerId: 'fixture', image: null, workspaceRevision: 1, knownFiles: [], processes: [], createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), userId: 'owner', projectId: 'project', sessionId: 'session', status: 'running', runtimeClass: 'interactive', ports: [{ port: 3000, protocol: 'http', status: 'listening', processId: 'fixture' }], expiresAt: null, providerState: { machineId: 'abc123', app: 'xroga-synthetic-runtime' } };

test('signed preview resolves only the exact active owner/project/session/declared HTTP port', () => {
  assert.deepEqual(authorizedPreviewTarget(grant, session, now), { host: 'abc123.vm.xroga-synthetic-runtime.internal', port: 3000 });
});
for (const [label, change] of Object.entries({
  'foreign owner': { userId: 'other' }, 'different project': { projectId: 'other' },
  'different session': { sessionId: 'other' }, 'stopped session': { status: 'stopped' },
  'verification machine': { runtimeClass: 'verification' }, 'expired session': { expiresAt: new Date(now - 1).toISOString() },
  'invalid session expiry': { expiresAt: 'invalid' }, 'undeclared port': { ports: [] },
  'stopped port': { ports: [{ port: 3000, protocol: 'http', status: 'stopped' }] },
  'non-HTTP port': { ports: [{ port: 3000, protocol: 'tcp', status: 'listening' }] },
  'host injection': { providerState: { machineId: 'abc/../evil', app: 'xroga-synthetic-runtime' } },
  'foreign domain': { providerState: { machineId: 'abc123', app: 'evil.example' } },
})) test(`preview denies ${label} before any upstream connection`, () => {
  assert.equal(authorizedPreviewTarget(grant, { ...session, ...change } as ProjectRuntimeSession, now), null);
});
for (const [label, change] of Object.entries({
  'revoked grant': { revokedAt: new Date(now).toISOString() }, 'expired grant': { expiresAt: new Date(now - 1).toISOString() },
  'invalid grant expiry': { expiresAt: 'invalid' }, 'invalid port': { port: 70000 },
})) test(`preview denies ${label}`, () => assert.equal(authorizedPreviewTarget({ ...grant, ...change }, session, now), null));
