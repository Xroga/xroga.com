import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planGitHubShipping } from './githubShippingPlan.js';

const snapshot = [
  { path: 'index.html', content: '<h1>DeFi</h1>' },
  { path: 'styles.css', content: 'body{}' },
];

describe('planGitHubShipping', () => {
  it('pushes the full cached snapshot when the real target repository is empty', () => {
    const plan = planGitHubShipping({
      isUpdate: true,
      targetRepo: 'Xroga/defi-smoke',
      nextFiles: snapshot,
      changedFiles: [],
      deletedPaths: [],
      remoteState: { status: 'empty', branch: 'main' },
    });
    assert.deepEqual(plan.filesToPush, snapshot);
    assert.equal(plan.blocker, undefined);
  });

  it('reuses a matching verified remote commit without creating a duplicate commit', () => {
    const sha = 'a'.repeat(40);
    const plan = planGitHubShipping({
      isUpdate: true,
      targetRepo: 'Xroga/defi-smoke',
      nextFiles: snapshot,
      changedFiles: [],
      deletedPaths: [],
      priorCommitSha: sha,
      remoteState: { status: 'head', branch: 'main', headSha: sha },
    });
    assert.equal(plan.reuseCommitSha, sha);
    assert.deepEqual(plan.filesToPush, []);
  });

  it('blocks a stale cached snapshot instead of overwriting a changed remote branch', () => {
    const plan = planGitHubShipping({
      isUpdate: true,
      targetRepo: 'Xroga/defi-smoke',
      nextFiles: snapshot,
      changedFiles: [],
      deletedPaths: [],
      priorCommitSha: 'a'.repeat(40),
      remoteState: { status: 'head', branch: 'main', headSha: 'b'.repeat(40) },
    });
    assert.match(plan.blocker ?? '', /branch changed/i);
    assert.deepEqual(plan.filesToPush, []);
  });

  it('fails closed when the target branch cannot be inspected', () => {
    const plan = planGitHubShipping({
      isUpdate: true,
      targetRepo: 'Xroga/defi-smoke',
      nextFiles: snapshot,
      changedFiles: [],
      deletedPaths: [],
      remoteState: { status: 'unavailable', branch: 'main', reason: 'not authorized' },
    });
    assert.match(plan.blocker ?? '', /not authorized/i);
    assert.deepEqual(plan.filesToPush, []);
  });
});
