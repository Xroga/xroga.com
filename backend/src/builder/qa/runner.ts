import {
  MAX_DIAGNOSTIC_LENGTH,
  MAX_DIAGNOSTIC_LINES,
  MAX_SCREENSHOT_BYTES,
  MAX_SCREENSHOTS_PER_REPORT,
  type QaCheck,
  type QaCheckResult,
  type QaDriver,
  type QaEvidence,
  type QaFailureClass,
  type QaPage,
  type QaPlan,
  type QaReport,
  type QaStatus,
  type QaStep,
} from './types.js';

/** Capabilities of the environment the plan runs in. A check that needs one that is absent is pending, not skipped silently. */
export interface QaEnvironment {
  readonly database: boolean;
}

export interface RunQaInput {
  readonly plan: QaPlan;
  readonly driver: QaDriver;
  readonly environment?: QaEnvironment;
  /** Check ids that passed on the previous revision. If one fails now it is flagged as a regression. */
  readonly previouslyPassed?: ReadonlySet<string>;
  /** Restrict the run to these check ids (affected-check reruns). Others are not reported. */
  readonly only?: ReadonlySet<string>;
  readonly baseHost?: string | null;
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
}

class QaAssertion extends Error {
  constructor(
    message: string,
    readonly failureClass: QaFailureClass = 'browser_assertion_failure',
  ) {
    super(message);
  }
}

const clip = (value: string, max = MAX_DIAGNOSTIC_LENGTH) => (value.length > max ? `${value.slice(0, max)}…` : value);
const bounded = (lines: readonly string[]) => lines.slice(0, MAX_DIAGNOSTIC_LINES).map((line) => clip(line));

const describeStep = (step: QaStep): string => {
  switch (step.op) {
    case 'goto': return `open ${step.path}`;
    case 'click': return `click ${step.selector}`;
    case 'fill': return `fill ${step.selector}`;
    case 'reload': return 'reload the page';
    case 'expectText': return `see the text "${clip(step.text, 60)}"`;
    case 'expectVisible': return `see ${step.selector}`;
    case 'expectUrlPath': return `be on ${step.path}`;
    case 'expectNoHorizontalOverflow': return 'have no horizontal overflow';
    case 'expectViewportMeta': return 'declare a viewport meta tag';
    case 'expectFormRejectsEmpty': return 'reject an empty submission';
    case 'expectFeedbackAfter': return 'show feedback after submitting';
    case 'expectProtected': return `deny anonymous access to ${step.path}`;
  }
};

const FEEDBACK_SELECTOR = '[role="status"], [role="alert"], .success, .error, .message, [aria-live]';

async function runStep(page: QaPage, step: QaStep, state: { status: number | null }): Promise<void> {
  switch (step.op) {
    case 'goto': {
      const response = await page.goto(step.path);
      state.status = response.status;
      if (response.status === null) throw new QaAssertion(`No response from ${step.path}.`, 'preview_error');
      if (response.status >= 500) throw new QaAssertion(`${step.path} answered HTTP ${response.status}.`, 'runtime_error');
      if (response.status >= 400) throw new QaAssertion(`${step.path} answered HTTP ${response.status}.`);
      return;
    }
    case 'click': return page.click(step.selector);
    case 'fill': return page.fill(step.selector, step.value);
    case 'reload': return page.reload();
    case 'expectText': {
      const text = await page.bodyText();
      if (!text.toLowerCase().includes(step.text.toLowerCase())) throw new QaAssertion(`Expected the page to show "${clip(step.text, 80)}".`);
      return;
    }
    case 'expectVisible':
      if (!(await page.isVisible(step.selector))) throw new QaAssertion(`Expected ${step.selector} to be visible.`);
      return;
    case 'expectUrlPath':
      if (page.currentPath() !== step.path) throw new QaAssertion(`Expected to be on ${step.path} but was on ${page.currentPath()}.`);
      return;
    case 'expectNoHorizontalOverflow':
      if (await page.hasHorizontalOverflow()) throw new QaAssertion('The page is wider than the screen and scrolls sideways.');
      return;
    case 'expectViewportMeta':
      if (!(await page.hasViewportMeta())) throw new QaAssertion('The page declares no viewport meta tag, so phones render it zoomed out.');
      return;
    case 'expectFormRejectsEmpty': {
      if (await page.formIsInvalid(step.selector)) return;
      const before = await page.bodyText();
      await page.submitForm(step.selector);
      const after = await page.bodyText();
      const showsError = await page.isVisible('[role="alert"], .error, [aria-invalid="true"]');
      if (!showsError && after === before) throw new QaAssertion('An empty form submission was accepted without any validation message.');
      return;
    }
    case 'expectFeedbackAfter': {
      const before = await page.bodyText();
      await page.submitForm(step.selector);
      const after = await page.bodyText();
      const feedback = await page.isVisible(FEEDBACK_SELECTOR);
      if (after === before && !feedback) throw new QaAssertion('Submitting a valid form changed nothing visible: the user gets no result.');
      return;
    }
    case 'expectProtected': {
      const response = await page.goto(step.path);
      state.status = response.status;
      const denied = response.status === 401 || response.status === 403 || page.currentPath() !== step.path;
      const showsSignIn = await page.isVisible('input[type="password"]');
      if (!denied && !showsSignIn) throw new QaAssertion(`${step.path} was served to a signed-out visitor.`, 'authentication_error');
      return;
    }
  }
}

function classify(error: unknown, evidence: { pageErrors: string[] }): QaFailureClass {
  if (error instanceof QaAssertion && error.failureClass !== 'browser_assertion_failure') return error.failureClass;
  if (evidence.pageErrors.length > 0) return 'runtime_error';
  return 'browser_assertion_failure';
}

