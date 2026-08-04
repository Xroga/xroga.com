/**
 * The pre-QA preview must not claim a build passed.
 *
 * Production evidence for why this file exists: the payload emitted immediately after the
 * builder responded carried `buildOk: true`. At that instant nothing had been installed,
 * nothing had compiled, no typecheck had run and no test had executed — the builder had
 * simply returned text. Every consumer of that payload (the terminal, the workspace status,
 * the run table, the landing outcome) therefore treated "files were generated" and "the
 * build passed" as the same fact.
 *
 * `pipeline.ts` is a very large module with side effects at import time and a provider call
 * at the centre of the path under test, so — matching the existing convention in this
 * codebase for pinning transport and payload shape (see `streamStallGuard.test.ts`,
 * `conversationPersist.test.ts`) — these are source-shape assertions on the specific
 * property that made the false claim.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { VERIFICATION_STATES } from './verificationLifecycle.js';

/**
 * LF-normalised. These assertions locate a region of source by searching for literals that
 * contain newlines, which finds nothing on a CRLF checkout — the slice then comes back
 * empty and the test fails for a reason unrelated to the code under test.
 */
function pipelineSource(): string {
  return readFileSync(new URL('./pipeline.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

/** The preview payload assembled before QA runs, identified by its `shipPending` marker. */
function previewPayload(source: string): string {
  const anchor = source.indexOf('shipPending: true');
  assert.notEqual(anchor, -1, 'could not find the pre-QA preview payload in pipeline.ts');
  // Walk back to the start of the object literal and forward past the emit that follows it.
  const start = source.lastIndexOf('const previewOutput', 0 + anchor);
  assert.notEqual(start, -1, 'the pre-QA preview payload is no longer assigned to previewOutput');
  const end = source.indexOf('onCodeReady', anchor);
  assert.notEqual(end, -1, 'the pre-QA preview is no longer handed to onCodeReady');
  // Comments are stripped so that prose *about* the old `buildOk: true` claim — including the
  // comment in pipeline.ts explaining why it was removed — cannot be mistaken for the claim.
  return source
    .slice(start, end)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('the pre-QA preview payload', () => {
  it('does not assert a successful build before anything has compiled', () => {
    const payload = previewPayload(pipelineSource());
    assert.doesNotMatch(
      payload,
      /buildOk:\s*true/,
      'the preview payload claims buildOk before QA has run — this is the regression this file guards',
    );
  });

  it('reports its position in the verification lifecycle instead', () => {
    const payload = previewPayload(pipelineSource());
    assert.match(payload, /verificationState:\s*'generated_unverified'/);
  });

  it('uses a state that the canonical lifecycle actually defines', () => {
    const payload = previewPayload(pipelineSource());
    const match = payload.match(/verificationState:\s*'([a-z_]+)'/);
    assert.ok(match, 'the preview payload declares no verification state');
    assert.ok(
      (VERIFICATION_STATES as readonly string[]).includes(match![1]),
      `"${match![1]}" is not a state in the canonical lifecycle`,
    );
  });

  it('tells the user in words that the preview is not verified', () => {
    const payload = previewPayload(pipelineSource());
    assert.match(payload, /not verified yet/i);
  });

  it('never labels the generated state as ready, shipped, live or deployed', () => {
    const payload = previewPayload(pipelineSource());
    // Scoped to the status strings the user actually sees, so an unrelated identifier
    // elsewhere in the payload cannot fail this.
    for (const forbidden of [/swarmStatusLabel:\s*'[^']*\b(ready|live|deployed|shipped|verified)\b/i]) {
      const hit = payload.match(forbidden);
      if (hit) {
        assert.match(
          hit[0],
          /not verified/i,
          `the preview status label claims "${hit[0]}" before QA has run`,
        );
      }
    }
  });
});
