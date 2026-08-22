import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNeutralXrogaBootstrapTree } from './githubDeploy.js';

test('the exact neutral Xroga marker is source-empty', () => {
  assert.equal(
    isNeutralXrogaBootstrapTree([
      { path: '.xroga', type: 'tree' },
      { path: '.xroga/bootstrap', type: 'blob' },
    ]),
    true,
  );
});

test('a tiny real repository is never mistaken for the neutral bootstrap marker', () => {
  assert.equal(
    isNeutralXrogaBootstrapTree([{ path: 'index.html', type: 'blob' }]),
    false,
  );
  assert.equal(
    isNeutralXrogaBootstrapTree([
      { path: '.xroga', type: 'tree' },
      { path: '.xroga/bootstrap', type: 'blob' },
      { path: 'README.md', type: 'blob' },
    ]),
    false,
  );
});
