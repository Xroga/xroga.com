import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeGitHubInspectionResponse,
  isNeutralXrogaBootstrapTree,
} from './githubDeploy.js';

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

test('GitHub inspection distinguishes rate exhaustion from revoked authorization', () => {
  const limited = {
    status: 403,
    headers: new Headers({
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': '1893456000',
    }),
  };
  assert.equal(
    describeGitHubInspectionResponse(limited, 'repository'),
    'GitHub API rate limit is temporarily exhausted; try again after 2030-01-01T00:00:00.000Z',
  );

  assert.equal(
    describeGitHubInspectionResponse(
      { status: 403, headers: new Headers({ 'x-ratelimit-remaining': '120' }) },
      'branch',
    ),
    'GitHub authorization cannot inspect the target branch',
  );
});
