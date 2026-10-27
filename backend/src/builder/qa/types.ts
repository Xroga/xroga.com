/**
 * Browser QA model for generated applications.
 *
 * A plan is declarative data (steps), never generated code, so it can be derived deterministically,
 * stored, replayed against a later revision, and executed by any driver. A result is only ever
 * "passed" when the steps were actually executed against a running application.
 */

export type QaViewport = 'desktop' | 'mobile';

export type QaStep =
  | { readonly op: 'goto'; readonly path: string }
  | { readonly op: 'click'; readonly selector: string }
  | { readonly op: 'fill'; readonly selector: string; readonly value: string }
  | { readonly op: 'reload' }
  | { readonly op: 'expectText'; readonly text: string }
  | { readonly op: 'expectVisible'; readonly selector: string }
  | { readonly op: 'expectUrlPath'; readonly path: string }
  | { readonly op: 'expectNoHorizontalOverflow' }
  | { readonly op: 'expectViewportMeta' }
  | { readonly op: 'expectFormRejectsEmpty'; readonly selector: string }
  | { readonly op: 'expectFeedbackAfter'; readonly selector: string }
  | { readonly op: 'expectProtected'; readonly path: string };

export type QaCategory = 'content' | 'navigation' | 'forms' | 'responsive' | 'auth' | 'persistence' | 'criterion';

/** What the environment must provide for a check to be executable. */
export type QaRequirement = 'database';

export interface QaCheck {
  readonly id: string;
  readonly title: string;
  readonly category: QaCategory;
  readonly viewport: QaViewport;
  readonly required: boolean;
  readonly steps: readonly QaStep[];
  readonly requires?: QaRequirement;
  /** The requirement or source construct this check was derived from. */
  readonly derivedFrom: string;
}

export interface QaPlan {
  readonly version: 1;
  readonly checks: readonly QaCheck[];
  /** Criteria that have no deterministic check. Recorded, never counted as passed. */
  readonly notChecked: ReadonlyArray<{ readonly criterion: string; readonly reason: string }>;
}

export type QaFailureClass =
  | 'browser_assertion_failure'
  | 'runtime_error'
  | 'preview_error'
  | 'authentication_error'
  | 'database_error';

export interface QaEvidence {
  readonly url: string | null;
  readonly httpStatus: number | null;
  readonly failedStep: string | null;
  readonly message: string | null;
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly failedRequests: readonly string[];
  /** Base64 PNG, bounded in size and count. Absent for passing checks. */
  readonly screenshot: string | null;
}

export type QaCheckStatus = 'passed' | 'failed' | 'pending';

export interface QaCheckResult {
  readonly id: string;
  readonly title: string;
  readonly category: QaCategory;
  readonly viewport: QaViewport;
  readonly required: boolean;
  readonly status: QaCheckStatus;
  readonly executed: boolean;
  readonly failureClass: QaFailureClass | null;
  readonly durationMs: number;
  /** Why the check did not run, when status is pending. */
  readonly pendingReason: string | null;
  readonly evidence: QaEvidence | null;
  /** True when this check passed on an earlier revision and fails now. */
  readonly regression: boolean;
}

export type QaStatus = 'passed' | 'failed' | 'partial' | 'pending_runtime';

export interface QaReport {
  readonly version: 1;
  readonly status: QaStatus;
  readonly executedChecks: number;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly pendingChecks: number;
  readonly checks: readonly QaCheckResult[];
  readonly notChecked: QaPlan['notChecked'];
  readonly environment: { readonly driver: string; readonly browser: string | null; readonly baseHost: string | null };
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly reason: string;
}

/** One live page, as the runner sees it. Implemented over Playwright and by test fakes. */
export interface QaPage {
  goto(path: string): Promise<{ status: number | null }>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  reload(): Promise<void>;
  bodyText(): Promise<string>;
  isVisible(selector: string): Promise<boolean>;
  currentPath(): string;
  hasHorizontalOverflow(): Promise<boolean>;
  hasViewportMeta(): Promise<boolean>;
  /** True when the browser's own validation blocks submitting the form as it stands. */
  formIsInvalid(selector: string): Promise<boolean>;
  /** Submits the form that contains or is named by the selector. */
  submitForm(selector: string): Promise<void>;
  screenshot(): Promise<Buffer | null>;
  /** Errors observed since the last call, then cleared. */
  drainDiagnostics(): { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[] };
  close(): Promise<void>;
}

export interface QaDriver {
  readonly name: string;
  browserVersion(): Promise<string | null>;
  open(viewport: QaViewport): Promise<QaPage>;
  close(): Promise<void>;
}

export const MAX_SCREENSHOT_BYTES = 200_000;
export const MAX_SCREENSHOTS_PER_REPORT = 6;
export const MAX_DIAGNOSTIC_LINES = 8;
export const MAX_DIAGNOSTIC_LENGTH = 300;
