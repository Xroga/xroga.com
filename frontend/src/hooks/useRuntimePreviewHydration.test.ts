import assert from 'node:assert/strict';

import test from 'node:test';

import {
  runtimePreviewHydrationTarget,
} from './useRuntimePreviewHydration';

test(
  'canonical workspace identity wins over a stale persisted Preview',
  () => {
    assert.equal(
      runtimePreviewHydrationTarget(
        'project-b',
        'repo:branch:/',
        'project-a',
      ),
      'project-b',
    );
  },
);

test(
  'a restoring canonical context blocks cross-project Preview fallback',
  () => {
    assert.equal(
      runtimePreviewHydrationTarget(
        null,
        'repo:branch:/',
        'project-a',
      ),
      null,
    );
  },
);

test(
  'legacy sessions can use persisted Preview identity only without an active context',
  () => {
    assert.equal(
      runtimePreviewHydrationTarget(
        null,
        null,
        'legacy-project',
      ),
      'legacy-project',
    );
  },
);
