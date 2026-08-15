/**
 * Structured output — request, validate, repair, stop.
 *
 * The rule that shapes this module is "do not endlessly retry malformed output". A repair loop
 * without a hard bound is the most expensive failure mode an intelligence layer has: each round
 * costs a full model call, the failures correlate (a model that cannot produce your schema
 * usually cannot produce it on the fourth attempt either), and nothing in the loop notices.
 *
 * So repair is bounded, the bound is small, and exhaustion is a reported outcome rather than an
 * exception that reads like a provider fault.
 *
 * ## Why the repair prompt carries the error and not the schema again
 *
 * The model already had the schema on the first attempt. Repeating it wastes context on the
 * one thing the model demonstrably received. What it did not have is *what was wrong*, so the
 * repair turn carries the validation error and the offending output, which is the information
 * that changes the outcome.
 */

export type StructuredFailureReason =
  | 'unparseable'
  | 'schema_mismatch'
  | 'repair_exhausted'
  | 'empty';

export interface StructuredSuccess<T> {
  readonly ok: true;
  readonly value: T;
  /** How many repair rounds were needed. Zero means the first response was valid. */
  readonly repairs: number;
}

export interface StructuredFailure {
  readonly ok: false;
  readonly reason: StructuredFailureReason;
  readonly detail: string;
  readonly repairs: number;
}

export type StructuredResult<T> = StructuredSuccess<T> | StructuredFailure;

/** A validator. Returns the typed value, or a human-readable reason it does not conform. */
export type SchemaValidator<T> = (value: unknown) =>
  | { valid: true; value: T }
  | { valid: false; error: string };

export interface StructuredRequest<T> {
  readonly validate: SchemaValidator<T>;
  /** Produces one attempt. `repairHint` is absent on the first call. */
  readonly attempt: (repairHint?: string) => Promise<string>;
  /** Repair rounds after the first attempt. Defaults to 2, hard-capped at 3. */
  readonly maxRepairs?: number;
}

const DEFAULT_MAX_REPAIRS = 2;
const ABSOLUTE_MAX_REPAIRS = 3;

/**
 * Extracts JSON from a model reply.
 *
 * Models fence JSON in markdown and prepend explanations no matter how firmly they are asked
 * not to. Treating that as unparseable would spend a repair round on formatting rather than on
 * substance, so the common wrappers are stripped before parsing is called a failure.
 */
export function extractJson(text: string): unknown | undefined {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return undefined;

  const candidates: string[] = [];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(trimmed);

  // Last resort: the outermost brace or bracket span, for replies with prose around the JSON.
  const firstBrace = trimmed.search(/[[{]/);
  const lastBrace = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function generateStructured<T>(
  request: StructuredRequest<T>,
): Promise<StructuredResult<T>> {
  const maxRepairs = Math.min(
    Math.max(0, request.maxRepairs ?? DEFAULT_MAX_REPAIRS),
    ABSOLUTE_MAX_REPAIRS,
  );

  let repairs = 0;
  let lastReason: StructuredFailureReason = 'unparseable';
  let lastDetail = 'no attempt was made';
  let hint: string | undefined;

  // `<=` because the first pass is not a repair: `maxRepairs: 2` means one attempt plus two.
  for (let round = 0; round <= maxRepairs; round += 1) {
    const raw = await request.attempt(hint);

    if (!raw?.trim()) {
      lastReason = 'empty';
      lastDetail = 'the model returned no content';
      hint = 'Your previous reply was empty. Return only the JSON object.';
      repairs = round;
      continue;
    }

    const parsed = extractJson(raw);
    if (parsed === undefined) {
      lastReason = 'unparseable';
      lastDetail = 'the reply did not contain parseable JSON';
      // The offending output is included, bounded: enough to see the shape of the mistake
      // without spending the next request's context re-reading the last one in full.
      hint =
        'Your previous reply was not valid JSON. Return only a JSON value, with no prose and ' +
        `no code fence. Your previous reply began: ${raw.slice(0, 300)}`;
      repairs = round;
      continue;
    }

    const verdict = request.validate(parsed);
    if (verdict.valid) {
      return { ok: true, value: verdict.value, repairs: round };
    }

    lastReason = 'schema_mismatch';
    lastDetail = verdict.error;
    hint =
      'Your previous reply was valid JSON but did not match the required shape. ' +
      `Fix exactly this and return only the corrected JSON: ${verdict.error}`;
    repairs = round;
  }

  return {
    ok: false,
    // A run that used its whole budget is reported as exhausted, which is actionable, rather
    // than as whatever the last round happened to fail on, which is not.
    reason: repairs >= maxRepairs && maxRepairs > 0 ? 'repair_exhausted' : lastReason,
    detail: lastDetail,
    repairs,
  };
}

/** A small validator builder for the common "object with required keys" case. */
export function objectValidator<T extends Record<string, unknown>>(
  requiredKeys: readonly string[],
): SchemaValidator<T> {
  return (value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, error: `expected a JSON object, received ${describe(value)}` };
    }
    const missing = requiredKeys.filter((key) => !(key in (value as object)));
    if (missing.length) {
      return { valid: false, error: `missing required field(s): ${missing.join(', ')}` };
    }
    return { valid: true, value: value as T };
  };
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}
