/**
 * The browser job contract (INFRA-006): what a browser worker is allowed to be told, and nothing more.
 *
 * A job is issued by the trusted API on behalf of ONE tenant, user, project, run and task attempt. The worker never decides its own
 * scope: it may only navigate to the origins listed here, within the listed limits, and every URL it is asked to open (the start
 * URL, a click-through, a redirect) is checked against this scope AND against the canonical egress policy
 * (`security/boundedPublicGet.ts`: https only, no credentials, no custom port, no private, loopback, link-local or metadata address).
 *
 * The parser is a strict allow-list. Unknown fields are refused, so a credential, token or cookie cannot ride along in a job, and a
 * browser secret has no field to occupy. Page text and Stagehand output are untrusted data: nothing in this module lets them widen
 * the scope or create an authorisation grant.
 */
import { createHash } from 'node:crypto';
import { publicHttpsUrl } from '../security/boundedPublicGet.js';

export type BrowserJobFailure = 'JOB_INVALID' | 'JOB_SCOPE_VIOLATION' | 'JOB_LIMIT_EXCEEDED';

export class BrowserJobError extends Error {
  readonly code: BrowserJobFailure;
  constructor(code: BrowserJobFailure, message: string) {
    super(message);
    this.name = 'BrowserJobError';
    this.code = code;
  }
}

export interface BrowserJobLimits {
  /** wall-clock budget for the whole attempt, including cleanup of the browser process tree */
  maxDurationMs: number;
  maxNavigations: number;
  maxRedirects: number;
  maxPages: number;
  /** total response bytes the browser may download */
  maxResponseBytes: number;
  /** total bytes of evidence the job may hand to Drive */
  maxArtifactBytes: number;
  /** cost ceiling in micro-dollars for model use during this job; 0 means no model use is allowed */
  maxModelCostMicros: number;
}

/** Hard ceilings: a job may ask for less, never more. Raising these is a code review, not a payload. */
export const BROWSER_JOB_CEILINGS: Readonly<BrowserJobLimits> = Object.freeze({
  maxDurationMs: 10 * 60_000,
  maxNavigations: 200,
  maxRedirects: 5,
  maxPages: 5,
  maxResponseBytes: 512 * 1024 * 1024,
  maxArtifactBytes: 256 * 1024 * 1024,
  maxModelCostMicros: 5_000_000,
});

export interface BrowserJob {
  version: 1;
  tenantId: string;
  userId: string;
  projectId: string;
  runId: string;
  taskId: string;
  /** 1-based attempt number of this task; part of the evidence trail, not of the idempotency key */
  attempt: number;
  /** https origins (scheme + host, no path) the browser may reach */
  allowedOrigins: string[];
  startUrl: string;
  limits: BrowserJobLimits;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const JOB_KEYS = new Set(['version', 'tenantId', 'userId', 'projectId', 'runId', 'taskId', 'attempt', 'allowedOrigins', 'startUrl', 'limits']);
const LIMIT_KEYS = Object.keys(BROWSER_JOB_CEILINGS) as (keyof BrowserJobLimits)[];
/** limits where zero is meaningful: no redirects, no model spend */
const ZERO_OK = new Set<keyof BrowserJobLimits>(['maxModelCostMicros', 'maxRedirects']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function id(record: Record<string, unknown>, field: string): string {
  const v = record[field];
  if (typeof v !== 'string' || !ID.test(v)) throw new BrowserJobError('JOB_INVALID', `${field} must be a short identifier`);
  return v;
}

/** The origin of a URL the canonical egress policy admits, or a refusal. Redacted: the URL is never echoed back. */
function admittedOrigin(raw: unknown, what: string): string {
  if (typeof raw !== 'string') throw new BrowserJobError('JOB_INVALID', `${what} must be a URL string`);
  try {
    return publicHttpsUrl(raw).origin;
  } catch {
    throw new BrowserJobError('JOB_SCOPE_VIOLATION', `${what} is not an admitted public https target`);
  }
}

/** Validates an untrusted payload into a BrowserJob. Throws BrowserJobError; never returns a partially valid job. */
export function parseBrowserJob(input: unknown): BrowserJob {
  if (!isRecord(input)) throw new BrowserJobError('JOB_INVALID', 'a browser job must be an object');
  for (const k of Object.keys(input)) if (!JOB_KEYS.has(k)) throw new BrowserJobError('JOB_INVALID', `unknown job field "${k.slice(0, 40)}"`);
  if (input.version !== 1) throw new BrowserJobError('JOB_INVALID', 'unsupported job version');
  const attempt = input.attempt;
  if (typeof attempt !== 'number' || !Number.isSafeInteger(attempt) || attempt < 1 || attempt > 100) throw new BrowserJobError('JOB_INVALID', 'attempt must be an integer from 1 to 100');

  const origins = input.allowedOrigins;
  if (!Array.isArray(origins) || origins.length < 1 || origins.length > 20) throw new BrowserJobError('JOB_INVALID', 'allowedOrigins must list 1 to 20 origins');
  const allowedOrigins = [...new Set(origins.map((o) => admittedOrigin(o, 'an allowed origin')))].sort();

  const startOrigin = admittedOrigin(input.startUrl, 'startUrl');
  if (!allowedOrigins.includes(startOrigin)) throw new BrowserJobError('JOB_SCOPE_VIOLATION', 'startUrl is outside allowedOrigins');
  const startUrl = publicHttpsUrl(input.startUrl as string).href;

  if (!isRecord(input.limits)) throw new BrowserJobError('JOB_INVALID', 'limits are required');
  for (const k of Object.keys(input.limits)) if (!(LIMIT_KEYS as string[]).includes(k)) throw new BrowserJobError('JOB_INVALID', `unknown limit "${k.slice(0, 40)}"`);
  const limits = {} as BrowserJobLimits;
  for (const k of LIMIT_KEYS) {
    const v = input.limits[k];
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < (ZERO_OK.has(k) ? 0 : 1)) throw new BrowserJobError('JOB_INVALID', `limit ${k} must be a whole number in range`);
    if (v > BROWSER_JOB_CEILINGS[k]) throw new BrowserJobError('JOB_LIMIT_EXCEEDED', `limit ${k} exceeds the ceiling`);
    limits[k] = v;
  }

  return {
    version: 1, tenantId: id(input, 'tenantId'), userId: id(input, 'userId'), projectId: id(input, 'projectId'),
    runId: id(input, 'runId'), taskId: id(input, 'taskId'), attempt,
    allowedOrigins, startUrl, limits,
  };
}

/**
 * Whether the browser may load `rawUrl` for this job. Used for the start URL, every navigation, and every redirect hop:
 * the egress policy admits the target, and its origin must be in the job's scope (exact origin match, no wildcard).
 */
export function navigationAllowed(job: BrowserJob, rawUrl: string): boolean {
  try {
    return job.allowedOrigins.includes(publicHttpsUrl(rawUrl).origin);
  } catch {
    return false;
  }
}

/**
 * Stable across attempts of the same task, different across tenants/runs/tasks: lets a retry find the evidence an earlier
 * attempt already stored instead of storing it twice.
 */
export function jobIdempotencyKey(job: Pick<BrowserJob, 'tenantId' | 'runId' | 'taskId'>): string {
  return createHash('sha256').update(JSON.stringify([job.tenantId, job.runId, job.taskId])).digest('hex');
}
