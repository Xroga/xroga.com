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
  it('does not mark web success without live URL', () => {
    const o = computeShipOutcome({
      ...base,
      kind: 'nextjs',
      deployUrl: undefined,
    });
    assert.equal(o.buildOk, true);
    assert.equal(o.fullyShipped, false);
    assert.ok(o.shipBlockers.some((b) => /Vercel deploy/i.test(b)));
  });

  it('requires chrome zip for fullyShipped', () => {
    const missing = computeShipOutcome({
      ...base,
      kind: 'chrome',
      vercelConnected: false,
      chromeZipOk: false,
    });
    assert.equal(missing.fullyShipped, false);

    const shipped = computeShipOutcome({
      ...base,
      kind: 'chrome',
      vercelConnected: false,
      chromeZipOk: true,
    });
    assert.equal(shipped.fullyShipped, true);
  });

  it('requires electron zip downloadable for fullyShipped', () => {
    const no = computeShipOutcome({
      ...base,
      kind: 'electron',
      vercelConnected: false,
      electronZipOk: false,
    });
    assert.equal(no.fullyShipped, false);

    const yes = computeShipOutcome({
      ...base,
      kind: 'electron',
      vercelConnected: false,
      electronZipOk: true,
    });
    assert.equal(yes.fullyShipped, true);
    assert.match(yes.statusMessage, /zip ready/i);
  });

  it('expo github path + eas next steps', () => {
    const o = computeShipOutcome({
      ...base,
      kind: 'expo',
      vercelConnected: false,
      easTriggered: false,
    });
    assert.equal(o.fullyShipped, true);
    assert.ok(o.nextSteps.some((s) => /EAS|Expo/i.test(s)));
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
