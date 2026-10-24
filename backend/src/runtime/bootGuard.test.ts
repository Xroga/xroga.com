import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * index.ts starts a server when imported, so the boot wiring cannot be exercised as a unit. This test pins the wiring itself: every
 * database-writing boot duty must sit inside the block that checks the policy decision, so a later edit cannot quietly move a call outside it.
 */
const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

/** the text between the braces of the block opened by the first occurrence of `guard` */
function blockOf(guard: string): { start: number; end: number } {
  const at = source.indexOf(guard);
  assert.ok(at >= 0, `missing guard: ${guard}`);
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return { start: open, end: i };
  }
  throw new Error('unbalanced braces');
}

const calls = (re: RegExp): number[] => [...source.matchAll(re)].map((m) => m.index!);

describe('boot duties are gated by the startup policy', () => {
  it('every schema-ensure call is inside `if (startup.duties.ensureSchemas)`', () => {
    const block = blockOf('if (startup.duties.ensureSchemas)');
    const found = calls(/\bensure\w*Schema\(\)/g);
    assert.ok(found.length >= 5, 'the five schema-ensure calls still exist');
    for (const at of found) assert.ok(at > block.start && at < block.end, `ensure*Schema call at ${at} is outside the policy guard`);
  });

  it('orphaned-run reconciliation is inside `if (startup.duties.reconcileOrphanedRuns)`', () => {
    const block = blockOf('if (startup.duties.reconcileOrphanedRuns)');
    const found = calls(/\breconcileOrphanedRuns\(/g);
    assert.equal(found.length, 1, 'exactly one boot call site');
    assert.ok(found[0]! > block.start && found[0]! < block.end);
  });

  it('the decision is made before any duty runs', () => {
    const decided = source.indexOf('decideStartup()');
    assert.ok(decided > 0);
    assert.ok(decided < source.indexOf('if (startup.duties.ensureSchemas)'));
    assert.ok(decided < source.indexOf('if (startup.duties.reconcileOrphanedRuns)'));
  });

  it('/ready uses the shared evaluator, so it can never report ready on a missing mandatory dependency', () => {
    assert.match(source, /app\.get\('\/ready'[\s\S]{0,400}runReadiness\(apiProbes\(/);
  });
});
