/**
 * Isolated browser QA: the supported production path for testing GENERATED applications.
 *
 * Generated pages are untrusted code, so production does not drive Chromium inside the customer-facing API container (see
 * `inProcessQaAllowed`). Instead the API sends the declarative QA plan (data, never code) to a separate browser host and receives a
 * report back:
 *
 *   API: RemoteQaClient  ── signed HTTPS ──>  isolated host: createQaHostRouter ──> Playwright ──> the preview under test
 *
 * Trust runs one way. The host is a less-trusted place than the API, so its answer is not believed as it arrives: `sealRemoteReport`
 * rebuilds the report from the plan the API itself derived (titles, categories, viewports and which checks are required come from the
 * plan, never from the host), accepts only a result for a check that was asked for, refuses an impossible combination (a check
 * "passed" without having executed), recomputes every count and the overall status with the same function the local runner uses, and
 * turns every check the host did not report into a pending one. A host that is down, unreachable, slow or lying can make QA "not run"
 * or "failed"; it cannot make a revision "verified".
 *
 * The request reuses the browser coordinator's authentication (HMAC-SHA256 over method, path, timestamp, single-use nonce and body
 * hash; 60 s window; replay refused), so there is one signing scheme to review.
 */
import { Router, raw, type Request, type Response } from 'express';
import { z } from 'zod';

import { NonceCache, signRequest, verifyRequest } from '../../workers/browserCoordinator.js';
import { summarizeChecks, type QaEnvironment } from './runner.js';
import {
  MAX_DIAGNOSTIC_LENGTH, MAX_DIAGNOSTIC_LINES, MAX_SCREENSHOT_BYTES, MAX_SCREENSHOTS_PER_REPORT,
  type QaCheck, type QaCheckResult, type QaEvidence, type QaFailureClass, type QaPlan, type QaReport,
} from './types.js';

export interface RemoteQaInput {
  readonly baseUrl: string;
  readonly plan: QaPlan;
  readonly environment: QaEnvironment;
  readonly only?: ReadonlySet<string>;
  readonly previouslyPassed?: ReadonlySet<string>;
  readonly signal?: AbortSignal;
}

/** Runs a plan somewhere isolated and returns a report the caller has already sealed. */
export interface RemoteQaExecutor {
  run(input: RemoteQaInput): Promise<QaReport>;
}

const unavailable = (message: string) => Object.assign(new Error(message), { code: 'BROWSER_UNAVAILABLE' });

