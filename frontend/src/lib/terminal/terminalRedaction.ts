/**
 * Second-layer secret redaction for terminal rows.
 *
 * This is deliberately NOT the only redaction. The backend already scrubs before
 * anything is written to the stream (`redactSecrets` in
 * `backend/src/lib/truthfulExecution.ts`), and that server-side pass remains the
 * primary control — a client-only guard would be defeated by anyone reading the
 * raw SSE response in devtools, so it could never be relied on alone.
 *
 * This pass exists because the terminal renders text from many payload fields and
 * a future backend change could add a field that bypasses the server scrub. It is
 * a backstop against that regression, not a substitute for the real boundary.
 *
 * The pattern set is intentionally wider than the backend's: false positives cost
 * a masked string in a log the user can re-run, while a false negative leaks a
 * live credential. When those trade off, mask.
 */

const PATTERNS: readonly RegExp[] = [
  // Provider key formats, matched on their own distinctive prefixes.
  /\bgh[opsu]_[A-Za-z0-9_]{16,}/gi,
  /\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/gi,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/gi,
  /\bAKIA[0-9A-Z]{12,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  // Supabase/JWT triple-segment tokens. The `eyJ` prefix is base64 of `{"` and is
  // distinctive enough on its own that a low per-segment floor is safe.
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g,
  /**
   * Named assignments: KEY=value, "token": "value", Authorization: Bearer x.
   *
   * The sensitive word is matched as an identifier *component* rather than a
   * standalone word, because the real names in this project are compounds:
   * SUPABASE_SERVICE_ROLE_KEY, GITHUB_ACCESS_TOKEN, VERCEL_API_TOKEN. A `\bkey\b`
   * pattern misses all of them, since `_` is a word character — so the most
   * sensitive value in the repo would have passed straight through.
   *
   * The leading prefix is optional (`*`, not a required character): requiring one
   * meant a name that *begins* with the sensitive word — `Authorization:`,
   * `cookie:`, `token=` — could never match, since the mandatory character
   * consumed the very letter the alternation needed.
   */
  /**
   * `[` is excluded from the value characters so an already-masked value is not
   * matched a second time. Without it, `TOKEN=ghp_…` is masked by the provider
   * pattern first, and this pattern then re-masks the `[redacted` inside the
   * result — emitting `TOKEN=[redacted]]`. Excluding `[` also makes redaction
   * idempotent, which the tests assert.
   */
  /\b[A-Za-z0-9_-]*(?:key|token|secret|password|passwd|credential|auth|cookie|session|dsn)[A-Za-z0-9_-]*\s*(?:[:=]|["']\s*:\s*)\s*["']?[^\s,;"'}\])[]{6,}["']?/gi,
  // Bare header/scheme forms that carry no identifier before the value.
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{10,}/gi,
  // Postgres/Mongo/Redis URIs with inline credentials.
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@]+@[^\s]+/gi,
  // PEM blocks.
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
];

export const REDACTION_MASK = '[redacted]';

/**
 * Provider and upstream model identities are an internal routing detail. Public
 * terminal text always presents the single Xroga Black Hole identity instead.
 * This is intentionally separate from credential redaction: names are not
 * secrets, but exposing them would make the public product contract depend on
 * whichever route happened to serve one request.
 */
const INTERNAL_MODEL_NAMES: readonly RegExp[] = [
  /\b(?:kimi(?:\s+k?\d+(?:\.\d+)?)?|moonshot|deepseek(?:[-\s](?:v?\d+(?:\.\d+)*|r\d+|coder))?|gemini(?:[-\s](?:\d+(?:\.\d+)*|pro|flash)(?:[-\s][a-z0-9.]+)?)?|glm(?:[-\s]\d+(?:\.\d+)*)?|claude(?:[-\s](?:\d+(?:\.\d+)*|opus|sonnet|haiku)(?:[-\s][a-z0-9.]+)?)?|gpt(?:[-\s]\d+(?:\.\d+)*(?:[-\s][a-z0-9.]+)?)?|openai|anthropic|openrouter|groq)\b/gi,
];

export function neutralizeProviderIdentity(value: string): string {
  if (!value) return value;
  return INTERNAL_MODEL_NAMES.reduce(
    (text, pattern) => text.replace(pattern, 'Black Hole ∞'),
    value,
  );
}

/**
 * Masks credential-shaped substrings. Preserves the surrounding text so the row
 * still reads as a sentence — replacing the whole line would hide the operation
 * that produced it, which is the information the terminal exists to show.
 */
export function redactTerminalText(value: string): string {
  if (!value) return value;
  let out = value;
  for (const pattern of PATTERNS) {
    // Each pattern gets a fresh lastIndex; the /g flag makes these stateful.
    pattern.lastIndex = 0;
    out = out.replace(pattern, (match) => {
      // Keep the key name visible for assignment-shaped matches so the row still
      // says which credential was involved, without revealing the value.
      const named = /^([A-Za-z_][A-Za-z0-9_-]*)\s*[:=]/.exec(match);
      return named ? `${named[1]}=${REDACTION_MASK}` : REDACTION_MASK;
    });
  }
  return neutralizeProviderIdentity(out);
}

/** True when redaction would change the input. Used by tests and assertions. */
export function containsSecret(value: string): boolean {
  return redactTerminalText(value) !== value;
}
