import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * index.ts starts a server when imported, so the boot wiring cannot be exercised as a unit. This test pins the wiring itself.
 * Main's contract (kept in the Batch 1.5 integration): boot runs no schema DDL, /ready answers from the credential-vault and database
 * probes, and request logging never records query strings. The startup-policy and readiness evaluators in this directory are libraries
 * that are deliberately not wired into index.ts yet: they recognise production only by the Fly app name, so wiring them is part of the
 * Google Cloud cutover (docs/infra/batch-1.5/DEPLOYMENT-HOLD.md).
 */
const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

describe('boot duties follow main\'s contract', () => {
  it('boot runs no schema-ensure DDL (schema changes belong to the migration gate)', () => {
    assert.equal([...source.matchAll(/\bensure\w*Schema\(/g)].length, 0);
  });

  it('orphaned-run reconciliation has exactly one boot call site, as on main', () => {
    assert.equal([...source.matchAll(/\breconcileOrphanedRuns\(/g)].length, 1);
  });

  it('/ready answers from the credential-vault and database probes', () => {
    assert.match(source, /app\.get\('\/ready',\s*credentialVaultReadinessMiddleware\(/);
    assert.match(source, /app\.get\('\/ready'[\s\S]{0,700}probeDatabaseReadiness\(\)/);
  });
});

describe('credential-safe logging is installed before anything can log', () => {
  it('the safe-logging module is the first import after environment loading', () => {
    const imports = [...source.matchAll(/^import\s+(?:[^;]*?from\s+)?'([^']+)';/gm)].map((m) => m[1]);
    assert.equal(imports[0], 'dotenv/config');
    assert.equal(imports[1], './runtime/installSafeLogging.js');
  });

  it('HTTP request logging records the path without its query string', () => {
    assert.match(source, /morgan\.token\('safe-path'/);
    assert.ok(!/morgan\('dev'/.test(source), 'no raw morgan dev format (it prints the full URL, including OAuth codes)');
  });
});
