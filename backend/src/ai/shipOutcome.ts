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
  /** Electron: unsigned .zip asset downloadable on Releases */
  electronZipOk: boolean;
  /** Expo: EAS workflow dispatched when user had Expo token */
  easTriggered?: boolean;
  easUrl?: string;
  chromeZipError?: string;
  electronReleaseError?: string;
  easError?: string;
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
  if (input.kind === 'electron' && input.githubPushConfirmed && !input.electronZipOk) {
    shipBlockers.push(
      input.electronReleaseError ||
        'Desktop zip not downloadable yet — open GitHub Actions/Releases and wait for the .zip asset',
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
    else if (input.kind === 'electron') fullyShipped = input.electronZipOk;
    else if (input.kind === 'expo') fullyShipped = true; // GitHub = Expo Go free path
    else fullyShipped = Boolean(input.deployUrl && input.liveOk !== false);
  }

  if (input.kind === 'chrome' && fullyShipped) {
    nextSteps.push(
      'Sideload free, or upload extension.zip to Chrome Web Store (~$5 on your developer account — Xroga does not pay/publish)',
    );
  }
  if (input.kind === 'electron' && fullyShipped) {
    nextSteps.push(
      'Unsigned zip is ready. Code signing / Mac App Store / Microsoft Store fees are on you if you need them.',
    );
  }
  if (input.kind === 'expo' && input.githubPushConfirmed) {
    if (input.easTriggered) {
      nextSteps.push(
        input.easUrl
          ? `EAS started on your Expo account — watch: ${input.easUrl} (you pay Apple/Google/EAS)`
          : 'EAS started on your Expo account (you pay Apple/Google/EAS)',
      );
    } else {
      nextSteps.push(
        input.easError
          ? `EAS not started: ${input.easError}. Open Publish → Connect Expo (your token).`
          : 'EAS / App Store / Play not done — Publish → Connect Expo (your token; you pay fees)',
      );
    }
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
      input.electronZipOk
        ? '✅ Desktop .zip downloadable on Releases'
        : '❌ Desktop .zip not ready yet',
    );
  } else if (input.kind === 'expo') {
    verifyLines.push('✅ Code on GitHub (Expo Go path)');
    verifyLines.push(
      input.easTriggered
        ? '✅ EAS workflow triggered on your Expo account'
        : 'ℹ️ EAS / store submit not run (Connect Expo in Publish)',
    );
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
      statusMessage = 'Desktop shipped — unsigned zip ready to download';
      statusLabel = 'Shipped';
    } else if (input.kind === 'expo') {
      statusMessage = input.easTriggered
        ? 'Mobile on GitHub + EAS started (you pay store/EAS fees)'
        : 'Mobile on GitHub — Connect Expo for EAS when ready';
      statusLabel = input.easTriggered ? 'GitHub + EAS' : 'On GitHub';
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
