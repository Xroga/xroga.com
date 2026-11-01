import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * index.ts starts a server when imported, so the boot wiring cannot be exercised as a unit. This test pins the wiring itself.
 * Main's contract (kept in the Batch 1.5 integration): boot runs no schema DDL, /ready answers from the credential-vault and database
 * probes, and request logging never records query strings. Existing startup-policy and readiness evaluators now gate the explicit
 * Google deployment environment and enabled Drive dependencies, while preserving Batch 1's zero-traffic candidate guard.
 */
const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

describe('boot duties follow main\'s contract', () => {
  it('boot runs no schema-ensure DDL (schema changes belong to the migration gate)', () => {
    assert.equal([...source.matchAll(/\bensure\w*Schema\(/g)].length, 0);
  });

  it('orphaned-run reconciliation has exactly one boot call site, as on main', () => {
    assert.equal([...source.matchAll(/\breconcileOrphanedRuns\(/g)].length, 1);
  });

  it('does not reconcile live runs when starting a zero-traffic release candidate', () => {
    assert.match(source, /if\s*\(\s*startupReconciliationAllowed\(process\.env\)\s*\)/);
  });

  it('/ready retains credential custody and uses environment, database and enabled Drive probes', () => {
    assert.match(source, /app\.get\('\/ready',\s*credentialVaultReadinessMiddleware\(/);
    assert.match(source, /runReadiness\(apiProbes\(process\.env,\s*\{\s*database:\s*probeDatabaseReadiness,\s*databaseTls:\s*probeDatabaseTls\s*\}\)\)/);
    assert.match(source, /reason:\s*failing\?\.reason\s*\?\?\s*'not_ready'/);
  });

  it('serving reconciliation also requires a positively identified writable deployment environment', () => {
    assert.match(source, /if\s*\(startupReconciliationAllowed\(process\.env\)\)\s*\{\s*const startup = decideStartup\(process\.env\);\s*if \(startup\.duties\.reconcileOrphanedRuns\)/);
  });
});

describe('credential-safe logging is installed before anything can log', () => {
  it('safe logging precedes protected configuration, dotenv and provider imports', () => {
    const imports = [...source.matchAll(/^import\s+(?:[^;]*?from\s+)?'([^']+)';/gm)].map((m) => m[1]);
    assert.deepEqual(imports.slice(0, 3), ['./runtime/installSafeLogging.js', './loadPlatformEnvironment.js', 'dotenv/config']);
    const worker = readFileSync(new URL('../scripts/runCanonicalWorker.ts', import.meta.url), 'utf8');
    const workerImports = [...worker.matchAll(/^import\s+(?:[^;]*?from\s+)?'([^']+)';/gm)].map((m) => m[1]);
    assert.deepEqual(workerImports.slice(0, 2), ['../runtime/installSafeLogging.js', '../loadPlatformEnvironment.js']);
  });

  it('HTTP request logging records the path without its query string', () => {
    assert.match(source, /morgan\.token\('safe-path'/);
    assert.ok(!/morgan\('dev'/.test(source), 'no raw morgan dev format (it prints the full URL, including OAuth codes)');
  });
});
