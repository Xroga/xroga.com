/**
 * The environment a generated build is allowed to see.
 *
 * `compileValidate.runCmd` used to spawn with `env: { ...process.env, ... }`. That put
 * every Xroga secret one `process.env.SUPABASE_SERVICE_ROLE_KEY` away from any code in
 * a model-generated dependency tree or build script.
 *
 * This is an allowlist, not a denylist, and that direction is the whole point: a
 * denylist has to predict every secret name that will ever exist, and silently leaks
 * the first one somebody forgets to add. An allowlist leaks nothing by default, and a
 * new secret is safe the moment it is introduced without anyone remembering this file.
 */

/**
 * Variables a Node/npm build genuinely needs to function.
 *
 * Deliberately minimal. `PATH` is required to find `node` and `npm`; `HOME` is where
 * npm resolves its config; the rest keep a build reproducible and non-interactive.
 * Nothing here can identify or authenticate Xroga to any service.
 */
const ALLOWED_PASSTHROUGH = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'TZ',
  'TMPDIR',
  'SHELL',
  'TERM',
] as const;

/**
 * Names that must never be forwarded even if an allowlist entry above would match one
 * by accident, and — more importantly — that a caller must not be able to smuggle in
 * through the explicit `extra` parameter.
 *
 * This is defence in depth behind the allowlist, not the primary mechanism. It exists
 * because `buildSandboxEnvironment` accepts caller-supplied values, and a future caller
 * passing something derived from config should fail loudly rather than leak.
 */
const FORBIDDEN_PATTERN =
  /(SECRET|TOKEN|KEY|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|SUPABASE|GITHUB|VERCEL|OPENAI|ANTHROPIC|MOONSHOT|ZHIPU|DEEPSEEK|OPENROUTER|TAVILY|XAI|GROK|DATABASE_URL|DSN|SESSION|COOKIE|JWT|AUTH)/i;

/** Values a build sets for itself; callers may not override these. */
const ENFORCED: Record<string, string> = {
  CI: '1',
  // Lifecycle scripts stay disabled during install. This is not the security
  // boundary — the sandbox is — but it removes an obvious first-order footgun.
  npm_config_ignore_scripts: 'true',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_update_notifier: 'false',
  // Nothing in a validation build should be prompting.
  npm_config_yes: 'true',
  NO_UPDATE_NOTIFIER: '1',
  NODE_ENV: 'production',
};

export class ForbiddenSandboxVariableError extends Error {
  readonly code = 'FORBIDDEN_SANDBOX_VARIABLE' as const;
  constructor(name: string) {
    // The name only — never the value, which is the secret itself.
    super(`Refusing to pass "${name}" into a sandboxed build: it matches a credential pattern.`);
    this.name = 'ForbiddenSandboxVariableError';
  }
}

export function isForbiddenSandboxVariable(name: string): boolean {
  return FORBIDDEN_PATTERN.test(name);
}

/**
 * Whether a caller-supplied value is one of this process's own credentials.
 *
 * Compares against the values of every forbidden-named variable the control plane holds,
 * so relabelling a secret does not launder it. Short values are ignored: a credential is
 * never four characters, and comparing against them would refuse legitimate extras like
 * `production` whenever some unrelated secret happened to equal them.
 */
function valueMatchesAServerSecret(value: string, source: NodeJS.ProcessEnv): boolean {
  if (typeof value !== 'string' || value.length < 8) return false;
  for (const [name, held] of Object.entries(source)) {
    if (!held || held.length < 8) continue;
    if (!isForbiddenSandboxVariable(name)) continue;
    if (held === value) return true;
  }
  return false;
}

/**
 * Builds the complete environment for a sandboxed process.
 *
 * `source` defaults to `process.env` because that is where PATH and HOME legitimately
 * come from — but only the allowlisted names are read out of it, and each is still
 * checked against the forbidden pattern in case a deployment ever sets, say,
 * `PATH_TOKEN`.
 */
export function buildSandboxEnvironment(
  extra: Record<string, string> = {},
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const name of ALLOWED_PASSTHROUGH) {
    const value = source[name];
    if (typeof value === 'string' && value.length > 0 && !isForbiddenSandboxVariable(name)) {
      env[name] = value;
    }
  }

  for (const [name, value] of Object.entries(extra)) {
    if (isForbiddenSandboxVariable(name)) throw new ForbiddenSandboxVariableError(name);
    // Screening the name is not enough on its own. The name check assumes a leak arrives
    // labelled as what it is, and the case this file was written to guard against — "a
    // future caller passing something derived from config" — is precisely the one where it
    // does not: `{ API_BASE: process.env.SUPABASE_SERVICE_ROLE_KEY }` passes every name
    // rule and hands a build the service role. So the value is compared against what the
    // control plane actually holds, and a match is refused whatever it is called.
    if (valueMatchesAServerSecret(value, source)) throw new ForbiddenSandboxVariableError(name);
    env[name] = value;
  }

  return { ...env, ...ENFORCED };
}

/** Exposed for the regression test that proves the allowlist is an allowlist. */
export const SANDBOX_ALLOWED_PASSTHROUGH: readonly string[] = ALLOWED_PASSTHROUGH;
