import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveLandingOutcome, isLegacyFabricatedLiveText } from './landingOutcome';

describe('deriveLandingOutcome', () => {
  it('never calls an unpushed preview ready or live', () => {
    const view = deriveLandingOutcome(
      {
        type: 'landing_page',
        buildOk: true,
        githubRepoName: 'Xroga/defi-test',
        githubPushConfirmed: false,
        fullyShipped: false,
        shipBlockers: ['GitHub push did not complete'],
      },
      { projectName: 'DeFi dashboard', isUpdate: false },
    );

    assert.equal(view.headline, 'DeFi dashboard built · shipping incomplete');
    assert.equal(view.workspaceStatus, 'degraded');
    assert.match(view.completionNote, /not shipped/i);
    assert.ok(view.statusLines.some((line) => /not pushed/i.test(line)));
    assert.ok(view.statusLines.some((line) => /GitHub push did not complete/i.test(line)));
  });

  it('requires verified deployment evidence before claiming a web ship', () => {
    const unverified = deriveLandingOutcome(
      {
        githubRepoName: 'Xroga/defi-test',
        githubPushConfirmed: true,
        fullyShipped: true,
        deployUrl: 'https://defi-test.vercel.app',
        deployVerified: false,
      },
      { projectName: 'DeFi dashboard', isUpdate: false },
    );
    assert.equal(unverified.fullyShipped, false);
    assert.notEqual(unverified.workspaceStatus, 'live');

    const verified = deriveLandingOutcome(
      {
        githubRepoName: 'Xroga/defi-test',
        githubPushConfirmed: true,
        fullyShipped: true,
        deployUrl: 'https://defi-test.vercel.app',
        deployVerified: true,
      },
      { projectName: 'DeFi dashboard', isUpdate: false },
    );
    assert.equal(verified.headline, 'Shipped DeFi dashboard');
    assert.equal(verified.workspaceStatus, 'live');
  });

  it('deduplicates persisted blocker evidence', () => {
    const view = deriveLandingOutcome(
      {
        buildOk: false,
        shipOutcome: { blockers: ['Compile failed'] },
        shipBlockers: ['Compile failed'],
      },
      { projectName: 'Project', isUpdate: false },
    );
    assert.deepEqual(view.blockers, ['Compile failed']);
  });

  it('recognizes the legacy fabricated live fallback', () => {
    assert.equal(isLegacyFabricatedLiveText('🎉 YOUR PROJECT IS LIVE!'), true);
    assert.equal(isLegacyFabricatedLiveText('Shipped Project'), false);
  });
});
