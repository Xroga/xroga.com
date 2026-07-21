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

  it('chrome zip is handoffReady but never fullyShipped', () => {
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
    assert.equal(ready.statusLabel, 'Ready to install');
    assert.match(ready.statusMessage, /Load unpacked|install/i);
  });

  it('electron zip is handoffReady but never fullyShipped', () => {
    const no = computeShipOutcome({
      ...base,
      kind: 'electron',
      vercelConnected: false,
      electronZipOk: false,
    });
    assert.equal(no.fullyShipped, false);
    assert.equal(no.handoffReady, false);

    const yes = computeShipOutcome({
      ...base,
      kind: 'electron',
      vercelConnected: false,
      electronZipOk: true,
    });
    assert.equal(yes.fullyShipped, false);
    assert.equal(yes.handoffReady, true);
    assert.equal(yes.statusLabel, 'Ready to run');
    assert.match(yes.statusMessage, /npm install/i);
  });

  it('expo github path is handoff only — never store-shipped', () => {
    const o = computeShipOutcome({
      ...base,
      kind: 'expo',
      vercelConnected: false,
      easTriggered: false,
    });
    assert.equal(o.fullyShipped, false);
    assert.equal(o.handoffReady, true);
    assert.equal(o.statusLabel, 'Source ready');
    assert.ok(o.nextSteps.some((s) => /Connect Expo|EAS/i.test(s)));
    assert.ok(o.verifyLines.some((l) => /App Store|Play/i.test(l)));
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
