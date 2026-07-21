/**
 * Honest ship outcome.
 * Web: fullyShipped = live Vercel URL.
 * Chrome: fullyShipped = CWS submit API succeeded (Google review still pending).
 * Electron: fullyShipped = real installer (.exe/.AppImage/.dmg) downloadable.
 * Expo: fullyShipped = EAS build finished with install/artifact URL
 *        (storeSubmitted = Play/App Store submit workflow started; approval is external).
 */

export type ProductScaffoldKind = 'static' | 'nextjs' | 'expo' | 'chrome' | 'electron';

export type ShipOutcomeInput = {
  kind: ProductScaffoldKind;
  patchAborted: boolean;
  securityBlocked: boolean;
  compileBlocksShip: boolean;
  qaBlocksShip: boolean;
  githubConnected: boolean;
  vercelConnected: boolean;
  shouldPush: boolean;
  githubPushConfirmed: boolean;
  deployUrl?: string;
  liveOk?: boolean;
  chromeZipOk: boolean;
  /** Real CWS upload+publish API succeeded (submitted for review) */
  chromeStoreSubmitted?: boolean;
  chromeStoreUrl?: string;
  electronZipOk: boolean;
  /** Real installer binary (exe/AppImage/dmg), not just portable source zip */
  electronInstallerOk?: boolean;
  easTriggered?: boolean;
  easUrl?: string;
  /** Finished EAS build with artifact / details URL */
  easBuildOk?: boolean;
  easArtifactUrl?: string;
  /** EAS submit workflow started (not store approval) */
  easStoreSubmitted?: boolean;
  chromeZipError?: string;
  electronReleaseError?: string;
  easError?: string;
  chromeStoreError?: string;
  /** Vault → Vercel env sync ran and failed (undefined = not attempted / no vault keys) */
  envSyncOk?: boolean;
  envSyncError?: string;
};

