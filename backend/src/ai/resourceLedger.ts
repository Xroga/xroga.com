/**
 * Client for the engineering resource ledger (supabase/migrations/20261029100000_engineering_resource_ledger.sql).
 *
 * Meters the three things model-budget accounting does not: sandbox compute, browser sessions and persistent storage. The caps come from the caller
 * (configuration, never a number baked in here) and the owner comes only from the issued tenant context, so a request body or a model can neither
 * name another owner nor raise a cap.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';
import type { BudgetPort } from './repairController.js';

export type ResourceCategory = 'sandbox_compute_seconds' | 'browser_session_seconds' | 'storage_bytes';
export const RESOURCE_CATEGORIES: readonly ResourceCategory[] = ['sandbox_compute_seconds', 'browser_session_seconds', 'storage_bytes'];

export type ReserveOutcome =
  | { readonly state: 'reserved' | 'duplicate'; readonly reservationId: string }
  | { readonly state: 'exhausted'; readonly used: number; readonly cap: number };

export interface SettleOutcome { readonly state: 'settled' | 'already_settled' | 'released'; readonly settledUnits?: number; readonly overrun?: boolean }

export interface ResourceLedger {
  reserve(input: { runId: string; category: ResourceCategory; units: number; key: string; cap: number; windowSeconds: number }): Promise<ReserveOutcome>;
  settle(reservationId: string, actualUnits: number, providerResourceId?: string): Promise<SettleOutcome>;
  release(reservationId: string): Promise<{ state: 'released' | 'settled' | 'reserved' }>;
}

export class ResourceLedgerError extends Error {
  constructor(readonly code: 'RESOURCE_UNAVAILABLE' | 'RESOURCE_INVALID', message: string) { super(message); this.name = 'ResourceLedgerError'; }
}

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export class SupabaseResourceLedger implements ResourceLedger {
  private readonly context: TenantContext;
  constructor(context: TenantContext, private readonly service: (context: TenantContext) => SupabaseClient = getTenantSupabaseAdmin) {
    this.context = requireTenantContext(context);
  }

  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.service(this.context).rpc(name, args);
    // The database error text is never returned: it can name tables and constraints.
    if (error) throw new ResourceLedgerError('RESOURCE_UNAVAILABLE', 'The resource ledger is unavailable.');
    return data as T;
  }

  async reserve(input: { runId: string; category: ResourceCategory; units: number; key: string; cap: number; windowSeconds: number }): Promise<ReserveOutcome> {
    if (!uuid.test(input.runId) || !RESOURCE_CATEGORIES.includes(input.category) || !(input.units > 0) || !(input.cap > 0) || input.key.length < 8 || input.key.length > 128
      || !(input.windowSeconds >= 60 && input.windowSeconds <= 31 * 86_400)) throw new ResourceLedgerError('RESOURCE_INVALID', 'The resource request is invalid.');
    const r = await this.rpc<{ state: string; reservationId?: string; used?: number; cap?: number }>('reserve_engineering_resource', {
      p_user: this.context.userId, p_run: input.runId, p_category: input.category, p_units: input.units, p_key: input.key, p_cap: input.cap, p_window: `${Math.floor(input.windowSeconds)} seconds`,
    });
    if ((r.state === 'reserved' || r.state === 'duplicate') && r.reservationId && uuid.test(r.reservationId)) return { state: r.state, reservationId: r.reservationId };
    if (r.state === 'exhausted') return { state: 'exhausted', used: Number(r.used ?? 0), cap: Number(r.cap ?? input.cap) };
    throw new ResourceLedgerError('RESOURCE_UNAVAILABLE', 'The resource ledger returned an unexpected answer.');
  }

  async settle(reservationId: string, actualUnits: number, providerResourceId?: string): Promise<SettleOutcome> {
    if (!uuid.test(reservationId) || !(actualUnits >= 0)) throw new ResourceLedgerError('RESOURCE_INVALID', 'The settlement is invalid.');
    const r = await this.rpc<{ state: string; settledUnits?: number; overrun?: boolean }>('settle_engineering_resource', {
      p_user: this.context.userId, p_reservation: reservationId, p_actual: actualUnits, p_provider_resource: providerResourceId ?? null,
    });
    if (r.state !== 'settled' && r.state !== 'already_settled' && r.state !== 'released') throw new ResourceLedgerError('RESOURCE_UNAVAILABLE', 'The resource ledger returned an unexpected answer.');
    return { state: r.state, settledUnits: r.settledUnits === undefined ? undefined : Number(r.settledUnits), overrun: r.overrun };
  }

  async release(reservationId: string): Promise<{ state: 'released' | 'settled' | 'reserved' }> {
    if (!uuid.test(reservationId)) throw new ResourceLedgerError('RESOURCE_INVALID', 'The release is invalid.');
    const r = await this.rpc<{ state: string }>('release_engineering_resource', { p_user: this.context.userId, p_reservation: reservationId });
    if (r.state !== 'released' && r.state !== 'settled' && r.state !== 'reserved') throw new ResourceLedgerError('RESOURCE_UNAVAILABLE', 'The resource ledger returned an unexpected answer.');
    return { state: r.state };
  }
}

/**
 * Adapts the ledger to the repair controller's budget port, so a repair attempt holds sandbox compute before it runs and settles it exactly once.
 * `unitsPerAttempt` is the held amount; the settled amount is whatever the caller measured (defaulting to the hold when nothing was measured).
 */
export function ledgerBudgetPort(ledger: ResourceLedger, config: {
  runId: string; category: ResourceCategory; unitsPerAttempt: number; cap: number; windowSeconds: number;
  measured?: (reservationId: string) => number | undefined;
}): BudgetPort {
  return {
    async reserve(attempt) {
      const r = await ledger.reserve({ runId: config.runId, category: config.category, units: config.unitsPerAttempt, key: `repair-attempt-${attempt}`, cap: config.cap, windowSeconds: config.windowSeconds });
      return r.state === 'exhausted' ? null : r.reservationId;
    },
    async settle(reservationId, outcome) {
      if (outcome === 'released') { await ledger.release(reservationId); return; }
      await ledger.settle(reservationId, config.measured?.(reservationId) ?? config.unitsPerAttempt);
    },
  };
}
