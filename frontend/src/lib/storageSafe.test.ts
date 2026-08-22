import assert from 'node:assert/strict';
import { test } from 'node:test';

import { messagesForStorage } from './storageSafe';

test('landing snapshots keep authoritative recovery and shipping evidence', () => {
  const [stored] = messagesForStorage([
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      featureOutput: {
        type: 'landing_page',
        artifactRunId: 'run-b',
        repositorySourceRecovered: true,
        html: '<main>large generated source</main>',
        css: 'body { color: white; }',
        js: 'console.log("built")',
        githubRepoName: 'Xroga/orbit-coffee',
        githubPushConfirmed: true,
        githubBranch: 'xroga/run-b',
        commitSha: 'c55c7a2',
        buildOk: true,
        isUpdate: true,
        shipBlockers: ['Connect Vercel'],
        changesSummary: ['Added Eclipse Blend'],
      },
    },
  ]);

  const output = stored?.featureOutput as Record<string, unknown>;
  assert.equal(output.html, '', 'large source stays outside terminal snapshots');
  assert.equal(output.css, '');
  assert.equal(output.js, '');
  assert.equal(output.artifactRunId, 'run-b');
  assert.equal(output.repositorySourceRecovered, true);
  assert.equal(output.githubPushConfirmed, true);
  assert.equal(output.githubRepoName, 'Xroga/orbit-coffee');
  assert.equal(output.githubBranch, 'xroga/run-b');
  assert.equal(output.commitSha, 'c55c7a2');
  assert.equal(output.buildOk, true);
  assert.equal(output.isUpdate, true);
  assert.deepEqual(output.shipBlockers, ['Connect Vercel']);
  assert.deepEqual(output.changesSummary, ['Added Eclipse Blend']);
});
