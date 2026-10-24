import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideStartup, dutiesFor, resolveDeploymentEnvironment, PRODUCTION_FLY_APP } from './startupPolicy.js';

const env = (e: Record<string, string | undefined>): NodeJS.ProcessEnv => e;
const NO_DUTIES = { ensureSchemas: false, reconcileOrphanedRuns: false };
const ALL_DUTIES = { ensureSchemas: true, reconcileOrphanedRuns: true };

describe('deployment environment resolution', () => {
  it('the production Fly app is production with no new configuration, so today\'s deployment is unchanged', () => {
    const r = resolveDeploymentEnvironment(env({ FLY_APP_NAME: PRODUCTION_FLY_APP, NODE_ENV: 'production' }));
    assert.deepEqual([r.environment, r.source], ['production', 'inferred']);
    assert.deepEqual(decideStartup(env({ FLY_APP_NAME: PRODUCTION_FLY_APP })).duties, ALL_DUTIES);
  });

  it('an explicit environment is honoured', () => {
    for (const e of ['production', 'staging', 'preview', 'development', 'test']) {
      assert.equal(resolveDeploymentEnvironment(env({ XROGA_DEPLOYMENT_ENVIRONMENT: e })).environment, e);
      assert.equal(resolveDeploymentEnvironment(env({ XROGA_DEPLOYMENT_ENVIRONMENT: ` ${e.toUpperCase()} ` })).environment, e, 'case and spaces');
    }
  });

  it('an unknown or empty-meaning value is unclassified, not a guess', () => {
    for (const bad of ['prod', 'live', 'stage', 'yes', 'production;staging']) {
      const r = resolveDeploymentEnvironment(env({ XROGA_DEPLOYMENT_ENVIRONMENT: bad }));
      assert.equal(r.environment, 'unclassified', bad);
      assert.ok(r.problem);
    }
  });

  it('a declaration that contradicts the platform is unclassified (staging claim on the production app, production claim on another app)', () => {
    assert.equal(resolveDeploymentEnvironment(env({ FLY_APP_NAME: PRODUCTION_FLY_APP, XROGA_DEPLOYMENT_ENVIRONMENT: 'staging' })).environment, 'unclassified');
    assert.equal(resolveDeploymentEnvironment(env({ FLY_APP_NAME: 'xroga-api-staging', XROGA_DEPLOYMENT_ENVIRONMENT: 'production' })).environment, 'unclassified');
    assert.equal(resolveDeploymentEnvironment(env({ FLY_APP_NAME: 'xroga-api-staging', XROGA_DEPLOYMENT_ENVIRONMENT: 'staging' })).environment, 'staging');
  });

  it('anything not positively identified is unclassified: another Fly app, Cloud Run, a bare host', () => {
    for (const e of [{ FLY_APP_NAME: 'xroga-api-staging' }, { FLY_APP_NAME: 'xroga-api-2' }, { K_SERVICE: 'xroga-api' }, { NODE_ENV: 'production' }, {}]) {
      assert.equal(resolveDeploymentEnvironment(env(e)).environment, 'unclassified', JSON.stringify(e));
    }
  });

  it('NODE_ENV alone identifies only local development and test', () => {
    assert.equal(resolveDeploymentEnvironment(env({ NODE_ENV: 'test' })).environment, 'test');
    assert.equal(resolveDeploymentEnvironment(env({ NODE_ENV: 'development' })).environment, 'development');
  });
});

describe('boot duties', () => {
  it('only production and local development may write to the database at boot', () => {
    assert.deepEqual(dutiesFor('production'), ALL_DUTIES);
    assert.deepEqual(dutiesFor('development'), ALL_DUTIES);
    for (const e of ['staging', 'preview', 'test', 'unclassified'] as const) assert.deepEqual(dutiesFor(e), NO_DUTIES, e);
  });

  it('a staging service holding a live service-role key performs no reconcile and no DDL, and the boot log says so', () => {
    const d = decideStartup(env({ FLY_APP_NAME: 'xroga-api-staging', XROGA_DEPLOYMENT_ENVIRONMENT: 'staging', SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40), SUPABASE_URL: 'https://example.supabase.co' }));
    assert.deepEqual(d.duties, NO_DUTIES);
    assert.ok(d.notes.some((n) => /disabled by policy/.test(n)));
    assert.ok(d.notes.some((n) => /WARNING.*SUPABASE_SERVICE_ROLE_KEY/.test(n)));
    assert.ok(!JSON.stringify(d).includes('x'.repeat(40)), 'the key itself is never logged');
  });

  it('a host nobody classified performs no mutating duty even with production credentials present', () => {
    const d = decideStartup(env({ K_SERVICE: 'cloud-run-staging', SUPABASE_SERVICE_ROLE_KEY: 'k', SUPABASE_URL: 'https://prod.supabase.co' }));
    assert.deepEqual(d.duties, NO_DUTIES);
    assert.ok(d.notes.some((n) => /not recognised/.test(n)));
  });
});
