/**
 * Validates a client-supplied run ID.
 *
 * Production evidence for why this exists: three consecutive builds where the backend
 * produced 25-49 real events each while the browser received zero bytes of the SSE
 * stream. The client previously learned its own `runId` only from the first byte that
 * stream delivered — so a connection that never delivers anything left it with no ID to
 * fall back to polling with, and it could only wait forever.
 *
 * The client now generates its own ID and sends it up front, so it always has something
 * to poll for regardless of whether the stream ever produces a byte. This validates
 * that ID is genuinely a UUID before trusting it as a database primary key — never
 * because a well-formed ID from the browser is a security boundary (auth already scopes
 * every run to its owner), but because an attacker-controlled or malformed string
 * reaching `createRunDurable` as a row id is an easy way to break the write, and a typo
 * or a stale client should fail closed to a fresh server-generated ID rather than
 * silently colliding with something else.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidClientRunId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
