/**
 * Meters real engineering resource use against the resource ledger (see docs/infra/batch-4/RESOURCE-LEDGER.md).
 *
 * Configuration, never constants:
 *   XROGA_ENGINEERING_METERING=1              turns metering on at all (off by default: the ledger migration is not applied to production)
 *   XROGA_ENGINEERING_CAP_SANDBOX_SECONDS     per-owner sandbox compute allowance in the window
 *   XROGA_ENGINEERING_CAP_BROWSER_SECONDS     per-owner browser session allowance in the window
 *   XROGA_ENGINEERING_CAP_STORAGE_BYTES       per-owner bytes persisted in the window
 *   XROGA_ENGINEERING_CAP_WINDOW_SECONDS      the accounting window (default one day, a window length and not a limit)
 *
 * A category with no cap is RECORD-ONLY: usage is measured and written, nothing is refused, so real measurements exist before anyone chooses a
 * limit. A category with a cap is ENFORCED: it is reserved before the work, refused when exhausted, and fails closed if the ledger is unavailable.
 * Record-only fails open on a ledger outage (usage is lost, work is not blocked) and says so in the log.
 */
import { randomUUID } from 'node:crypto';
import { RESOURCE_CATEGORIES, ResourceLedgerError, SupabaseResourceLedger, type ResourceCategory, type ResourceLedger } from './resourceLedger.js';
import { createTenantContext } from '../security/tenantContext.js';
import { getGlobalSupabaseAdmin } from '../security/serviceRoleGuard.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface MeterConfig {
  readonly enabled: boolean;
  readonly caps: Readonly<Partial<Record<ResourceCategory, number>>>;
  readonly windowSeconds: number;
}

