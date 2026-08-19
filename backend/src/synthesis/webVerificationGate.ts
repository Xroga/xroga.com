/**
 * The web verification gate — deciding whether to look, and reporting honestly when it cannot.
 *
 * This sits between canonical validation and the browser. It answers three questions in order:
 * is this project web-verifiable at all, can the check actually run here, and what did it find.
 *
 * ## `not_checked` is a first-class outcome, and it never means "passed"
 *
 * The check cannot run everywhere. There may be no isolation sandbox, no browser, or no way to
 * start the application. Each of those is a *gap in evidence*, and the one thing this module
 * must never do is let a gap read as a pass — "we did not look" and "we looked and it was fine"
 * are opposite facts and a verification system that conflates them is worse than none.
 *
 * So `not_checked` is a distinct status carrying the reason, it contributes nothing to
 * `verified`, and it is surfaced to the user rather than dropped.
 *
 * ## Why the start command comes from the project's own manifest
 *
 * The runtime adapter registry knows `install`, `lint`, `typecheck`, `test`, `build` and
 * `package` — there is no `serve` phase, so there is nothing to ask. Reading the generated
 * project's own `package.json` scripts is not guessing: it is using the declaration the project
 * makes about itself. When the project declares nothing usable, this reports `not_checked`
 * rather than inventing `npm start` and blaming the application when it fails.
 */

import type { ProjectFile } from '../ai/patches.js';
import { detectComposition } from './runtime/registry.js';
import {
  decideWebVerification,
  verificationEvidenceForRepair,
  type ViewportEvidence,
  type WebVerificationVerdict,
} from './browserVerification.js';
import type { DomExpectation, InteractionExpectation } from './playwrightDriver.js';
import type { ArtifactBrowserVerification } from '../ai/engineeringArtifact.js';

export type NotCheckedReason =
  | 'not_a_web_project'
  | 'no_start_command'
  | 'sandbox_unavailable'
  | 'browser_unavailable'
  | 'application_did_not_start'
  | 'cancelled';

export interface WebVerifiability {
  readonly webVerifiable: boolean;
  /** The script name the project declares, e.g. `dev` or `start`. Null when it declares none. */
  readonly startScript: string | null;
  readonly reason: string;
}

/**
 * Scripts that serve an application, in the order we prefer them.
 *
 * `dev` first because a generated project is far more likely to have a working dev server than
 * a correct production start, and `start` frequently requires a build output that may not exist
 * at this point in the run.
 */
const SERVE_SCRIPTS = ['dev', 'start', 'serve', 'preview'] as const;

/** Frameworks and file shapes that indicate something a browser can meaningfully open. */
const WEB_DEPENDENCY = /"(next|react|react-dom|vue|svelte|@sveltejs\/kit|nuxt|astro|vite|remix|@angular\/core)"/;

