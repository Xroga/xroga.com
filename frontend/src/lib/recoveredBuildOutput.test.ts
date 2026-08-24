import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isRecoverableBuildOutput,
  latestRecoverableLandingOutput,
  recoveredLandingWorkspaceBuild,
} from './recoveredBuildOutput';

const current = {
  repo: 'Xroga/orbit-coffee',
  branch: 'main',
  projectName: 'Orbit Coffee',
  html: '<html><body>old preview</body></html>',
  css: 'body{color:black}',
  js: 'window.old=true',
};

test('completed-while-away output restores authoritative preview and ship metadata', () => {
  const output = {
    type: 'landing_page',
    projectName: 'Orbit Coffee',
    html: '<!doctype html><html><body><main>Fresh Orbit Coffee preview</main></body></html>',
    css: 'body{color:white}',
    js: 'window.ready=true',
    projectFiles: [
      { path: 'index.html', content: '<main>Fresh Orbit Coffee preview</main>' },
      { path: 'styles.css', content: 'body{color:white}' },
    ],
    githubRepoName: 'Xroga/orbit-coffee',
    githubRepoUrl: 'https://github.com/Xroga/orbit-coffee',
    githubBranch: 'main',
    githubPushConfirmed: true,
    commitSha: 'abc123',
    deployUrl: 'https://orbit-coffee.vercel.app',
    deployVerified: true,
    fullyShipped: true,
    buildOk: true,
  };

  assert.equal(isRecoverableBuildOutput(output), true);
  const payload = recoveredLandingWorkspaceBuild(output, current, null);
  assert.ok(payload);
  assert.match(payload.html, /Fresh Orbit Coffee preview/);
  assert.equal(payload.repo, 'Xroga/orbit-coffee');
  assert.equal(payload.commitSha, 'abc123');
  assert.equal(payload.deployUrl, 'https://orbit-coffee.vercel.app');
  assert.equal(payload.status, 'live');
  assert.equal(payload.openPreview, true);
  assert.equal(payload.projectFiles?.length, 2);
});

test('recovered update keeps existing preview fields only when the durable output omitted them', () => {
  const payload = recoveredLandingWorkspaceBuild(
    {
      type: 'landing_page',
      isUpdate: true,
      projectName: 'Orbit Coffee',
      html: '<!doctype html><html><body><main>Updated source</main></body></html>',
      css: '',
      js: '',
      projectFiles: [{ path: 'index.html', content: '<main>Updated source</main>' }],
      buildOk: true,
    },
    current,
    null,
  );

  assert.ok(payload);
  assert.match(payload.html, /Updated source/);
  assert.equal(payload.css, current.css);
  assert.equal(payload.js, current.js);
  assert.equal(payload.projectName, 'Orbit Coffee');
});

test('a bare landing marker cannot overwrite a restored workspace', () => {
  assert.equal(recoveredLandingWorkspaceBuild({ type: 'landing_page' }, current, null), null);
});

test('reload selects the newest assistant landing artifact that owns real source', () => {
  const older = { type: 'landing_page', html: '<main>Older generated website source</main>' };
  const newest = { type: 'landing_page', html: '<main>Current generated website source</main>' };
  assert.equal(
    latestRecoverableLandingOutput([
      { role: 'assistant', featureOutput: older },
      { role: 'user' },
      { role: 'assistant', featureOutput: { type: 'landing_page' } },
      { role: 'assistant', featureOutput: newest },
    ]),
    newest
  );
});

test('reload ignores non-assistant and source-less landing markers', () => {
  assert.equal(
    latestRecoverableLandingOutput([
      { role: 'user', featureOutput: { type: 'landing_page', html: '<main>not output</main>' } },
      { role: 'assistant', featureOutput: { type: 'landing_page' } },
    ]),
    null
  );
});
