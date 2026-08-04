/**
 * Structured counters for Supabase calls, so egress regressions are visible before
 * they show up as a quota restriction email.
 *
 * Records only a bounded (table, operation, outcome) label set and byte totals.
 * Never records tokens, user ids, emails, prompts or message content: the label
 * values are compile-time constants supplied by the call site, and `note` is
 * clamped to a short allowlisted-shape string.
 */

export type SupabaseOperation =
  | 'auth_verify'
  | 'select'
  | 'insert'
  | 'update'
  | 'upsert'
  | 'delete';

export type SupabaseOutcome = 'ok' | 'error' | 'skipped_cache' | 'deduplicated';

interface CounterKey {
  table: string;
  operation: SupabaseOperation;
  outcome: SupabaseOutcome;
}

const calls = new Map<string, number>();
const bytes = new Map<string, number>();

/** Bound label cardinality — a table name can never become user input. */
function safeLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.]/g, '_').slice(0, 60) || 'unknown';
}

function keyOf(key: CounterKey): string {
  return `table="${safeLabel(key.table)}",operation="${key.operation}",outcome="${key.outcome}"`;
}

export function recordSupabaseCall(key: CounterKey, responseBytes = 0): void {
  const label = keyOf(key);
  calls.set(label, (calls.get(label) ?? 0) + 1);
  if (responseBytes > 0) {
    bytes.set(label, (bytes.get(label) ?? 0) + responseBytes);
  }
}

/** Approximate serialized size of a payload, for egress accounting only. */
export function approximateBytes(payload: unknown): number {
  if (payload === null || payload === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8');
  } catch {
    return 0;
  }
}

export function getSupabaseCounterText(): string {
  const lines = [
    '# HELP xroga_supabase_calls_total Supabase calls by table, operation and outcome',
    '# TYPE xroga_supabase_calls_total counter',
    ...[...calls].map(([labels, count]) => `xroga_supabase_calls_total{${labels}} ${count}`),
    '# HELP xroga_supabase_response_bytes_total Approximate Supabase response bytes',
    '# TYPE xroga_supabase_response_bytes_total counter',
    ...[...bytes].map(([labels, total]) => `xroga_supabase_response_bytes_total{${labels}} ${total}`),
  ];
  return `${lines.join('\n')}\n`;
}

/** Test-only snapshot. Returns a plain object so assertions stay readable. */
export function snapshotSupabaseCounters(): Record<string, number> {
  return Object.fromEntries(calls);
}

/** Test-only reset so each test starts from a known baseline. */
export function resetSupabaseCounters(): void {
  calls.clear();
  bytes.clear();
}
