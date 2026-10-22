import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('isolated launcher reconciliation preserves main empty-state control and scoped explicit-hide draft flush',()=>{
  const source=readFileSync(new URL('../components/terminal/WorkspaceLauncher.tsx',import.meta.url),'utf8');
  assert.match(source,/messages\.length === 0 && !loading && !sessionRestoring/);
  assert.match(source,/disabled=\{emptyWorkspace\}/);
  assert.match(source,/aria-pressed=\{!emptyWorkspace && chatbarHidden\}/);
  assert.ok(source.indexOf('if (emptyWorkspace) return;')<source.indexOf('document.querySelectorAll'));
  assert.match(source,/draftForExplicitHide\(snapshots/);
  assert.match(source,/owner: identity\.status === 'guest' \? 'guest' : identity\.userId \?\? ''/);
  assert.match(source,/session: sessionId, project: projectId \?\? ''/);
  assert.ok(source.indexOf('flushSync(() => setPrompt(latestDraft))')<source.indexOf('setChatbarHidden(!chatbarHidden)'));
});
