/**
 * Web verification — the system decides, not the model.
 *
 * The rule this module exists to enforce: a model saying "done" is never completion. Every
 * input below is an observation made by running something, and the verdict is a pure function
 * of those observations. Nothing a model asserts about its own work reaches this decision.
 *
 * ## The evidence ladder
 *
 * Checks are ordered cheapest-and-most-fundamental first, and a failure stops the ladder:
 *
 *   build/tests → server process → HTTP → DOM → page errors → console/network → interactions → screenshots
 *
 * The ordering is not cosmetic. If the build failed, the server cannot start; if the server
 * did not start, the HTTP check tells you nothing you did not already know; and a screenshot of
 * a page that threw on load is a picture of a blank div. Running the later rungs anyway
 * produces a pile of correlated failures that bury the one that mattered — and the repair stage
 * then receives eight symptoms instead of one cause.
 *
 * ## Screenshots are evidence, not truth
 *
 * A screenshot proves something rendered. It cannot prove the page works, and a page that
 * throws after paint photographs perfectly. So screenshots never gate `verified`; they are
 * attached for a human, and the machine-checkable rungs decide.
 *
 * ## Zero problems is a valid finding
 *
 * If every rung passes, this reports verified with no findings. It does not manufacture a
 * defect to look thorough, and it does not require a first attempt to fail.
 */

export type VerificationRung =
  | 'build'
  | 'tests'
  | 'server_health'
  | 'http'
  | 'dom'
  | 'page_errors'
  | 'console_errors'
  | 'network_errors'
  | 'interactions'
  | 'screenshots';

/** The ladder, in the order §3 specifies. Index is significance, not preference. */
export const VERIFICATION_LADDER: readonly VerificationRung[] = [
  'build',
  'tests',
  'server_health',
  'http',
  'dom',
  'page_errors',
  'console_errors',
  'network_errors',
  'interactions',
  'screenshots',
];

/** Rungs that gate `verified`. Screenshots deliberately do not appear. */
const GATING_RUNGS: ReadonlySet<VerificationRung> = new Set<VerificationRung>([
  'build',
  'tests',
  'server_health',
  'http',
  'dom',
  'page_errors',
  'console_errors',
  'network_errors',
  'interactions',
]);

export interface PageError {
  readonly message: string;
  readonly stack?: string;
  readonly url?: string;
}

export interface ConsoleMessage {
  readonly level: 'error' | 'warning' | 'info';
  readonly text: string;
}

export interface NetworkFailure {
  readonly url: string;
  readonly status?: number;
  readonly failure?: string;
}

export interface DomCheck {
  readonly description: string;
  readonly selector?: string;
  readonly satisfied: boolean;
  readonly detail?: string;
}

export interface InteractionCheck {
  readonly description: string;
  readonly satisfied: boolean;
  readonly detail?: string;
}

export interface ViewportEvidence {
  readonly viewport: 'desktop' | 'mobile';
  readonly httpStatus: number | null;
  readonly pageErrors: readonly PageError[];
  readonly consoleMessages: readonly ConsoleMessage[];
  readonly networkFailures: readonly NetworkFailure[];
  readonly domChecks: readonly DomCheck[];
  readonly interactions: readonly InteractionCheck[];
  readonly screenshotPath?: string | null;
}

export interface WebVerificationInput {
  /** Whether implementation produced any files at all. */
  readonly filesProduced: number;
  readonly buildPassed: boolean;
  readonly buildOutput?: string;
  /** Null when the project has no test command — absent is not failure. */
  readonly testsPassed: boolean | null;
  readonly testOutput?: string;
  /** Whether the generated app's process started and stayed up. */
  readonly serverStarted: boolean;
  readonly serverLog?: string;
  readonly viewports: readonly ViewportEvidence[];
}

export interface VerificationFinding {
  readonly rung: VerificationRung;
  readonly summary: string;
  /** The exact observed text, for the repairer. Never a paraphrase. */
  readonly evidence: string;
  readonly viewport?: 'desktop' | 'mobile';
}

export interface WebVerificationVerdict {
  readonly verified: boolean;
  /** The furthest rung that was actually evaluated. */
  readonly rungReached: VerificationRung | 'none';
  readonly passedRungs: readonly VerificationRung[];
  readonly findings: readonly VerificationFinding[];
  /** Screenshots collected, regardless of verdict. */
  readonly screenshots: readonly string[];
  readonly reason: string;
}

