/**
 * Credential-safe logging (INFRA-005).
 *
 * Operators read logs, logs are shipped to third parties, and an error object can carry the very thing that failed: a connection string, a
 * bearer token in a request, a signed URL. Rather than trust every call site, console output is redacted at the last moment:
 *
 *  - EXACT VALUES: the value of every environment variable whose name looks like a secret (and is long enough not to be a flag) is removed
 *    wherever it appears, in any form of message. This catches the secrets this process actually holds, whatever shape they have.
 *  - KNOWN SHAPES: private key blocks, GitHub/OpenAI/AWS/Slack/Vercel/Supabase tokens, JWTs, bearer and basic credentials, URL user info,
 *    signed-URL and token query parameters, cookie headers, and `password: value` / `"token":"value"` style fields.
 *
 * It formats first (`util.format`, so objects and errors are included) and then redacts the final text, so nothing escapes through an
 * object property. If redaction itself fails, a fixed notice is logged instead of the raw text: failing closed.
 */
import { format } from 'node:util';

const SECRET_ENV_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|AUTH|SESSION|DATABASE_URL|DB_URL|DSN|PRIVATE)/i;
/** values that merely name a mode, not a credential */
const NOT_SECRET_VALUE = /^(true|false|yes|no|on|off|enabled|disabled|production|development|staging|preview|test|legacy|dual|r2|none|\d{1,6})$/i;
const MIN_SECRET_LENGTH = 12;

const REPLACEMENT = '[redacted]';

const SHAPES: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, REPLACEMENT],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, REPLACEMENT],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, REPLACEMENT],
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g, REPLACEMENT],
  [/\bAKIA[0-9A-Z]{16}\b/g, REPLACEMENT],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, REPLACEMENT],
  [/\bsbp_[0-9a-f]{30,}\b/g, REPLACEMENT],
  [/\bvercel_[A-Za-z0-9_]{20,}\b/gi, REPLACEMENT],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, REPLACEMENT],
  // "Authorization: Bearer abc", "Bearer abc", "Basic dXNlcjpwdw=="
  [/\b(authorization\s*[:=]\s*)?(bearer|basic)\s+[A-Za-z0-9._~+\/=-]{8,}/gi, `$1$2 ${REPLACEMENT}`],
  // scheme://user:password@host
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:\/@]*):[^\s@\/]+@/gi, `$1:${REPLACEMENT}@`],
  // signed and token-bearing query parameters
  [/([?&](?:access_token|refresh_token|id_token|token|api[_-]?key|apikey|key|password|passwd|secret|client_secret|signature|sig|code|x-amz-signature|x-amz-credential|x-amz-security-token)=)[^&\s"']+/gi, `$1${REPLACEMENT}`],
  // cookie headers
  [/\b((?:set-)?cookie\s*[:=]\s*)[^\r\n]+/gi, `$1${REPLACEMENT}`],
  // password: value, "token":"value", api_key=value, 'authorization': 'value'
  [/(["']?\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|authorization|token)\b["']?\s*[:=]\s*)(["'])?(?!(?:true|false|null|undefined|none)\b)[^\s,"'}\]]{4,}\2?/gi, `$1${REPLACEMENT}`],
];

/** The set of secret values this process currently holds, longest first so a value that contains another is removed whole. */
export function secretValues(env: NodeJS.ProcessEnv): string[] {
  const out = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.length < MIN_SECRET_LENGTH || !SECRET_ENV_NAME.test(name) || NOT_SECRET_VALUE.test(value.trim())) continue;
    out.add(value);
    // the secret may appear URL-encoded (a password inside a connection string)
    const enc = encodeURIComponent(value);
    if (enc !== value) out.add(enc);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

export function redactText(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const secret of secretValues(env)) if (out.includes(secret)) out = out.split(secret).join(REPLACEMENT);
  for (const [re, to] of SHAPES) out = out.replace(re, to);
  return out;
}

type LogMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';
const METHODS: LogMethod[] = ['log', 'info', 'warn', 'error', 'debug'];

/** Replaces console methods with redacting versions. Returns a function that restores the originals. Idempotent. */
export function installCredentialSafeConsole(target: Pick<Console, LogMethod> = console, env: NodeJS.ProcessEnv = process.env): () => void {
  const marker = Symbol.for('xroga.safeConsole');
  const t = target as unknown as Record<string | symbol, unknown>;
  if (t[marker]) return () => undefined;
  const originals = new Map<LogMethod, (...args: unknown[]) => void>();
  for (const m of METHODS) {
    const original = target[m].bind(target) as (...args: unknown[]) => void;
    originals.set(m, original);
    target[m] = ((...args: unknown[]) => {
      let line: string;
      try { line = redactText(format(...args), env); } catch { line = '[log line withheld: redaction failed]'; }
      original(line);
    }) as Console[LogMethod];
  }
  t[marker] = true;
  return () => {
    for (const m of METHODS) target[m] = originals.get(m) as Console[LogMethod];
    delete t[marker];
  };
}
