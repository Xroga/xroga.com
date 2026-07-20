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
  electronReleaseTriggered: false,
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
    assert.equal(missing.verifyPass, false);

    const shipped = computeShipOutcome({
      ...base,
      kind: 'chrome',
      vercelConnected: false,
      chromeZipOk: true,
    });
    assert.equal(shipped.fullyShipped, true);
    assert.equal(shipped.verifyPass, true);
  });

  it('expo github-only is free path but nextSteps mention EAS', () => {
    const o = computeShipOutcome({
      ...base,
      kind: 'expo',
      vercelConnected: false,
    });
    assert.equal(o.fullyShipped, true);
    assert.ok(o.nextSteps.some((s) => /EAS/i.test(s)));
    assert.ok(o.verifyLines.some((l) => /EAS|store/i.test(l)));
  });

  it('electron requires release trigger', () => {
    const no = computeShipOutcome({
      ...base,
      kind: 'electron',
      vercelConnected: false,
      electronReleaseTriggered: false,
    });
    assert.equal(no.fullyShipped, false);

    const yes = computeShipOutcome({
      ...base,
      kind: 'electron',
      vercelConnected: false,
      electronReleaseTriggered: true,
    });
    assert.equal(yes.fullyShipped, true);
    assert.match(yes.statusMessage, /Actions/i);
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
