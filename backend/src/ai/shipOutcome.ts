/**
 * Honest ship outcome — never mark Chrome/Electron/Expo as store-shipped.
 * Web: fullyShipped = live Vercel URL verified.
 * Non-web: handoffReady = free-path artifact/source ready (not App Store / CWS / Play).
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
  /** True only for verified live web deploy — never App Store / Play / CWS */
  fullyShipped: boolean;
  /** Free-path handoff ready (zip on Releases, Expo source on GitHub) — not store published */
  handoffReady: boolean;
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

  let handoffReady = false;
  let fullyShipped = false;

  if (buildOk && input.githubPushConfirmed) {
    if (input.kind === 'chrome') {
      handoffReady = input.chromeZipOk;
      // Zip ≠ Chrome Web Store publish
      fullyShipped = false;
    } else if (input.kind === 'electron') {
      handoffReady = input.electronZipOk;
      // Unsigned zip ≠ signed store desktop app
      fullyShipped = false;
    } else if (input.kind === 'expo') {
      // GitHub / Expo Go / EAS dispatch ≠ App Store / Play
      handoffReady = true;
      fullyShipped = false;
    } else {
      fullyShipped = Boolean(input.deployUrl && input.liveOk !== false);
      handoffReady = fullyShipped;
    }
  }

  if (input.kind === 'chrome' && handoffReady) {
    nextSteps.push(
      'Install: chrome://extensions → Developer mode → Load unpacked (unzip first) — or upload extension.zip to Chrome Web Store (~$5, you pay).',
    );
  }
  if (input.kind === 'electron' && handoffReady) {
    nextSteps.push(
      'Run: unzip desktop.zip → npm install && npm start. Optional unsigned Linux binary builds on GitHub Actions. Code signing / stores stay on you.',
    );
  }
  if (input.kind === 'expo' && input.githubPushConfirmed) {
    if (input.easTriggered) {
      nextSteps.push(
        input.easUrl
          ? `EAS build running — open ${input.easUrl}. When green, install the binary / submit from Expo (store fees on you).`
          : 'EAS build started on your Expo account — open expo.dev builds when ready.',
      );
    } else {
      nextSteps.push(
        input.easError
          ? `EAS not started: ${input.easError}. Publish → Connect Expo (one token) — next ship auto-starts the build.`
          : 'Connect Expo in Publish (access token) — next ship auto-links EAS and starts an Android build.',
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
      input.chromeZipOk
        ? '✅ extension.zip on GitHub Releases — ready to install / sideload'
        : '❌ extension.zip not on Releases',
    );
    verifyLines.push('ℹ️ Chrome Web Store listing (~$5) is optional and on your account');
  } else if (input.kind === 'electron') {
    verifyLines.push(
      input.electronZipOk
        ? '✅ desktop.zip ready — npm install && npm start'
        : '❌ Desktop zip not ready yet',
    );
    verifyLines.push('ℹ️ Code signing / Mac App Store / Microsoft Store are optional next steps');
  } else if (input.kind === 'expo') {
    verifyLines.push('✅ Code on GitHub');
    verifyLines.push(
      input.easTriggered
        ? '✅ EAS build started on your Expo account'
        : 'ℹ️ Connect Expo to auto-start EAS builds on ship',
    );
    verifyLines.push('ℹ️ App Store / Play submission uses your Apple/Google accounts + fees');
  } else {
    if (input.deployUrl) {
      verifyLines.push(
        input.liveOk === false ? `❌ Live URL failed: ${input.deployUrl}` : `✅ Live: ${input.deployUrl}`,
      );
    } else {
      verifyLines.push('❌ No Vercel live URL');
    }
  }

  // Web: live URL verified. Non-web: artifact/source handoff checks only.
  const verifyPass = isNonWeb ? handoffReady : fullyShipped;

  let statusMessage: string;
  let statusLabel: string;
  if (input.patchAborted) {
    statusMessage = 'Update aborted — site unchanged';
    statusLabel = 'Aborted';
  } else if (fullyShipped) {
    statusMessage = 'Build shipped & verified live';
    statusLabel = 'Shipped';
  } else if (handoffReady) {
    if (input.kind === 'chrome') {
      statusMessage = 'Extension ready — download zip and Load unpacked in Chrome';
      statusLabel = 'Ready to install';
    } else if (input.kind === 'electron') {
      statusMessage = 'Desktop ready — download zip, then npm install && npm start';
      statusLabel = 'Ready to run';
    } else if (input.kind === 'expo') {
      statusMessage = input.easTriggered
        ? 'Mobile build started on EAS — watch the run for your installable binary'
        : 'Mobile source on GitHub — Connect Expo to auto-build with EAS';
      statusLabel = input.easTriggered ? 'EAS building' : 'Source ready';
    } else {
      statusMessage = 'Handoff ready';
      statusLabel = 'Handoff ready';
    }
  } else if (buildOk) {
    statusMessage = shipBlockers[0]
      ? `Built — handoff incomplete: ${shipBlockers[0]}`
      : 'Built — connect integrations to finish handoff';
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
    shipOk: shipOk && (fullyShipped || handoffReady || !input.shouldPush),
    shipBlockers: [...new Set(shipBlockers)],
    nextSteps: [...new Set(nextSteps)],
    statusLabel,
    statusMessage,
    verifyPass,
    verifyLines,
  };
}