function readPackageJson(files: readonly ProjectFile[]): Record<string, unknown> | null {
  const pkg = files.find((file) => file.path === 'package.json' || file.path.endsWith('/package.json'));
  if (!pkg) return null;
  try {
    return JSON.parse(pkg.content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Whether a browser can say anything useful about this project.
 *
 * Conservative on purpose. A CLI tool, a library or a backend service has no browser surface,
 * and requiring one would block builds that are already correctly validated by their own
 * deterministic checks. The cost of a false negative here is a missing check; the cost of a
 * false positive is every non-web build failing.
 */
export function assessWebVerifiability(files: readonly ProjectFile[]): WebVerifiability {
  const pkg = readPackageJson(files);
  if (!pkg) {
    return { webVerifiable: false, startScript: null, reason: 'no package.json — not a Node web project' };
  }

  const raw = JSON.stringify(pkg);
  const hasWebDependency = WEB_DEPENDENCY.test(raw);
  const hasHtml = files.some((file) => file.path.endsWith('.html'));
  const composition = detectComposition(files);
  const hasNodeComponent = composition.components.some((component) => component.adapterId === 'node');

  if (!hasWebDependency && !hasHtml) {
    return {
      webVerifiable: false,
      startScript: null,
      reason: 'no web framework dependency and no HTML entry point',
    };
  }
  if (!hasNodeComponent && !hasHtml) {
    return { webVerifiable: false, startScript: null, reason: 'no Node component detected' };
  }

  const scripts = (pkg.scripts ?? {}) as Record<string, unknown>;
  const startScript = SERVE_SCRIPTS.find((name) => typeof scripts[name] === 'string') ?? null;

  return {
    webVerifiable: true,
    startScript,
    reason: startScript
      ? `web project declaring a "${startScript}" script`
      : 'web project, but it declares no script that serves it',
  };
}

// ---------------------------------------------------------------------------
// Acceptance criteria → deterministic browser checks
// ---------------------------------------------------------------------------

export interface CompiledBrowserChecks {
  readonly domExpectations: readonly DomExpectation[];
  readonly interactions: readonly InteractionExpectation[];
  /** Criteria this slice cannot check deterministically. Recorded, never counted as passed. */
  readonly notChecked: readonly string[];
}

/**
 * Compiles acceptance criteria into browser checks.
 *
 * Only patterns with an unambiguous deterministic meaning are compiled. Everything else lands
 * in `notChecked`, because the alternative — asking a model whether the page "looks right" — is
 * the generic visual judge this slice is explicitly not building, and an uncheckable criterion
 * silently treated as satisfied is exactly the dishonesty the whole subsystem exists to prevent.
 */
export function compileBrowserChecks(criteria: readonly string[]): CompiledBrowserChecks {
  const domExpectations: DomExpectation[] = [];
  const interactions: InteractionExpectation[] = [];
  const notChecked: string[] = [];

  for (const criterion of criteria) {
    const text = criterion.trim();
    if (!text) continue;

    // Interaction first: it is the most specific pattern, and "clicking «#add» shows «Added»"
    // also matches the plain "shows «…»" rule below. Checking the general rule first would
    // silently downgrade every interaction criterion into a static text assertion — the click
    // would never happen and the criterion would still report as satisfied.
    const interaction = text.match(
      /click(?:ing)?\s+["`]([^"`]{1,60})["`][^"`]{0,40}["“'‘]([^"”'’]{2,80})["”'’]/i,
    );
    if (interaction?.[1] && interaction?.[2]) {
      interactions.push({
        description: text,
        clickSelector: interaction[1],
        expectText: interaction[2],
      });
      continue;
    }

    // "«.submit-button» exists" / "element #root is present"
    const selector = text.match(/["`]([#.][A-Za-z0-9_\-[\]="' .]{1,60})["`]\s*(?:exists|is present|renders)/i);
    if (selector?.[1]) {
      domExpectations.push({ description: text, selector: selector[1] });
      continue;
    }

    // "the page shows «Create project»" / "displays 'Welcome'"
    const visible = text.match(/(?:shows?|displays?|contains?|renders?)\s+["“'‘]([^"”'’]{2,80})["”'’]/i);
    if (visible?.[1]) {
      domExpectations.push({ description: text, text: visible[1] });
      continue;
    }

    notChecked.push(text);
  }

  return { domExpectations, interactions, notChecked };
}

// ---------------------------------------------------------------------------
// The gate outcome
// ---------------------------------------------------------------------------

export type WebGateStatus = 'passed' | 'failed' | 'not_checked';

export interface WebGateResult {
  readonly status: WebGateStatus;
  readonly attempted: boolean;
  readonly url: string | null;
  readonly verdict: WebVerificationVerdict | null;
  readonly notCheckedReason: NotCheckedReason | null;
  /** Criteria that were never executed. Never counted as satisfied. */
  readonly criteriaNotChecked: readonly string[];
  readonly blocker: string | null;
  /** Verbatim failure evidence for the existing repair path. Empty unless `failed`. */
  readonly evidenceForRepair: string;
  readonly screenshots: readonly string[];
}

export function notChecked(reason: NotCheckedReason, detail: string, criteria: readonly string[] = []): WebGateResult {
  return {
    status: 'not_checked',
    attempted: false,
    url: null,
    verdict: null,
    notCheckedReason: reason,
    criteriaNotChecked: criteria,
    // Stated as a blocker only when the project *should* have been checkable. A CLI tool that
    // is not web-verifiable is not blocked on anything.
    blocker: reason === 'not_a_web_project' ? null : detail,
    evidenceForRepair: '',
    screenshots: [],
  };
}

/**
 * Turns collected observations into a gate result.
 *
 * The verdict itself comes from `decideWebVerification`, unchanged — this only adapts its shape
 * and attaches the repair evidence. Keeping the decision in one pure function is what makes
 * "the system decides, not the model" a checkable property rather than a claim.
 */
export function gateFromEvidence(input: {
  url: string;
  filesProduced: number;
  buildPassed: boolean;
  testsPassed: boolean | null;
  serverStarted: boolean;
  serverLog?: string;
  viewports: readonly ViewportEvidence[];
  criteriaNotChecked?: readonly string[];
}): WebGateResult {
  const verdict = decideWebVerification({
    filesProduced: input.filesProduced,
    buildPassed: input.buildPassed,
    testsPassed: input.testsPassed,
    serverStarted: input.serverStarted,
    serverLog: input.serverLog,
    viewports: input.viewports,
  });

  return {
    status: verdict.verified ? 'passed' : 'failed',
    attempted: true,
    url: input.url,
    verdict,
    notCheckedReason: null,
    criteriaNotChecked: input.criteriaNotChecked ?? [],
    blocker: verdict.verified ? null : verdict.reason,
    evidenceForRepair: verificationEvidenceForRepair(verdict),
    screenshots: verdict.screenshots,
  };
}

/**
 * Whether this gate permits a verified claim.
 *
 * `not_checked` returns false. That is the entire point: a check that did not run cannot
 * license the claim it exists to license.
 */
export function gatePermitsVerified(result: WebGateResult): boolean {
  return result.status === 'passed';
}

/**
 * NOT APPLICABLE and NOT EXECUTED are different states, and collapsing them breaks the system
 * in one direction or the other.
 *
 * A CLI tool has no browser surface. It owes no browser evidence, and demanding some would
 * block every correctly-validated non-web build — so `not_a_web_project` means the gate simply
 * does not apply, and the existing deterministic verification stands on its own.
 *
 * Every *other* reason describes a project that a browser could have judged, where we did not
 * manage to look: no serve script, no sandbox, no browser, the app never started, the run was
 * cancelled. Those are missing evidence about a project that needed it. Treating them as
 * inapplicable would restore precisely the defect this subsystem exists to prevent — a web
 * project called verified because nobody checked it.
 */
export type BrowserVerificationApplicability = 'required' | 'not_applicable';

export function browserVerificationApplicability(
  result: WebGateResult,
): BrowserVerificationApplicability {
  // `passed` and `failed` carry no reason because the check ran — for those, it plainly applied.
  return result.notCheckedReason === 'not_a_web_project' ? 'not_applicable' : 'required';
}

/**
 * Whether this gate must veto a verified claim.
 *
 * The one predicate the final verification decision consults. Written as "blocks" rather than
 * "permits" so the safe answer is the default: anything that is required and did not reach
 * `passed` — failed, or any flavour of not-executed — vetoes.
 */
export function browserGateBlocksVerification(result: WebGateResult): boolean {
  return browserVerificationApplicability(result) === 'required' && result.status !== 'passed';
}

/**
 * Why the run cannot be called verified, in the user's terms.
 *
 * Returns null when the gate does not block, so a caller can use it directly as a blocker.
 */
export function browserGateBlockerReason(result: WebGateResult): string | null {
  if (!browserGateBlocksVerification(result)) return null;
  if (result.status === 'failed') {
    return result.blocker ?? 'The application failed browser verification.';
  }
  return (
    result.blocker ??
    'Browser verification did not run for this web project, so it is reported unverified rather than verified.'
  );
}

// ---------------------------------------------------------------------------
// The artifact summary — bounded, structured, no blobs
// ---------------------------------------------------------------------------

/** Caps. This travels over SSE and is persisted in the run record. */
const MAX_ARTIFACT_FINDINGS = 10;
const MAX_ARTIFACT_FINDING_CHARS = 400;
const MAX_ARTIFACT_CRITERIA = 10;

/**
 * The structured evidence the engineering artifact carries.
 *
 * Deliberately lossy. The run record is not a log store: screenshots travel as *paths*, findings
 * are capped and clipped, and full browser logs and traces never enter it at all. A summary that
 * inlined them would work in testing and blow up the first time a real application logged a
 * stack trace in a loop.
 *
 * What survives the trimming is the part a person acts on: whether it passed, why not, and the
 * exact first lines of what the browser actually observed.
 */
export function browserVerificationSummary(result: WebGateResult): ArtifactBrowserVerification {
  const findings = (result.verdict?.findings ?? [])
    .slice(0, MAX_ARTIFACT_FINDINGS)
    .map((finding) =>
      finding.summary.length > MAX_ARTIFACT_FINDING_CHARS
        ? `${finding.summary.slice(0, MAX_ARTIFACT_FINDING_CHARS)}…`
        : finding.summary,
    );

  return {
    status: result.status,
    url: result.url,
    notCheckedReason: result.notCheckedReason,
    blocker: result.blocker,
    passedChecks: result.verdict?.passedRungs ?? [],
    findings,
    criteriaNotChecked: result.criteriaNotChecked.slice(0, MAX_ARTIFACT_CRITERIA),
    screenshots: result.screenshots,
  };
}
