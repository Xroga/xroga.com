import {isIP} from 'node:net';
import {
  acquireGuestLease, releaseGuestLease, requireCurrentGuestLease,
  consumeGuestAllowanceDistributed, consumeGuestTokenBudgetDistributed,
  isGuestSessionClaimed,
} from './guestBudget.js';

function denied(): never { throw Object.assign(new Error('Guest admission or accounting is unavailable.'), {code: 'PROVIDER_RESERVATION_DENIED', status: 503}); }

/** Reuse the canonical guest counters and original lease. Full conservative
 * reservations remain consumed on failure, disconnect or uncertain usage.
 * An anonymous guest lease never grants tenant, project, tool or vault access.
 */
export async function withGuestProviderBudget<T>(
  sessionId: string, address: string, inputBound: number, outputBound: number,
  signal: AbortSignal,
  run: (guard: {consume: () => Promise<void>; complete: (usage: unknown) => Promise<void>; check: () => Promise<void>}) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
    || !isIP(address) || !Number.isSafeInteger(inputBound) || inputBound < 1
    || !Number.isSafeInteger(outputBound) || outputBound < 1 || outputBound > 3000) denied();
  const checkSignal = () => { if (signal.aborted) denied(); };
  checkSignal();
  if (await isGuestSessionClaimed(sessionId)) denied();
  checkSignal();
  if (!(await consumeGuestAllowanceDistributed(sessionId, address)).allowed) denied();
  checkSignal();
  if (!(await consumeGuestTokenBudgetDistributed(sessionId, inputBound + outputBound)).allowed) denied();
  checkSignal();
  const lease = await acquireGuestLease(sessionId);
  if (!lease) denied();
  let used = false, completed = false, active = true;
  const check = async () => {
    if (!active) denied();
    checkSignal();
    await requireCurrentGuestLease(lease);
    checkSignal();
    if (!active) denied();
  };
  try {
    await check();
    const result = await run(Object.freeze({
      check,
      consume: async () => { if (used) denied(); used = true; await check(); },
      complete: async (usage: unknown) => {
        if (!used || completed || !usage || typeof usage !== 'object') denied();
        const row = usage as Record<string, unknown>;
        const valid = (value: unknown, maximum: number): value is number =>
          typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
        if (!valid(row.prompt_tokens, inputBound) || !valid(row.completion_tokens, outputBound)
          || !Number.isSafeInteger(row.total_tokens) || row.total_tokens !== row.prompt_tokens + row.completion_tokens) denied();
        await check();
        completed = true;
      },
    }));
    if (!completed) denied();
    await check();
    return result;
  } finally {
    active = false;
    await releaseGuestLease(lease);
  }
}
