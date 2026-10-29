/**
 * Operator-only access to engineering diagnostics, per-tenant resource caps and ledger retention.
 *
 * Every function here is reached only from the admin router (behind the authentication and database admin/owner middleware) or from the existing
 * delivery maintenance tick, through registered named privileged operations. Diagnostics return counts, ages and identifiers, never prompts,
 * outputs or credentials. Nothing here chooses a cap: a per-tenant cap exists only if an operator sets it, and an unset category keeps the caller's
 * default (or stays record-only).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGlobalSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { ORPHAN_GRACE_MS, QUEUED_RUN_TTL_MS } from './runReconciler.js';
import { RESOURCE_CATEGORIES, type ResourceCategory } from './resourceLedger.js';
import { meterConfigFromEnv, sweepThresholdSeconds, type MeterConfig } from './resourceMeter.js';

export class OperatorError extends Error {
  constructor(readonly code: 'INVALID' | 'UNAVAILABLE', message: string) { super(message); this.name = 'OperatorError'; }
}

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
/** The largest cap an operator can set; also the record-only sentinel's order of magnitude, so a typo in digits cannot silently disable a limit by overflow. */
export const MAX_TENANT_CAP = 1e15;

const operatorClient = (): SupabaseClient => getGlobalSupabaseAdmin('engineering_operator');
const unavailable = (): never => { throw new OperatorError('UNAVAILABLE', 'The engineering records are unavailable.'); };

export function requireCategory(value: unknown): ResourceCategory {
  if (typeof value !== 'string' || !RESOURCE_CATEGORIES.includes(value as ResourceCategory)) throw new OperatorError('INVALID', 'Unknown resource category.');
  return value as ResourceCategory;
}
export function requireUserId(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new OperatorError('INVALID', 'Invalid user id.');
  return value;
}
export function requireCap(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_TENANT_CAP) throw new OperatorError('INVALID', 'The cap must be a positive number.');
  return value;
}

export interface EngineeringDiagnostics {
  readonly generatedAt: string;
  readonly runs: Record<string, number>;
  readonly deliveries: Record<string, number>;
  readonly reservations: Record<string, number>;
  readonly samples: Record<string, readonly string[]>;
  /** The thresholds the numbers were computed with, so an operator can tell what "stale" meant. */
  readonly thresholds: { readonly queueWaitSeconds: number; readonly workerStaleSeconds: number; readonly holdStaleSeconds: number };
  readonly metering: { readonly enabled: boolean; readonly enforcedCategories: readonly ResourceCategory[]; readonly windowSeconds: number };
}

export async function getEngineeringDiagnostics(client: SupabaseClient = operatorClient(), config: MeterConfig = meterConfigFromEnv()): Promise<EngineeringDiagnostics> {
  const thresholds = { queueWaitSeconds: Math.floor(QUEUED_RUN_TTL_MS / 1000), workerStaleSeconds: Math.floor(ORPHAN_GRACE_MS / 1000), holdStaleSeconds: sweepThresholdSeconds() };
  const { data, error } = await client.rpc('engineering_diagnostics', {
    p_queue_ttl: `${thresholds.queueWaitSeconds} seconds`, p_worker_stale: `${thresholds.workerStaleSeconds} seconds`, p_hold_stale: `${thresholds.holdStaleSeconds} seconds`,
  });
  if (error || !data || typeof data !== 'object') return unavailable();
  const d = data as { generatedAt: string; runs: Record<string, number>; deliveries: Record<string, number>; reservations: Record<string, number>; samples: Record<string, string[]> };
  return {
    generatedAt: String(d.generatedAt), runs: d.runs, deliveries: d.deliveries, reservations: d.reservations, samples: d.samples, thresholds,
    metering: { enabled: config.enabled, enforcedCategories: RESOURCE_CATEGORIES.filter((c) => config.caps[c] !== undefined), windowSeconds: config.windowSeconds },
  };
}

export async function listTenantLimits(userId: unknown, client: SupabaseClient = operatorClient()): Promise<Array<{ category: string; cap: number; updatedAt: string }>> {
  const { data, error } = await client.rpc('list_engineering_resource_limits', { p_user: requireUserId(userId) });
  if (error || !Array.isArray(data)) return unavailable();
  return data as Array<{ category: string; cap: number; updatedAt: string }>;
}

export async function setTenantLimit(userId: unknown, category: unknown, cap: unknown, client: SupabaseClient = operatorClient()): Promise<void> {
  const { error } = await client.rpc('set_engineering_resource_limit', { p_user: requireUserId(userId), p_category: requireCategory(category), p_cap: requireCap(cap) });
  if (error) unavailable();
}

export async function clearTenantLimit(userId: unknown, category: unknown, client: SupabaseClient = operatorClient()): Promise<'cleared' | 'absent'> {
  const { data, error } = await client.rpc('clear_engineering_resource_limit', { p_user: requireUserId(userId), p_category: requireCategory(category) });
  if (error || !data || typeof data !== 'object') return unavailable();
  return (data as { state: string }).state === 'cleared' ? 'cleared' : 'absent';
}

/**
 * Retention period in days, from XROGA_ENGINEERING_RETENTION_DAYS. Unset means rows are kept (no purge). A value shorter than the accounting window is
 * refused, because a purge must never remove a row the window still counts.
 */
export function retentionDaysFromEnv(env: NodeJS.ProcessEnv = process.env, windowSeconds: number = meterConfigFromEnv(env).windowSeconds): number | null {
  const raw = env.XROGA_ENGINEERING_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === '') return null;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('XROGA_ENGINEERING_RETENTION_DAYS must be a whole number of days between 1 and 3650.');
  if (days * 86_400 < windowSeconds) throw new Error('XROGA_ENGINEERING_RETENTION_DAYS cannot be shorter than the accounting window.');
  return days;
}

/** One maintenance step: remove settled and released ledger rows older than the retention period. No retention configured, or metering off, does nothing. */
export async function purgeExpiredEngineeringReservations(config: MeterConfig = meterConfigFromEnv(), client?: SupabaseClient, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  if (!config.enabled) return 0;
  const days = retentionDaysFromEnv(env, config.windowSeconds);
  if (days === null) return 0;
  const { data, error } = await (client ?? getGlobalSupabaseAdmin('engineering_resource_retention')).rpc('purge_engineering_reservations', { p_older_than: `${days} days` });
  if (error) return unavailable();
  return Number(data ?? 0);
}
