import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import type { ProjectRuntimeSession } from '../projectRuntime/types.js';
import type { LivePreviewGrant } from './types.js';
import { authorizedPreviewTarget } from './access.js';

const now = Date.parse('2026-10-14T00:00:00Z');
const providerKeys = ['XROGA_SANDBOX_FLY_APP', 'XROGA_SANDBOX_FLY_TOKEN', 'FLY_APP_NAME'];
const previousProviderEnv = providerKeys.map(key => process.env[key]);
before(() => { process.env.XROGA_SANDBOX_FLY_APP = 'xroga-synthetic-runtime'; process.env.XROGA_SANDBOX_FLY_TOKEN = 'synthetic-provider-only'; process.env.FLY_APP_NAME = 'xroga-api'; });
after(() => providerKeys.forEach((key, index) => { if (previousProviderEnv[index] === undefined) delete process.env[key]; else process.env[key] = previousProviderEnv[index]; }));
const grant: LivePreviewGrant = { previewId: 'fixture', userId: 'owner', projectId: 'project', sessionId: 'session', runId: 'run', kind: 'browser', port: 3000, expiresAt: new Date(now + 60_000).toISOString(), revokedAt: null, createdAt: new Date(now).toISOString() };
const session: ProjectRuntimeSession = { schemaVersion: '1.0.0', providerId: 'fly-project-runtime', image: null, workspaceRevision: 1, knownFiles: [], processes: [], createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), userId: 'owner', projectId: 'project', sessionId: 'session', status: 'running', runtimeClass: 'interactive', ports: [{ port: 3000, protocol: 'http', status: 'listening', processId: 'fixture' }], expiresAt: null, providerState: { machineId: 'abc123', app: 'xroga-synthetic-runtime' } };

test('signed preview resolves only the exact active owner/project/session/declared HTTP port', () => {
  assert.deepEqual(authorizedPreviewTarget(grant, session, now), { host: 'abc123.vm.xroga-synthetic-runtime.internal', port: 3000 });
});
test('preview fails closed without its configured provider or for the control-plane app', () => {
  const token = process.env.XROGA_SANDBOX_FLY_TOKEN;
  delete process.env.XROGA_SANDBOX_FLY_TOKEN;
  try { assert.equal(authorizedPreviewTarget(grant, session, now), null); }
  finally { process.env.XROGA_SANDBOX_FLY_TOKEN = token; }
  process.env.FLY_APP_NAME = 'xroga-synthetic-runtime';
  try { assert.equal(authorizedPreviewTarget(grant, session, now), null); }
  finally { process.env.FLY_APP_NAME = 'xroga-api'; }
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
  'another valid app': { providerState: { machineId: 'abc123', app: 'another-valid-app' } },
  'missing provider state': { providerState: null }, 'malformed ports': { ports: [null] },
  'missing provider id': { providerId: undefined }, 'unknown provider id': { providerId: 'unknown-provider' },
  'unknown port status': { ports: [{ port: 3000, protocol: 'http' }] },
})) test(`preview denies ${label} before any upstream connection`, () => {
  assert.equal(authorizedPreviewTarget(grant, { ...session, ...change } as ProjectRuntimeSession, now), null);
});
for (const [label, change] of Object.entries({
  'revoked grant': { revokedAt: new Date(now).toISOString() }, 'expired grant': { expiresAt: new Date(now - 1).toISOString() },
  'invalid grant expiry': { expiresAt: 'invalid' }, 'invalid port': { port: 70000 },
})) test(`preview denies ${label}`, () => assert.equal(authorizedPreviewTarget({ ...grant, ...change }, session, now), null));
