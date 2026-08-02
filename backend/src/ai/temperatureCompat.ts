/**
 * Temperature compatibility across builder providers.
 *
 * Production evidence: a build failed outright with
 *
 *   400 invalid temperature: only 1 is allowed for this model
 *
 * Every call site sends a hardcoded temperature — 0.2, 0.3, 0.45, and so on — and
 * some models (reasoning variants in particular) reject anything but their fixed
 * default. The request never reaches the model, so the run dies on a parameter
 * rather than on anything about the work.
 *
 * The obvious fix is a list of models that refuse custom temperature. That fix
 * rots: the list is wrong the day a provider ships a new variant or changes an
 * existing one, and it is wrong silently, in production, on a paid call.
 *
 * So this detects the refusal from the provider's own response and retries the
 * same model once with the parameter omitted. It is correct for every model
 * without knowing any of their names, and it self-heals when a provider changes
 * its mind. One extra attempt, only on a 400 that names temperature.
 */

type ErrorLike = { status?: unknown; message?: unknown; code?: unknown };

/**
 * True when the provider rejected the request *because of* the temperature
 * parameter — not for any other 400.
 *
 * Deliberately narrow. Retrying an unrelated 400 without temperature would waste
 * a call and mask the real error.
 */
export function isTemperatureRejection(error: unknown): boolean {
  const err = (error ?? {}) as ErrorLike;
  const status = typeof err.status === 'number' ? err.status : undefined;
  if (status !== 400 && status !== 422) return false;
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  if (!message.includes('temperature')) return false;
  // Covers the phrasings seen in the wild: "only 1 is allowed for this model",
  // "does not support temperature", "unsupported value", "invalid temperature".
  return /only\s*1|does not support|unsupported|invalid|not supported|must be/.test(message);
}

/**
 * Runs a provider call, retrying once without temperature if that was the reason
 * it was refused.
 *
 * `attempt` receives the temperature to use, or `undefined` meaning "omit the
 * parameter entirely" — omitting is safer than sending 1, because a model with a
 * different fixed default would reject an explicit 1 just as readily.
 */
export async function withTemperatureFallback<T>(
  requested: number | undefined,
  attempt: (temperature: number | undefined) => Promise<T>,
): Promise<T> {
  try {
    return await attempt(requested);
  } catch (error) {
    if (requested === undefined || !isTemperatureRejection(error)) throw error;
    return attempt(undefined);
  }
}