export type ShipOutcome = {
  buildOk: boolean;
  fullyShipped: boolean;
  handoffReady: boolean;
  /** Store submit API/workflow started — approval still on Google/Apple */
  storeSubmitted: boolean;
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
        'Chrome extension.zip was not uploaded to GitHub Releases — re-run ship',
    );
  }
  if (input.kind === 'electron' && input.githubPushConfirmed && !input.electronZipOk) {
    shipBlockers.push(
      input.electronReleaseError ||
        'Desktop package not downloadable yet — open GitHub Actions/Releases',
    );
  }
  if (!isNonWeb && input.githubPushConfirmed && !input.deployUrl) {
    shipBlockers.push('Vercel deploy did not produce a live URL');
  }
  if (!isNonWeb && input.deployUrl && input.liveOk === false) {
    shipBlockers.push('Live URL check failed — open Vercel logs or redeploy');
  }
  if (!isNonWeb && input.envSyncOk === false) {
    shipBlockers.push(
      input.envSyncError
        ? `Vault → Vercel env sync failed: ${input.envSyncError}`
        : 'Vault secrets did not sync to Vercel — AI/DB keys may be missing on the live site',
    );
  }

  const buildOk =
    !input.patchAborted &&
    !input.securityBlocked &&
    !input.compileBlocksShip &&
    !input.qaBlocksShip;

  let handoffReady = false;
  let fullyShipped = false;
  let storeSubmitted = false;

  if (buildOk && input.githubPushConfirmed) {
    if (input.kind === 'chrome') {
      handoffReady = input.chromeZipOk;
      storeSubmitted = Boolean(input.chromeStoreSubmitted);
      // Our side complete when CWS submit succeeded (Google review is external)
      fullyShipped = storeSubmitted;
    } else if (input.kind === 'electron') {
      handoffReady = input.electronZipOk;
      fullyShipped = Boolean(input.electronInstallerOk);
    } else if (input.kind === 'expo') {
      handoffReady = true;
      storeSubmitted = Boolean(input.easStoreSubmitted);
      fullyShipped = Boolean(input.easBuildOk);
    } else {
      // Live URL alone is not enough if vault env sync failed — site may boot without keys
      fullyShipped = Boolean(
        input.deployUrl && input.liveOk !== false && input.envSyncOk !== false,
      );
      handoffReady = fullyShipped;
    }
  }

  if (input.kind === 'chrome') {
    if (storeSubmitted) {
      nextSteps.push(
        input.chromeStoreUrl
          ? `Await Google review — track status: ${input.chromeStoreUrl}`
          : 'Await Google Chrome Web Store review (Xroga cannot approve listings).',
      );
    } else if (handoffReady) {
      nextSteps.push(
        input.chromeStoreError
          ? `CWS submit: ${input.chromeStoreError}. Or Load unpacked from extension.zip.`
          : 'Add CWS OAuth credentials in Publish to submit for review, or Load unpacked from the zip.',
      );
    }
  }
  if (input.kind === 'electron') {
    if (fullyShipped) {
      nextSteps.push(
        'Download the installer (.exe / .AppImage / .dmg). Signed builds need CSC_LINK in Publish.',
      );
    } else if (handoffReady) {
      nextSteps.push(
        'Portable desktop.zip ready now. Installers build on GitHub Actions (Linux/Windows/macOS) — open Releases when green.',
      );
    }
  }
  if (input.kind === 'expo' && input.githubPushConfirmed) {
    if (storeSubmitted) {
      nextSteps.push(
        'Store submit started on EAS — Apple/Google still review. Watch the Expo submit run.',
      );
    } else if (input.easBuildOk) {
      nextSteps.push(
        input.easArtifactUrl
          ? `Install build: ${input.easArtifactUrl}. Optional: Start EAS submit after Play/Apple creds are in Expo.`
          : 'EAS build finished — open the Expo build page to install. Optional: submit to stores.',
      );
    } else if (input.easTriggered) {
      nextSteps.push(
        input.easUrl
          ? `EAS building — ${input.easUrl}`
          : 'EAS build started — wait for the installable artifact.',
      );
    } else {
      nextSteps.push(
        input.easError
          ? `EAS: ${input.easError}`
          : 'Connect Expo in Publish so the next ship starts an EAS build automatically.',
      );
    }
  }
  if (!isNonWeb && fullyShipped) {
    nextSteps.push('Optional: Connect Supabase for DB/memory if the app needs it');
  }
  if (buildOk && !handoffReady && !fullyShipped && shipBlockers.length) {
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
      input.chromeZipOk ? '✅ extension.zip on GitHub Releases' : '❌ extension.zip missing',
    );
    verifyLines.push(
      input.chromeStoreSubmitted
        ? '✅ Submitted to Chrome Web Store (awaiting Google review)'
        : 'ℹ️ Not submitted to CWS yet',
    );
  } else if (input.kind === 'electron') {
    verifyLines.push(
      input.electronZipOk ? '✅ Desktop package available' : '❌ Desktop package missing',
    );
    verifyLines.push(
      input.electronInstallerOk
        ? '✅ Installer binary (.exe/.AppImage/.dmg) ready'
        : 'ℹ️ Installer binary still building on Actions (or use portable zip)',
    );
  } else if (input.kind === 'expo') {
    verifyLines.push('✅ Code on GitHub');
    verifyLines.push(
      input.easBuildOk
        ? '✅ EAS build finished with install/artifact URL'
        : input.easTriggered
          ? '⏳ EAS build started'
          : 'ℹ️ EAS not started',
    );
    verifyLines.push(
      input.easStoreSubmitted
        ? '✅ Store submit workflow started (awaiting Apple/Google)'
        : 'ℹ️ Not submitted to App Store / Play yet',
    );
  } else {
    if (input.deployUrl) {
      verifyLines.push(
        input.liveOk === false ? `❌ Live URL failed: ${input.deployUrl}` : `✅ Live: ${input.deployUrl}`,
      );
    } else {
      verifyLines.push('❌ No Vercel live URL');
    }
    if (input.envSyncOk === false) {
      verifyLines.push(
        `❌ Vault → Vercel env sync failed${input.envSyncError ? `: ${input.envSyncError}` : ''}`,
      );
    } else if (input.envSyncOk === true) {
      verifyLines.push('✅ Vault secrets synced to Vercel');
    }
  }

  const verifyPass = isNonWeb ? handoffReady || fullyShipped : fullyShipped;

  let statusMessage: string;
  let statusLabel: string;
  if (input.patchAborted) {
    statusMessage = 'Update aborted — site unchanged';
    statusLabel = 'Aborted';
  } else if (fullyShipped) {
    if (input.kind === 'chrome') {
      statusMessage = 'Submitted to Chrome Web Store — awaiting Google review';
      statusLabel = 'Submitted to CWS';
    } else if (input.kind === 'electron') {
      statusMessage = 'Desktop installer ready to download';
      statusLabel = 'Installer ready';
    } else if (input.kind === 'expo') {
      statusMessage = input.easStoreSubmitted
        ? 'Mobile binary ready + store submit started (awaiting Apple/Google)'
        : 'Mobile binary ready to install from EAS';
      statusLabel = input.easStoreSubmitted ? 'Build + submitted' : 'Build ready';
    } else {
      statusMessage = 'Build shipped & verified live';
      statusLabel = 'Shipped';
    }
  } else if (handoffReady) {
    if (input.kind === 'chrome') {
      statusMessage = 'Extension zip ready — connect CWS credentials to submit for review';
      statusLabel = 'Ready to install / submit';
    } else if (input.kind === 'electron') {
      statusMessage = 'Portable zip ready — installers building on GitHub Actions';
      statusLabel = 'Ready to run';
    } else if (input.kind === 'expo') {
      statusMessage = input.easTriggered
        ? 'Mobile source on GitHub + EAS building'
        : 'Mobile source on GitHub — Connect Expo to auto-build';
      statusLabel = input.easTriggered ? 'EAS building' : 'Source ready';
    } else {
      statusMessage = 'Handoff ready';
      statusLabel = 'Handoff ready';
    }
  } else if (buildOk) {
    statusMessage = shipBlockers[0]
      ? `Built — incomplete: ${shipBlockers[0]}`
      : 'Built — connect integrations to finish';
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
    handoffReady,
    storeSubmitted,
    shipOk: shipOk && (fullyShipped || handoffReady || !input.shouldPush),
    shipBlockers: [...new Set(shipBlockers)],
    nextSteps: [...new Set(nextSteps)],
    statusLabel,
    statusMessage,
    verifyPass,
    verifyLines,
  };
}
