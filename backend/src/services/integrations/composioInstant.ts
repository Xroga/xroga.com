import { createHash } from 'node:crypto';

import { releaseFixedCostBudget, reserveFixedCostBudget, settleFixedCostBudget } from '../../ai/fixedCostBudget.js';
import type { ProviderReservation } from '../../ai/providerBudget.js';
import { canonicalAuthorityValue, preparedActionDigest } from '../../security/authority/digest.js';
import { assertAuthorityPermit, consumeAuthorityPermit } from '../../security/authority/enforce.js';
import type { AuthorityDispatchBinding, AuthorityPermit } from '../../security/authority/types.js';
import {
  ComposioClientError,
  assertComposioSession,
  composioRequest,
  createInstantComposioSession,
  interpretComposioExecuteResponse,
  type ComposioExecuteResponse,
} from './composioClient.js';
import { readComposioCapabilityFlags } from './composioPolicy.js';

/**
 * Composio "Instant" tools run on Composio's provider accounts and bill Xroga's Composio balance per call
 * (https://docs.composio.dev/docs/instant-tools.md). Composio documents NO built-in dollar cap and its
 * balance check is asynchronous, so a limit that Xroga does not enforce itself does not exist.
 *
 * Xroga's enforcement, all of it before the call:
 *   1. Off unless XROGA_COMPOSIO_INSTANT=enabled AND a hard per-call ceiling is configured.
 *   2. Only tools on an operator allowlist (XROGA_COMPOSIO_INSTANT_ALLOWLIST), never discovery output.
 *   3. A current, single-use authority permit bound to this exact tool and arguments.
 *   4. A reservation of the per-call ceiling in the existing provider budget ledger, which also bounds the
 *      user's unlocked entitlement. No reservation, no call. Settled to the exact reported charge.
 *   5. A charge above the ceiling, or no reported charge, leaves the full reservation held for
 *      reconciliation, and trips a process breaker so later Instant calls are refused.
 * After a timeout the provider may have completed billable work, so the reservation is held, not released.
 */

export const INSTANT_LEDGER_ROUTE = 'composio:instant';
const MICRO = 1_000_000n;
/** No configuration can raise the per-call ceiling above this. */
export const INSTANT_ABSOLUTE_MAX_CALL_MICRO_USD = 5_000_000;

export interface InstantLimits {
  readonly maxCallMicroUsd: number;
  readonly allowlist: Readonly<Record<string, readonly string[]>>;
}

/** Converts an exact USD decimal string to micro-USD, rounding UP so the reservation is never optimistic. */
export function usdToMicroUsdCeil(value: string): number {
  const match = /^(\d{1,9})(?:\.(\d{1,12}))?$/.exec(value.trim());
  if (!match) throw new ComposioClientError('Instant amount is not an exact USD decimal.', { status: 502, code: 'COMPOSIO_INSTANT_AMOUNT_INVALID' });
  const whole = BigInt(match[1]) * MICRO;
  const fraction = (match[2] ?? '').padEnd(12, '0');
  const micros = BigInt(fraction.slice(0, 6));
  const remainder = BigInt(fraction.slice(6)) > 0n ? 1n : 0n;
  const total = whole + micros + remainder;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new ComposioClientError('Instant amount is out of range.', { status: 502, code: 'COMPOSIO_INSTANT_AMOUNT_INVALID' });
  return Number(total);
}

export function readInstantLimits(env: Readonly<Record<string, string | undefined>> = process.env): InstantLimits {
  const raw = env.XROGA_COMPOSIO_INSTANT_MAX_CALL_USD?.trim();
  if (!raw) throw new ComposioClientError('Instant is not available: no hard per-call budget is configured.', { status: 503, code: 'COMPOSIO_INSTANT_BUDGET_UNCONFIGURED' });
  const maxCallMicroUsd = usdToMicroUsdCeil(raw);
  if (maxCallMicroUsd <= 0 || maxCallMicroUsd > INSTANT_ABSOLUTE_MAX_CALL_MICRO_USD) {
    throw new ComposioClientError('The configured Instant per-call budget is outside the allowed range.', { status: 503, code: 'COMPOSIO_INSTANT_BUDGET_UNCONFIGURED' });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.XROGA_COMPOSIO_INSTANT_ALLOWLIST ?? '{}');
  } catch {
    throw new ComposioClientError('The Instant allowlist is not valid JSON.', { status: 503, code: 'COMPOSIO_INSTANT_ALLOWLIST_INVALID' });
  }
  const allowlist: Record<string, string[]> = {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ComposioClientError('The Instant allowlist must be an object.', { status: 503, code: 'COMPOSIO_INSTANT_ALLOWLIST_INVALID' });
  for (const [toolkit, slugs] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(toolkit) || !Array.isArray(slugs) || slugs.length === 0 || !slugs.every((slug) => typeof slug === 'string' && /^[A-Z0-9][A-Z0-9_]{2,199}$/.test(slug))) {
      throw new ComposioClientError('The Instant allowlist is malformed.', { status: 503, code: 'COMPOSIO_INSTANT_ALLOWLIST_INVALID' });
    }
    allowlist[toolkit] = slugs as string[];
  }
  if (Object.keys(allowlist).length === 0) throw new ComposioClientError('Instant is not available: no tool is on the allowlist.', { status: 503, code: 'COMPOSIO_INSTANT_ALLOWLIST_INVALID' });
  return { maxCallMicroUsd, allowlist };
}

