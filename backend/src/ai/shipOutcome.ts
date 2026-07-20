/**
 * Honest ship outcome — never mark success as “shipped” when artifacts/live URL are missing.
 */

export type ProductScaffoldKind = 'static' | 'nextjs' | 'expo' | 'chrome' | 'electron';

export type ShipOutcomeInput = {
  kind: ProductScaffoldKind;
  patchAborted: boolean;
  securityBlocked: boolean;
  compileBlocksShip: boolean;
  /** Structural / critical QA — blocks ship when true */
  qaBlocksShip: boolean;
  githubConnected: boolean;
  vercelConnected: boolean;
  shouldPush: boolean;
  githubPushConfirmed: boolean;
  deployUrl?: string;
  liveOk?: boolean;
  /** Chrome: zip download URL present */
  chromeZipOk: boolean;
  /** Electron: tag/dispatch accepted by GitHub */
  electronReleaseTriggered: boolean;
  chromeZipError?: string;
  electronReleaseError?: string;
};

export type ShipOutcome = {
  buildOk: boolean;
  /** Free-path agent work finished for this product kind */
  fullyShipped: boolean;
  shipOk: boolean;
  shipBlockers: string[];
  nextSteps: string[];
  statusLabel: string;
  statusMessage: string;
  verifyPass: boolean;
  verifyLines: string[];
};

export function computeShipOutcome(input: ShipOutcomeInput): ShipOutcome {
  const isNonWeb = input.kind === 'chrome' || input.kind === 'electron' || input.kind === 'expo';
  const shipBlockers: string[] = [];
  const nextSteps: string[] = [];

  if (!input.githubConnected) shipBlockers.push('Connect GitHub to push code to your repo');
  if (!isNonWeb && !input.vercelConnected) {
    shipBlockers.push('Connect Vercel to deploy live to your account');
  }
  if (input.patchAborted) shipBlockers.push('Unsafe patches aborted — live site unchanged');
  if (input.securityBlocked) shipBlockers.push('Critical secrets blocked the push');
  if (input.compileBlocksShip) shipBlockers.push('Compile failed — fix TypeScript/install before ship');
  if (input.qaBlocksShip) shipBlockers.push('Critical project structure issues — fix before ship');

  if (input.shouldPush && !input.githubPushConfirmed) {
    shipBlockers.push('GitHub push did not complete');
  }

  if (input.kind === 'chrome' && input.githubPushConfirmed && !input.chromeZipOk) {
    shipBlockers.push(
      input.chromeZipError ||
        'Chrome extension.zip was not uploaded to GitHub Releases — re-run ship or npm run zip',
    );
  }
  if (input.kind === 'electron' && input.githubPushConfirmed && !input.electronReleaseTriggered) {
    shipBlockers.push(
      input.electronReleaseError ||
        'Desktop release was not triggered — tag v* or run Desktop release on GitHub Actions',
    );
  }
  if (!isNonWeb && input.githubPushConfirmed && !input.deployUrl) {
    shipBlockers.push('Vercel deploy did not produce a live URL');
  }
  if (!isNonWeb && input.deployUrl && input.liveOk === false) {
    shipBlockers.push('Live URL check failed — open Vercel logs or redeploy');
  }

  const buildOk =
    !input.patchAborted &&
    !input.securityBlocked &&
    !input.compileBlocksShip &&
    !input.qaBlocksShip;

  let fullyShipped = false;
  if (buildOk && input.githubPushConfirmed) {
    if (input.kind === 'chrome') fullyShipped = input.chromeZipOk;
    else if (input.kind === 'electron') fullyShipped = input.electronReleaseTriggered;
    else if (input.kind === 'expo') fullyShipped = true; // free path = GitHub for Expo Go
    else fullyShipped = Boolean(input.deployUrl && input.liveOk !== false);
  }

  // Honest next steps (even when shipped)
  if (input.kind === 'chrome' && fullyShipped) {
    nextSteps.push('Sideload: chrome://extensions → Load unpacked, or upload extension.zip to CWS (~$5 on your account)');
  }
  if (input.kind === 'electron' && fullyShipped) {
    nextSteps.push(
      'Wait until GitHub Actions is green, then download the unsigned zip from Releases (signing/stores are on you)',
    );
  }
  if (input.kind === 'expo' && input.githubPushConfirmed) {
    nextSteps.push(
      'EAS / App Store / Play are NOT done yet — open Publish → Connect Expo (your token; you pay Apple/Google/EAS)',
    );
  }
  if (!isNonWeb && fullyShipped) {
    nextSteps.push('Optional: Connect Supabase for DB/memory if the app needs it');
  }
  if (buildOk && !fullyShipped && shipBlockers.length) {
    nextSteps.push(...shipBlockers.slice(0, 3));
  }

  const shipOk =
    buildOk &&
    (input.shouldPush ? input.githubPushConfirmed : !input.githubConnected ? false : true);

  const verifyLines: string[] = [];
  if (input.githubPushConfirmed) verifyLines.push('✅ GitHub push confirmed');
  else if (input.githubConnected) verifyLines.push('❌ GitHub push missing');
  else verifyLines.push('❌ GitHub not connected');

  if (input.kind === 'chrome') {
    verifyLines.push(
      input.chromeZipOk
        ? '✅ extension.zip on GitHub Releases'
        : '❌ extension.zip not on Releases',
    );
  } else if (input.kind === 'electron') {
    verifyLines.push(
      input.electronReleaseTriggered
        ? '✅ Desktop release triggered (Actions may still be building)'
        : '❌ Desktop release not triggered',
    );
  } else if (input.kind === 'expo') {
    verifyLines.push('✅ Code on GitHub (Expo Go path)');
    verifyLines.push('ℹ️ EAS / store submit not run by this build');
  } else {
    if (input.deployUrl) {
      verifyLines.push(
        input.liveOk === false ? `❌ Live URL failed: ${input.deployUrl}` : `✅ Live: ${input.deployUrl}`,
      );
    } else {
      verifyLines.push('❌ No Vercel live URL');
    }
  }

  const verifyPass = fullyShipped;

  let statusMessage: string;
  let statusLabel: string;
  if (input.patchAborted) {
    statusMessage = 'Update aborted — site unchanged';
    statusLabel = 'Aborted';
  } else if (fullyShipped) {
    if (input.kind === 'chrome') {
      statusMessage = 'Extension shipped — zip on GitHub Releases';
      statusLabel = 'Shipped';
    } else if (input.kind === 'electron') {
      statusMessage = 'Desktop pushed — release started (wait for Actions zip)';
      statusLabel = 'Release started';
    } else if (input.kind === 'expo') {
      statusMessage = 'Mobile on GitHub — EAS/store still needs Publish → Expo';
      statusLabel = 'On GitHub';
    } else {
      statusMessage = 'Build shipped & verified live';
      statusLabel = 'Shipped';
    }
  } else if (buildOk) {
    statusMessage = shipBlockers[0]
      ? `Built — not fully shipped: ${shipBlockers[0]}`
      : 'Built — connect integrations to finish ship';
    statusLabel = 'Built · incomplete';
  } else {
    statusMessage = shipBlockers[0]
      ? `Build finished with blockers: ${shipBlockers[0]}`
      : 'Build finished with failures';
    statusLabel = 'Needs attention';
  }

  return {
    buildOk,
    fullyShipped,
    shipOk: shipOk && (fullyShipped || !input.shouldPush),
    shipBlockers: [...new Set(shipBlockers)],
    nextSteps: [...new Set(nextSteps)],
    statusLabel,
    statusMessage,
    verifyPass,
    verifyLines,
  };
}
