import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeShipOutcome } from './shipOutcome.js';

const base = {
  patchAborted: false,
  securityBlocked: false,
  compileBlocksShip: false,
  qaBlocksShip: false,
  githubConnected: true,
  vercelConnected: true,
  shouldPush: true,
  githubPushConfirmed: true,
  chromeZipOk: false,
  electronZipOk: false,
} as const;

describe('computeShipOutcome', () => {
  it('web requires live URL for fullyShipped', () => {
    const o = computeShipOutcome({
      ...base,
      kind: 'nextjs',
      deployUrl: undefined,
    });
    assert.equal(o.fullyShipped, false);
    assert.equal(o.handoffReady, false);
  });

  it('web live URL = fullyShipped', () => {
    const o = computeShipOutcome({
      ...base,
      kind: 'nextjs',
      deployUrl: 'https://example.vercel.app',
      liveOk: true,
    });
    assert.equal(o.fullyShipped, true);
    assert.equal(o.handoffReady, true);
    assert.equal(o.statusLabel, 'Shipped');
  });

  it('chrome zip is handoff; CWS submit is fullyShipped', () => {
    const missing = computeShipOutcome({
      ...base,
      kind: 'chrome',
      vercelConnected: false,
      chromeZipOk: false,
    });
    assert.equal(missing.fullyShipped, false);
    assert.equal(missing.handoffReady, false);

    const ready = computeShipOutcome({
      ...base,
      kind: 'chrome',
      vercelConnected: false,
      chromeZipOk: true,
    });
    assert.equal(ready.fullyShipped, false);
    assert.equal(ready.handoffReady, true);
    assert.equal(ready.storeSubmitted, false);

    const submitted = computeShipOutcome({
      ...base,
      kind: 'chrome',
      vercelConnected: false,
      chromeZipOk: true,
      chromeStoreSubmitted: true,
      chromeStoreUrl: 'https://chrome.google.com/webstore/devconsole/x',
    });
    assert.equal(submitted.fullyShipped, true);
    assert.equal(submitted.storeSubmitted, true);
    assert.match(submitted.statusMessage, /review/i);
  });

  it('electron installer binary = fullyShipped', () => {
    const portable = computeShipOutcome({
      ...base,
      kind: 'electron',
      vercelConnected: false,
      electronZipOk: true,
      electronInstallerOk: false,
    });
    assert.equal(portable.fullyShipped, false);
    assert.equal(portable.handoffReady, true);

    const installer = computeShipOutcome({
      ...base,
      kind: 'electron',
      vercelConnected: false,
      electronZipOk: true,
      electronInstallerOk: true,
    });
    assert.equal(installer.fullyShipped, true);
    assert.equal(installer.statusLabel, 'Installer ready');
  });

  it('expo eas build artifact = fullyShipped; submit is separate', () => {
    const source = computeShipOutcome({
      ...base,
      kind: 'expo',
      vercelConnected: false,
      easTriggered: false,
    });
    assert.equal(source.fullyShipped, false);
    assert.equal(source.handoffReady, true);

    const built = computeShipOutcome({
      ...base,
      kind: 'expo',
      vercelConnected: false,
      easTriggered: true,
      easBuildOk: true,
      easArtifactUrl: 'https://expo.dev/artifacts/x',
    });
    assert.equal(built.fullyShipped, true);
    assert.equal(built.storeSubmitted, false);

    const submitted = computeShipOutcome({
      ...base,
      kind: 'expo',
      vercelConnected: false,
      easTriggered: true,
      easBuildOk: true,
      easStoreSubmitted: true,
    });
    assert.equal(submitted.fullyShipped, true);
    assert.equal(submitted.storeSubmitted, true);
  });

  it('qa critical blocks buildOk', () => {
    const o = computeShipOutcome({
      ...base,
      kind: 'static',
      qaBlocksShip: true,
      shouldPush: false,
      githubPushConfirmed: false,
    });
    assert.equal(o.buildOk, false);
  });
});