// ------------------------------------------------------------------------------------------------- request validation (host side)
const text = (max: number) => z.string().min(1).max(max);
const step = z.discriminatedUnion('op', [
  z.object({ op: z.literal('goto'), path: text(500).regex(/^\//) }).strict(),
  z.object({ op: z.literal('click'), selector: text(300) }).strict(),
  z.object({ op: z.literal('fill'), selector: text(300), value: z.string().max(500) }).strict(),
  z.object({ op: z.literal('reload') }).strict(),
  z.object({ op: z.literal('expectText'), text: text(500) }).strict(),
  z.object({ op: z.literal('expectVisible'), selector: text(300) }).strict(),
  z.object({ op: z.literal('expectUrlPath'), path: text(500).regex(/^\//) }).strict(),
  z.object({ op: z.literal('expectNoHorizontalOverflow') }).strict(),
  z.object({ op: z.literal('expectViewportMeta') }).strict(),
  z.object({ op: z.literal('expectFormRejectsEmpty'), selector: text(300) }).strict(),
  z.object({ op: z.literal('expectFeedbackAfter'), selector: text(300) }).strict(),
  z.object({ op: z.literal('expectProtected'), path: text(500).regex(/^\//) }).strict(),
]);
const check = z.object({
  id: text(120), title: text(300), category: z.enum(['content', 'navigation', 'forms', 'responsive', 'auth', 'persistence', 'criterion']),
  viewport: z.enum(['desktop', 'mobile']), required: z.boolean(), steps: z.array(step).min(1).max(40),
  requires: z.literal('database').optional(), derivedFrom: text(500),
}).strict();
const planSchema = z.object({
  version: z.literal(1), checks: z.array(check).max(200),
  notChecked: z.array(z.object({ criterion: z.string().max(500), reason: z.string().max(500) }).strict()).max(200),
}).strict();
const requestSchema = z.object({
  version: z.literal(1), baseUrl: text(2_048), plan: planSchema, environment: z.object({ database: z.boolean() }).strict(),
  only: z.array(text(120)).max(200).optional(), previouslyPassed: z.array(text(120)).max(200).optional(),
}).strict();
export type QaHostRequest = z.infer<typeof requestSchema>;

// ---------------------------------------------------------------------------------------------------- report sealing (API side)
const FAILURE_CLASSES: readonly QaFailureClass[] = ['browser_assertion_failure', 'runtime_error', 'preview_error', 'authentication_error', 'database_error'];
const clip = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');
const lines = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, MAX_DIAGNOSTIC_LINES).map((v) => clip(v, MAX_DIAGNOSTIC_LENGTH)) : []);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function sealEvidence(value: unknown, screenshots: { left: number }): QaEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const e = value as Record<string, unknown>;
  let screenshot: string | null = null;
  if (typeof e.screenshot === 'string' && screenshots.left > 0 && e.screenshot.length <= Math.ceil(MAX_SCREENSHOT_BYTES * 4 / 3) + 4 && BASE64.test(e.screenshot)) {
    screenshot = e.screenshot; screenshots.left -= 1;
  }
  return {
    url: typeof e.url === 'string' ? clip(e.url, 500) : null,
    httpStatus: typeof e.httpStatus === 'number' && Number.isInteger(e.httpStatus) && e.httpStatus >= 100 && e.httpStatus <= 599 ? e.httpStatus : null,
    failedStep: typeof e.failedStep === 'string' ? clip(e.failedStep, 300) : null,
    message: typeof e.message === 'string' ? clip(e.message, MAX_DIAGNOSTIC_LENGTH) : null,
    consoleErrors: lines(e.consoleErrors), pageErrors: lines(e.pageErrors), failedRequests: lines(e.failedRequests), screenshot,
  };
}

/**
 * Turns whatever the host returned into a report that is safe to record. Never throws for a hostile or broken body: anything not
 * established is pending. The plan and the base URL are the API's own.
 */
export function sealRemoteReport(input: { plan: QaPlan; only?: ReadonlySet<string>; previouslyPassed?: ReadonlySet<string>; baseUrl: string }, response: unknown, clock: () => Date = () => new Date()): QaReport {
  const body = (response && typeof response === 'object' ? response : {}) as Record<string, unknown>;
  const reported = new Map<string, Record<string, unknown>>();
  if (Array.isArray(body.checks)) {
    for (const item of body.checks) {
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string' && !reported.has((item as { id: string }).id)) reported.set((item as { id: string }).id, item as Record<string, unknown>);
    }
  }
  const asked: readonly QaCheck[] = input.plan.checks.filter((c) => !input.only || input.only.has(c.id));
  const screenshots = { left: MAX_SCREENSHOTS_PER_REPORT };
  const results: QaCheckResult[] = asked.map((planned) => {
    const base = { id: planned.id, title: planned.title, category: planned.category, viewport: planned.viewport, required: planned.required };
    const got = reported.get(planned.id);
    const status = got?.status;
    const executed = got?.executed === true;
    const duration = typeof got?.durationMs === 'number' && Number.isFinite(got.durationMs) ? Math.min(Math.max(0, Math.round(got.durationMs)), 10 * 60_000) : 0;
    if (got && executed && (status === 'passed' || status === 'failed')) {
      const failureClass = status === 'failed' ? (FAILURE_CLASSES.includes(got.failureClass as QaFailureClass) ? (got.failureClass as QaFailureClass) : 'browser_assertion_failure') : null;
      return {
        ...base, status, executed: true, failureClass, durationMs: duration, pendingReason: null,
        evidence: status === 'failed' ? sealEvidence(got.evidence, screenshots) : null,
        // regression is the API's own comparison against the previous revision, not the host's claim
        regression: status === 'failed' && Boolean(input.previouslyPassed?.has(planned.id)),
      };
    }
    const reason = got && status === 'pending' && typeof got.pendingReason === 'string' && got.pendingReason ? clip(got.pendingReason, 300) : 'The isolated browser did not report a result for this check.';
    return { ...base, status: 'pending' as const, executed: false, failureClass: null, durationMs: 0, pendingReason: reason, evidence: null, regression: false };
  });
  const summary = summarizeChecks(results);
  const env = (body.environment && typeof body.environment === 'object' ? body.environment : {}) as Record<string, unknown>;
  const now = clock().toISOString();
  return {
    version: 1,
    status: summary.status,
    executedChecks: results.filter((c) => c.executed).length,
    passedChecks: results.filter((c) => c.status === 'passed').length,
    failedChecks: results.filter((c) => c.status === 'failed').length,
    pendingChecks: results.filter((c) => c.status === 'pending').length,
    checks: results,
    notChecked: input.plan.notChecked,
    // the browser host is named, so a reader can see these were not run in the API container
    environment: { driver: `remote:${clip(env.driver, 48) || 'unknown'}`, browser: typeof env.browser === 'string' ? clip(env.browser, 100) : null, baseHost: new URL(input.baseUrl).host },
    startedAt: typeof body.startedAt === 'string' && !Number.isNaN(Date.parse(body.startedAt)) ? new Date(body.startedAt).toISOString() : now,
    finishedAt: now,
    reason: summary.reason,
  };
}

// ------------------------------------------------------------------------------------------------------------------ client (API)
export interface RemoteQaClientOptions {
  /** the isolated host's base URL; https unless loopback */
  readonly hostUrl: string;
  /** shared secret, at least 32 bytes */
  readonly secret: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export class RemoteQaClient implements RemoteQaExecutor {
  private readonly base: URL;
  constructor(private readonly options: RemoteQaClientOptions) {
    if (typeof options.secret !== 'string' || Buffer.byteLength(options.secret) < 32) throw new Error('The browser QA host secret must be at least 32 bytes');
    this.base = new URL(options.hostUrl);
    if (this.base.username || this.base.password || this.base.search || this.base.hash) throw new Error('The browser QA host must not contain credentials or capability parameters.');
    if (this.base.protocol !== 'https:' && !(this.base.protocol === 'http:' && LOOPBACK.has(this.base.hostname))) throw new Error('The browser QA host must be reached over https');
  }

  async run(input: RemoteQaInput): Promise<QaReport> {
    const request: QaHostRequest = {
      version: 1, baseUrl: input.baseUrl, plan: input.plan as QaHostRequest['plan'], environment: { database: input.environment.database },
      ...(input.only ? { only: [...input.only] } : {}), ...(input.previouslyPassed ? { previouslyPassed: [...input.previouslyPassed] } : {}),
    };
    const body = JSON.stringify(request);
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 10 * 60_000);
    const signal = input.signal ? AbortSignal.any([timeout, input.signal]) : timeout;
    signal.throwIfAborted();
    let response: globalThis.Response;
    try {
      response = await (this.options.fetch ?? fetch)(new URL('/qa', this.base), { method: 'POST', redirect: 'manual', headers: signRequest(this.options.secret, 'POST', '/qa', body), body, signal });
    } catch {
      // Unreachable, refused, timed out or cancelled: nothing was tested, and the caller records exactly that.
      throw unavailable('The isolated browser host could not be reached, so nothing was tested.');
    }
    signal.throwIfAborted();
    if (response.redirected || !response.ok) { await response.body?.cancel().catch(() => undefined); throw unavailable(`The isolated browser host refused the request (${response.status}), so nothing was tested.`); }
    const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
    try {
      if (reader) for (;;) {
        const next = await reader.read(); if (next.done) break;
        signal.throwIfAborted(); bytes += next.value.length;
        if (bytes > 16 * 1024 * 1024) throw unavailable('The isolated browser answer exceeded its bound, so nothing was tested.');
        chunks.push(next.value);
      }
    } finally { await reader?.cancel().catch(() => undefined); reader?.releaseLock(); }
    let parsed: unknown;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw unavailable('The isolated browser host returned an unreadable answer, so nothing was tested.'); }
    signal.throwIfAborted();
    return sealRemoteReport({ plan: input.plan, only: input.only, previouslyPassed: input.previouslyPassed, baseUrl: input.baseUrl }, parsed);
  }
}

/** The remote executor the environment asks for, or null (the in-process driver rules then decide). */
export function remoteQaFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch): RemoteQaExecutor | null {
  const hostUrl = env.XROGA_BUILDER_QA_HOST_URL?.trim(); const secret = env.XROGA_BUILDER_QA_HOST_SECRET;
  if (!hostUrl && !secret) return null;
  // A half-configured host is a configuration error, not a reason to quietly run something else.
  if (!hostUrl || !secret) throw new Error('XROGA_BUILDER_QA_HOST_URL and XROGA_BUILDER_QA_HOST_SECRET must be set together');
  return new RemoteQaClient({ hostUrl, secret, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
}

// ------------------------------------------------------------------------------------------------------------- host (isolated side)
export interface QaHostDeps {
  readonly secret: string;
  /** which application URLs this host may drive; refuse everything by default (fail closed) */
  readonly allowBaseUrl: (url: URL) => boolean;
  /** executes a validated plan against a base URL with a real browser (production: Playwright + runQa) */
  readonly execute: (input: { baseUrl: string; plan: QaPlan; environment: QaEnvironment; only?: ReadonlySet<string>; previouslyPassed?: ReadonlySet<string> }) => Promise<unknown>;
  readonly nonces?: NonceCache;
  readonly now?: () => number;
}

/** `https` preview hosts by suffix, e.g. ".preview.xroga.com". An empty list allows nothing. */
export function allowedPreviewHosts(suffixes: readonly string[]): (url: URL) => boolean {
  const clean = suffixes.map((s) => s.trim().toLowerCase()).filter(Boolean);
  return (url) => {
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (/^[\d.]+$/.test(host) || host.includes(':') || host === 'localhost') return false;
    return clean.some((suffix) => (suffix.startsWith('.') ? host.endsWith(suffix) : host === suffix));
  };
}

export function createQaHostRouter(deps: QaHostDeps): Router {
  if (Buffer.byteLength(deps.secret) < 32) throw new Error('The browser QA host secret must be at least 32 bytes');
  const router = Router();
  const nonces = deps.nonces ?? new NonceCache();
  router.post('/qa', raw({ type: () => true, limit: '2mb' }), async (req: Request, res: Response) => {
    const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    // authenticate before parsing anything
    if (!verifyRequest(deps.secret, nonces, 'POST', '/qa', body, req.headers, deps.now?.())) return res.status(401).json({ error: 'Unauthorized.' });
    let parsed: QaHostRequest;
    try { parsed = requestSchema.parse(JSON.parse(body)); } catch { return res.status(400).json({ error: 'Invalid request.' }); }
    let target: URL;
    try { target = new URL(parsed.baseUrl); } catch { return res.status(400).json({ error: 'Invalid request.' }); }
    if (!deps.allowBaseUrl(target)) return res.status(403).json({ error: 'This host does not test that address.' });
    try {
      const report = await deps.execute({
        baseUrl: target.origin, plan: parsed.plan as unknown as QaPlan, environment: parsed.environment,
        ...(parsed.only ? { only: new Set(parsed.only) } : {}), ...(parsed.previouslyPassed ? { previouslyPassed: new Set(parsed.previouslyPassed) } : {}),
      });
      return res.json(report);
    } catch {
      return res.status(503).json({ error: 'The browser could not run the tests.' });
    }
  });
  return router;
}