const CAP_ENV: Record<ResourceCategory, string> = {
  sandbox_compute_seconds: 'XROGA_ENGINEERING_CAP_SANDBOX_SECONDS',
  browser_session_seconds: 'XROGA_ENGINEERING_CAP_BROWSER_SECONDS',
  storage_bytes: 'XROGA_ENGINEERING_CAP_STORAGE_BYTES',
};
const DEFAULT_WINDOW_SECONDS = 86_400;
/** Large enough that nothing reaches it: the ledger needs a positive cap, and record-only must never refuse. */
const RECORD_ONLY_CAP = 1e15;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function meterConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MeterConfig {
  const caps: Partial<Record<ResourceCategory, number>> = {};
  for (const category of RESOURCE_CATEGORIES) {
    const raw = env[CAP_ENV[category]];
    if (raw === undefined || raw.trim() === '') continue;
    const n = Number(raw);
    // a malformed cap is a configuration mistake: treating it as "no cap" would silently stop enforcing, so it is refused loudly
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${CAP_ENV[category]} must be a positive number.`);
    caps[category] = n;
  }
  const rawWindow = env.XROGA_ENGINEERING_CAP_WINDOW_SECONDS;
  const window = rawWindow === undefined || rawWindow.trim() === '' ? DEFAULT_WINDOW_SECONDS : Number(rawWindow);
  if (!Number.isFinite(window) || window < 60 || window > 31 * 86_400) throw new Error('XROGA_ENGINEERING_CAP_WINDOW_SECONDS must be between 60 seconds and 31 days.');
  return { enabled: env.XROGA_ENGINEERING_METERING === '1', caps, windowSeconds: Math.floor(window) };
}

export class ResourceExhaustedError extends Error {
  readonly code = 'RESOURCE_EXHAUSTED' as const;
  constructor(readonly category: ResourceCategory, readonly used: number, readonly cap: number) {
    super('The allowance for this resource is used up for now.');
    this.name = 'ResourceExhaustedError';
  }
}

export interface MeterInput { readonly category: ResourceCategory; readonly runId: string; readonly estimateUnits: number; readonly key?: string }

export class ResourceMeter {
  constructor(private readonly ledger: ResourceLedger, private readonly config: MeterConfig, private readonly warn: (message: string) => void = (m) => console.warn(m)) {}

  isEnforced(category: ResourceCategory): boolean { return this.config.caps[category] !== undefined; }

  /**
   * Reserves, runs, and settles the measured units exactly once. `measure` receives the result (undefined if the work threw) and the elapsed seconds.
   * Work that throws is still charged what it used. A settlement failure never fails the work: the hold stays open and the sweep charges it in full.
   */
  async measure<T>(input: MeterInput, run: () => Promise<T>, measure?: (result: T | undefined, elapsedSeconds: number) => number): Promise<T> {
    if (!this.config.enabled || !uuid.test(input.runId)) return run();
    const enforced = this.isEnforced(input.category);
    const cap = this.config.caps[input.category] ?? RECORD_ONLY_CAP;
    const estimate = Math.max(1, Math.ceil(input.estimateUnits));
    let reservationId: string | null = null;
    try {
      const reserved = await this.ledger.reserve({ runId: input.runId, category: input.category, units: estimate, key: input.key ?? `meter-${randomUUID()}`, cap, windowSeconds: this.config.windowSeconds });
      if (reserved.state === 'exhausted') throw new ResourceExhaustedError(input.category, reserved.used, reserved.cap);
      reservationId = reserved.reservationId;
    } catch (error) {
      if (error instanceof ResourceExhaustedError) throw error;
      if (error instanceof ResourceLedgerError && enforced) throw error; // enforced: cannot prove the allowance, so the work does not start
      this.warn(`[resourceMeter] ledger unavailable; ${input.category} use is not recorded for this call`);
      return run();
    }
    const started = performance.now();
    let result: T | undefined;
    try {
      result = await run();
      return result;
    } finally {
      const elapsedSeconds = (performance.now() - started) / 1000;
      const units = Math.max(0, Math.ceil(measure ? measure(result, elapsedSeconds) : elapsedSeconds));
      await this.ledger.settle(reservationId, units).catch(() => this.warn('[resourceMeter] settlement failed; the open hold will be charged by the sweep'));
    }
  }
}

/** The meter for one owner, or null when metering is off, so callers can skip it without branching on configuration. */
export function engineeringMeterFor(userId: string, config: MeterConfig = meterConfigFromEnv(), ledgerFor: (userId: string) => ResourceLedger = (id) => new SupabaseResourceLedger(createTenantContext({ userId: id, via: 'persisted_owner' }))): ResourceMeter | null {
  if (!config.enabled) return null;
  return new ResourceMeter(ledgerFor(userId), config);
}

/**
 * A hold whose worker died before settling is charged in full by the database sweep. The threshold must be longer than any call can legitimately
 * run, or a live call's hold would be charged early: the longest canonical task timeout is 55 minutes, so the default is two hours. Configurable.
 */
export function sweepThresholdSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.XROGA_ENGINEERING_SWEEP_AFTER_SECONDS;
  const n = raw === undefined || raw.trim() === '' ? 7200 : Number(raw);
  if (!Number.isFinite(n) || n < 3600) throw new Error('XROGA_ENGINEERING_SWEEP_AFTER_SECONDS must be at least 3600 so a running call is never charged early.');
  return Math.floor(n);
}

/** One maintenance step: sweep stale holds. Returns how many were charged. Does nothing when metering is off. */
export async function sweepStaleEngineeringReservations(config: MeterConfig = meterConfigFromEnv(), client?: SupabaseClient): Promise<number> {
  if (!config.enabled) return 0;
  const supabase = client ?? getGlobalSupabaseAdmin('engineering_resource_sweep');
  const { data, error } = await supabase.rpc('sweep_stale_engineering_reservations', { p_older_than: `${sweepThresholdSeconds()} seconds` });
  if (error) throw new ResourceLedgerError('RESOURCE_UNAVAILABLE', 'The resource ledger sweep is unavailable.');
  return Number(data ?? 0);
}
