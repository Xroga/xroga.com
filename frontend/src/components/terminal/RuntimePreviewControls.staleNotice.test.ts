import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * A running preview that was started from an earlier saved version must say so. The component is only shown the state the server reports, so these
 * checks pin that the notice exists, is announced to assistive technology, appears only for a ready preview the server called stale, and is never
 * shown for a current or unknown one.
 */
describe('the preview controls never present an older version as the latest', () => {
  const source = readFileSync(new URL('./RuntimePreviewControls.tsx', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../../store/useLiveBuildStore.ts', import.meta.url), 'utf8');

  it('shows a notice only when a ready preview is reported stale, and announces it', () => {
    const notice = /\{preview\.status === 'ready' && preview\.sourceState === 'stale' \? \(([\s\S]*?)\) : null\}/.exec(source);
    assert.ok(notice, 'the stale notice is conditional on a ready preview that is stale');
    assert.match(notice![1]!, /role="status"/);
    assert.match(notice![1]!, /Older version/);
    assert.doesNotMatch(source, /sourceState === 'current'[\s\S]{0,40}Older version/, 'a current preview does not get the notice');
  });

  it('the store type carries the server\'s source state, optional so older servers still work', () => {
    assert.match(store, /sourceState\?:\s*'current' \| 'stale' \| 'unknown'/);
  });
});