let breakerOpen = false;
/** Test seam and operator reset. The breaker is per process on purpose: a restart is a deliberate reset. */
export function resetInstantBreakerForTests(): void {
  breakerOpen = false;
}
export function instantBreakerOpen(): boolean {
  return breakerOpen;
}


interface InstantCharge {
  readonly amount: string;
  readonly currency: string;
  readonly charged_by?: string;
}

function readCharge(raw: unknown): InstantCharge | null {
  const charge = (raw as { instant_charge?: unknown } | null)?.instant_charge as Record<string, unknown> | undefined;
  if (!charge || typeof charge.amount !== 'string' || typeof charge.currency !== 'string') return null;
  return { amount: charge.amount, currency: charge.currency, ...(typeof charge.charged_by === 'string' ? { charged_by: charge.charged_by } : {}) };
}

export interface InstantDeps {
  readonly reserve: typeof reserveFixedCostBudget;
  readonly settle: typeof settleFixedCostBudget;
  readonly release: typeof releaseFixedCostBudget;
  readonly createSession: typeof createInstantComposioSession;
  readonly assertSession: typeof assertComposioSession;
  readonly request: typeof composioRequest;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

const defaults: InstantDeps = {
  reserve: reserveFixedCostBudget,
  settle: settleFixedCostBudget,
  release: releaseFixedCostBudget,
  createSession: createInstantComposioSession,
  assertSession: assertComposioSession,
  request: composioRequest,
};

export interface InstantExecuteResult extends ComposioExecuteResponse {
  readonly chargedMicroUsd: number;
  readonly reservedMicroUsd: number;
  readonly chargeReported: boolean;
}

export function instantBinding(userId: string, toolkit: string, toolSlug: string, args: Record<string, unknown>, planDigest: string, connectedAccountId = 'instant_account'): AuthorityDispatchBinding {
  return { userId, provider: `composio_instant:${toolkit}`, connectedAccountId, operation: toolSlug, targetDigest: preparedActionDigest({ toolkit, toolSlug, arguments: canonicalAuthorityValue(args) }), planDigest };
}

export async function executeComposioInstantTool(
  userId: string,
  input: {
    toolkit: string;
    toolSlug: string;
    arguments: Record<string, unknown>;
    authorityPermit: AuthorityPermit;
    planDigest: string;
    /** Stable per logical call, so a retry after a crash cannot reserve (or spend) twice. */
    idempotencyKey: string;
  },
  deps: Partial<InstantDeps> = {},
): Promise<InstantExecuteResult> {
  const d = { ...defaults, ...deps };
  const flags = readComposioCapabilityFlags(d.env ?? process.env);
  if (!flags.instant) throw new ComposioClientError('Instant (paid) execution is not enabled.', { status: 403, code: 'COMPOSIO_INSTANT_DISABLED' });
  if (breakerOpen) throw new ComposioClientError('Instant execution is paused after a charge exceeded its ceiling. An operator must review it.', { status: 503, code: 'COMPOSIO_INSTANT_BREAKER_OPEN' });
  const limits = readInstantLimits(d.env ?? process.env);

  const toolkit = input.toolkit.trim().toLowerCase();
  const toolSlug = input.toolSlug.trim();
  if (!limits.allowlist[toolkit]?.includes(toolSlug)) {
    throw new ComposioClientError('This tool is not on the Instant allowlist.', { status: 403, code: 'COMPOSIO_INSTANT_TOOL_NOT_ALLOWED' });
  }
  if (!/^[A-Za-z0-9_.:-]{16,128}$/.test(input.idempotencyKey)) throw new ComposioClientError('A stable idempotency key is required.', { status: 400, code: 'COMPOSIO_INSTANT_IDEMPOTENCY_REQUIRED' });

  const args = canonicalAuthorityValue(input.arguments) as Record<string, unknown>;
  const binding = instantBinding(userId, toolkit, toolSlug, args, input.planDigest);
  assertAuthorityPermit(input.authorityPermit, binding);

  // The session is created for exactly this tool, then read back, before any money is reserved.
  const session = await d.createSession(userId, { toolkits: [toolkit], tools: { [toolkit]: [toolSlug] } });
  await d.assertSession(userId, session.session_id, 'instant');

  const ledgerKey = createHash('sha256').update(`${userId}:${input.idempotencyKey}`).digest('hex').slice(0, 32);
  const uuid = `${ledgerKey.slice(0, 8)}-${ledgerKey.slice(8, 12)}-4${ledgerKey.slice(13, 16)}-8${ledgerKey.slice(17, 20)}-${ledgerKey.slice(20, 32)}`;
  const reservation: ProviderReservation = await d.reserve({ userId, route: INSTANT_LEDGER_ROUTE, reservationMicroUsd: limits.maxCallMicroUsd, idempotencyKey: uuid });

  // From here the permit is spent and money is reserved. Anything that fails BEFORE the request is sent releases both.
  let sent = false;
  let settled = false;
  try {
    await consumeAuthorityPermit(input.authorityPermit, binding);
    sent = true;
    const raw = await d.request<ComposioExecuteResponse & { instant_charge?: unknown }>(
      `/tool_router/session/${encodeURIComponent(session.session_id)}/execute`,
      {
        method: 'POST',
        body: { tool_slug: toolSlug, arguments: args, account: 'instant_account', enable_auto_workbench_offload: false },
        timeoutMs: 30_000,
      },
    );
    const charge = readCharge(raw);
    // A blocked or incomplete result may still have been billed. Interpret AFTER reading the charge.
    let outcome: ComposioExecuteResponse | null = null;
    let interpretError: unknown = null;
    try {
      outcome = interpretComposioExecuteResponse(raw);
    } catch (error) {
      interpretError = error;
    }

    const chargeMicro = charge && charge.currency === 'USD' ? usdToMicroUsdCeil(charge.amount) : null;
    if (chargeMicro === null || chargeMicro > reservation.reservedMicroUsd) {
      // Unreported, wrong currency, or above the ceiling: hold the whole reservation and stop further Instant calls.
      breakerOpen = true;
      await d.release({ userId, reservation, pendingReconciliation: true, category: 'charge_anomaly' }).catch(() => undefined);
      throw new ComposioClientError(
        chargeMicro === null ? 'Instant did not report a charge. The reservation is held for reconciliation and Instant is paused.' : 'An Instant charge exceeded its ceiling. The reservation is held for reconciliation and Instant is paused.',
        { status: 502, code: chargeMicro === null ? 'COMPOSIO_INSTANT_CHARGE_UNREPORTED' : 'COMPOSIO_INSTANT_CHARGE_EXCEEDED_CEILING' },
      );
    }
    await d.settle({ userId, route: INSTANT_LEDGER_ROUTE, reservation, actualMicroUsd: chargeMicro, providerRequestId: typeof raw?.log_id === 'string' ? raw.log_id : undefined });
    settled = true;
    if (interpretError) throw interpretError;
    return { ...(outcome as ComposioExecuteResponse), chargedMicroUsd: chargeMicro, reservedMicroUsd: reservation.reservedMicroUsd, chargeReported: true };
  } catch (error) {
    if (settled) throw error;
    if (error instanceof ComposioClientError && error.code.startsWith('COMPOSIO_INSTANT_CHARGE_')) throw error;
    if (!sent) {
      // Nothing left Xroga: release the reservation.
      await d.release({ userId, reservation, pendingReconciliation: false, category: 'definitive_refusal' }).catch(() => undefined);
    } else if (error instanceof ComposioClientError && ['COMPOSIO_INSTANT_BALANCE_EXHAUSTED'].includes(error.code)) {
      // Composio refused to fund the call (HTTP 402): nothing was billed.
      await d.release({ userId, reservation, pendingReconciliation: false, category: 'definitive_refusal' }).catch(() => undefined);
    } else {
      // The request left and the outcome is unknown or the call was blocked after running. The provider may have billed.
      // Hold the reservation for reconciliation; never release it on a guess.
      await d.release({ userId, reservation, pendingReconciliation: true, category: 'unknown_outcome' }).catch(() => undefined);
    }
    throw error;
  }
}
