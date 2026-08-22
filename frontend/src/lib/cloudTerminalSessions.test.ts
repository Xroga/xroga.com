import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('a newer terminal snapshot waits for an in-flight write instead of being discarded', () => {
  const source = readFileSync(new URL('./cloudTerminalSessions.ts', import.meta.url), 'utf8');
  const inFlightBranch = source.slice(
    source.indexOf('const inFlight = inFlightUploads.get(entry.id);'),
    source.indexOf('const body = {'),
  );

  assert.match(inFlightBranch, /await inFlight/);
  assert.match(inFlightBranch, /return pushTerminalSessionToCloudNow\(entry\)/);
  assert.doesNotMatch(inFlightBranch, /if \(inFlight\) return inFlight/);
});
