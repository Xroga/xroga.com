import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * When the server reports that part of a run's history is no longer retained, the reconnecting client says so once rather than presenting the jump as
 * continuous history. The reconnect loop is internal to api.ts, so this pins its contract at the source: the flag is read from the server response,
 * the notice is emitted at most once, and the existing de-duplication by sequence is unchanged.
 */
describe('reconnect reports lost history instead of hiding it', () => {
  const source = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');

  it('reads eventsTruncated from the run response and notes the gap at most once', () => {
    assert.match(source, /let notedHistoryGap = false;/);
    assert.match(source, /if \(run\.eventsTruncated && !notedHistoryGap\) \{\s*notedHistoryGap = true;/);
    assert.match(source, /Some earlier progress is no longer available/);
  });

  it('still skips events at or below the cursor, so a duplicate delivery changes nothing', () => {
    assert.match(source, /event\.sequence\s*<=\s*lastSequence/);
  });

  it('the run summary type carries the optional fields, so an older server still works', () => {
    assert.match(source, /eventsTruncated\?:\s*boolean;/);
    assert.match(source, /firstRetainedSequence\?:\s*number \| null;/);
  });
});