async function runCheck(check: QaCheck, driver: QaDriver, budget: { screenshots: number }, input: RunQaInput): Promise<QaCheckResult> {
  const started = Date.now();
  const base = { id: check.id, title: check.title, category: check.category, viewport: check.viewport, required: check.required };
  if (check.requires === 'database' && !input.environment?.database) {
    return { ...base, status: 'pending', executed: false, failureClass: null, durationMs: 0, pendingReason: 'Needs a disposable test database, which this environment does not provide.', evidence: null, regression: false };
  }
  let page: QaPage | null = null;
  let describedStep: string | null = null;
  const state: { status: number | null } = { status: null };
  try {
    page = await driver.open(check.viewport);
    for (const step of check.steps) {
      if (input.signal?.aborted) throw new QaAssertion('The QA run was cancelled.', 'preview_error');
      describedStep = describeStep(step);
      await runStep(page, step, state);
    }
    const diagnostics = page.drainDiagnostics();
    // An uncaught exception or a failed same-origin request during an otherwise passing check is a defect.
    if (diagnostics.pageErrors.length > 0) {
      describedStep = 'run without uncaught errors';
      throw Object.assign(new QaAssertion(`The page threw an uncaught error: ${clip(diagnostics.pageErrors[0])}`, 'runtime_error'), { diagnostics });
    }
    return { ...base, status: 'passed', executed: true, failureClass: null, durationMs: Date.now() - started, pendingReason: null, evidence: null, regression: false };
  } catch (error) {
    const diagnostics = page ? page.drainDiagnostics() : { consoleErrors: [], pageErrors: [], failedRequests: [] };
    const carried = (error as { diagnostics?: typeof diagnostics }).diagnostics;
    const merged = {
      consoleErrors: bounded([...(carried?.consoleErrors ?? []), ...diagnostics.consoleErrors]),
      pageErrors: bounded([...(carried?.pageErrors ?? []), ...diagnostics.pageErrors]),
      failedRequests: bounded([...(carried?.failedRequests ?? []), ...diagnostics.failedRequests]),
    };
    let screenshot: string | null = null;
    if (page && budget.screenshots > 0) {
      const image = await page.screenshot().catch(() => null);
      if (image && image.length <= MAX_SCREENSHOT_BYTES) {
        screenshot = image.toString('base64');
        budget.screenshots -= 1;
      }
    }
    const evidence: QaEvidence = {
      url: page ? page.currentPath() : null,
      httpStatus: state.status,
      failedStep: describedStep,
      message: clip(error instanceof Error ? error.message : 'The check failed.'),
      ...merged,
      screenshot,
    };
    return {
      ...base, status: 'failed', executed: true, failureClass: classify(error, merged), durationMs: Date.now() - started, pendingReason: null, evidence,
      regression: Boolean(input.previouslyPassed?.has(check.id)),
    };
  } finally {
    await page?.close().catch(() => undefined);
  }
}

function summarize(checks: readonly QaCheckResult[]): { status: QaStatus; reason: string } {
  const executed = checks.filter((check) => check.executed);
  if (executed.length === 0) return { status: 'pending_runtime', reason: 'No check was executed: there was no running application to test.' };
  const failed = checks.filter((check) => check.status === 'failed');
  if (failed.some((check) => check.required)) return { status: 'failed', reason: `${failed.length} of ${executed.length} executed check(s) failed.` };
  const pending = checks.filter((check) => check.status === 'pending' && check.required);
  if (pending.length > 0) return { status: 'partial', reason: `${executed.length} check(s) passed; ${pending.length} required check(s) could not run in this environment.` };
  return { status: 'passed', reason: `All ${executed.length} executed check(s) passed.` };
}

export async function runQa(input: RunQaInput): Promise<QaReport> {
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const selected = input.plan.checks.filter((check) => !input.only || input.only.has(check.id));
  const budget = { screenshots: MAX_SCREENSHOTS_PER_REPORT };
  const results: QaCheckResult[] = [];
  let browser: string | null = null;
  try {
    browser = await input.driver.browserVersion().catch(() => null);
    for (const check of selected) {
      if (input.signal?.aborted) {
        // A cancelled run never reports a check it did not execute as passed: it is pending, so the run cannot be PASSED.
        results.push({ id: check.id, title: check.title, category: check.category, viewport: check.viewport, required: check.required, status: 'pending', executed: false, failureClass: null, durationMs: 0, pendingReason: 'The run was cancelled before this check executed.', evidence: null, regression: false });
        continue;
      }
      results.push(await runCheck(check, input.driver, budget, input));
    }
  } finally {
    await input.driver.close().catch(() => undefined);
  }
  const summary = summarize(results);
  return {
    version: 1,
    status: summary.status,
    executedChecks: results.filter((check) => check.executed).length,
    passedChecks: results.filter((check) => check.status === 'passed').length,
    failedChecks: results.filter((check) => check.status === 'failed').length,
    pendingChecks: results.filter((check) => check.status === 'pending').length,
    checks: results,
    notChecked: input.plan.notChecked,
    environment: { driver: input.driver.name, browser, baseHost: input.baseHost ?? null },
    startedAt,
    finishedAt: now().toISOString(),
    reason: summary.reason,
  };
}

/** Ids of checks that passed in a report, for regression comparison against the next revision. */
export function passedCheckIds(report: QaReport): Set<string> {
  return new Set(report.checks.filter((check) => check.status === 'passed').map((check) => check.id));
}

/** The one sentence a person should read about a report, never claiming more than was executed. */
export function describeQa(report: QaReport): string {
  return `${report.status.toUpperCase()}: ${report.reason}`;
}