/**
 * Console noise that is not a defect.
 *
 * Frameworks log at `error` level for things that are not errors — a dev-mode hydration notice,
 * a React DevTools suggestion, a favicon 404. Treating those as blocking would make every
 * generated app fail verification, and the first person to see that would (correctly) turn the
 * whole check off. So the filter is narrow and explicit, and anything unrecognised still blocks.
 */
const IGNORABLE_CONSOLE = [
  /download the react devtools/i,
  /\[fast refresh\]/i,
  /favicon\.ico/i,
  /react-devtools/i,
];

function isBlockingConsole(message: ConsoleMessage): boolean {
  if (message.level !== 'error') return false;
  return !IGNORABLE_CONSOLE.some((pattern) => pattern.test(message.text));
}

/** A favicon 404 is not a broken app; a failed script or API call is. */
function isBlockingNetworkFailure(failure: NetworkFailure): boolean {
  if (/favicon\.ico$/i.test(failure.url)) return false;
  if (typeof failure.status === 'number' && failure.status >= 400) return true;
  return Boolean(failure.failure);
}

/**
 * Decides whether a web project is verified.
 *
 * Pure. Given the same observations it always returns the same verdict, which is what makes
 * "the system decides" a checkable claim rather than a slogan.
 */
export function decideWebVerification(input: WebVerificationInput): WebVerificationVerdict {
  const findings: VerificationFinding[] = [];
  const passed: VerificationRung[] = [];
  const screenshots = input.viewports
    .map((viewport) => viewport.screenshotPath)
    .filter((path): path is string => typeof path === 'string' && path.length > 0);

  const fail = (
    rungReached: VerificationRung | 'none',
    reason: string,
  ): WebVerificationVerdict => ({
    verified: false,
    rungReached,
    passedRungs: passed,
    findings,
    screenshots,
    reason,
  });

  // Rung 0 — something must exist. Not on the ladder because it precedes it.
  if (input.filesProduced <= 0) {
    findings.push({
      rung: 'build',
      summary: 'No files were produced',
      evidence: 'The implementation step produced zero files.',
    });
    return fail('none', 'Nothing was implemented, so nothing could be verified.');
  }

  // 1. Build.
  if (!input.buildPassed) {
    findings.push({
      rung: 'build',
      summary: 'The project build failed',
      evidence: input.buildOutput?.trim() || 'The build command exited non-zero with no output.',
    });
    return fail('build', 'The project does not build, so no runtime evidence is meaningful.');
  }
  passed.push('build');

  // 2. Tests. `null` means the project has no test command — absent is not failure.
  if (input.testsPassed === false) {
    findings.push({
      rung: 'tests',
      summary: 'Tests failed',
      evidence: input.testOutput?.trim() || 'The test command exited non-zero with no output.',
    });
    return fail('tests', 'Tests fail, so the build is not verified.');
  }
  if (input.testsPassed === true) passed.push('tests');

  // 3. Server health.
  if (!input.serverStarted) {
    findings.push({
      rung: 'server_health',
      summary: 'The application did not start',
      evidence: input.serverLog?.trim() || 'The server process exited or never became healthy.',
    });
    return fail('server_health', 'The application does not start, so it cannot be exercised.');
  }
  passed.push('server_health');

  if (!input.viewports.length) {
    findings.push({
      rung: 'http',
      summary: 'No browser evidence was collected',
      evidence: 'The verification step ran no viewports.',
    });
    return fail('server_health', 'No browser evidence was collected, so the app is unverified.');
  }

  // 4–9. Per-viewport rungs, evaluated in ladder order across all viewports so a desktop-only
  // failure is not masked by a passing mobile run.
  const httpFailures = input.viewports.filter(
    (viewport) => viewport.httpStatus === null || viewport.httpStatus >= 400,
  );
  if (httpFailures.length) {
    for (const viewport of httpFailures) {
      findings.push({
        rung: 'http',
        summary: `HTTP ${viewport.httpStatus ?? 'no response'} on ${viewport.viewport}`,
        evidence: `The app responded ${viewport.httpStatus ?? 'not at all'} at the ${viewport.viewport} viewport.`,
        viewport: viewport.viewport,
      });
    }
    return fail('http', 'The application did not serve a successful HTTP response.');
  }
  passed.push('http');

  const domFailures = input.viewports.flatMap((viewport) =>
    viewport.domChecks
      .filter((check) => !check.satisfied)
      .map((check) => ({ viewport, check })),
  );
  if (domFailures.length) {
    for (const { viewport, check } of domFailures) {
      findings.push({
        rung: 'dom',
        summary: `Required content missing: ${check.description}`,
        evidence: check.detail || `Selector ${check.selector ?? '(unspecified)'} matched nothing.`,
        viewport: viewport.viewport,
      });
    }
    return fail('dom', 'The page loaded but required content is missing.');
  }
  if (input.viewports.some((viewport) => viewport.domChecks.length)) passed.push('dom');

  const pageErrors = input.viewports.flatMap((viewport) =>
    viewport.pageErrors.map((error) => ({ viewport, error })),
  );
  if (pageErrors.length) {
    for (const { viewport, error } of pageErrors) {
      findings.push({
        rung: 'page_errors',
        summary: `Uncaught page error: ${error.message.slice(0, 120)}`,
        // The stack is the single most useful thing the repairer can receive, so it is
        // forwarded verbatim rather than summarised.
        evidence: [error.message, error.stack].filter(Boolean).join('\n'),
        viewport: viewport.viewport,
      });
    }
    return fail('page_errors', 'The page threw an uncaught error at runtime.');
  }
  passed.push('page_errors');

  const consoleErrors = input.viewports.flatMap((viewport) =>
    viewport.consoleMessages.filter(isBlockingConsole).map((message) => ({ viewport, message })),
  );
  if (consoleErrors.length) {
    for (const { viewport, message } of consoleErrors) {
      findings.push({
        rung: 'console_errors',
        summary: `Console error: ${message.text.slice(0, 120)}`,
        evidence: message.text,
        viewport: viewport.viewport,
      });
    }
    return fail('console_errors', 'The page logged blocking console errors.');
  }
  passed.push('console_errors');

  const networkErrors = input.viewports.flatMap((viewport) =>
    viewport.networkFailures.filter(isBlockingNetworkFailure).map((failure) => ({ viewport, failure })),
  );
  if (networkErrors.length) {
    for (const { viewport, failure } of networkErrors) {
      findings.push({
        rung: 'network_errors',
        summary: `Request failed: ${failure.url}`,
        evidence: `${failure.url} → ${failure.status ?? failure.failure ?? 'failed'}`,
        viewport: viewport.viewport,
      });
    }
    return fail('network_errors', 'The page made requests that failed.');
  }
  passed.push('network_errors');

  const interactionFailures = input.viewports.flatMap((viewport) =>
    viewport.interactions.filter((check) => !check.satisfied).map((check) => ({ viewport, check })),
  );
  if (interactionFailures.length) {
    for (const { viewport, check } of interactionFailures) {
      findings.push({
        rung: 'interactions',
        summary: `Interaction failed: ${check.description}`,
        evidence: check.detail || `The interaction "${check.description}" did not produce its expected result.`,
        viewport: viewport.viewport,
      });
    }
    return fail('interactions', 'A required user interaction did not work.');
  }
  if (input.viewports.some((viewport) => viewport.interactions.length)) passed.push('interactions');

  // Screenshots are recorded but never gate the verdict.
  if (screenshots.length) passed.push('screenshots');

  return {
    verified: true,
    rungReached: 'screenshots',
    passedRungs: passed,
    // Zero problems is a valid finding. Nothing is invented to look thorough.
    findings: [],
    screenshots,
    reason: `Verified: ${passed.filter((rung) => GATING_RUNGS.has(rung)).length} deterministic checks passed.`,
  };
}

/**
 * The exact evidence a repairer needs, as text.
 *
 * Verbatim observations, not a summary. A repairer given "the page had an error" changes
 * something plausible; a repairer given the stack trace changes the line that threw.
 */
export function verificationEvidenceForRepair(verdict: WebVerificationVerdict): string {
  if (verdict.verified || !verdict.findings.length) return '';
  const lines = [`Verification failed at the "${verdict.rungReached}" stage. ${verdict.reason}`, ''];
  for (const finding of verdict.findings.slice(0, 10)) {
    lines.push(`[${finding.rung}${finding.viewport ? ` · ${finding.viewport}` : ''}] ${finding.summary}`);
    lines.push(finding.evidence.slice(0, 2_000));
    lines.push('');
  }
  return lines.join('\n').trim();
}
