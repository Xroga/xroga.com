import { BuilderError } from '../types.js';

/**
 * Environment variables a generated app may receive on a hosting provider.
 *
 * Only the public Supabase URL and publishable key are ever allowed for the app's database
 * connection. Anything that looks privileged is refused before it can be sent anywhere, no matter
 * which code path produced it: a name that suggests a secret, a service-role or secret key value,
 * or a database password.
 */

export const PUBLIC_SUPABASE_ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;

const PRIVILEGED_NAME = /(service[_-]?role|service[_-]?key|secret|private[_-]?key|db[_-]?password|database[_-]?(url|password)|jwt[_-]?secret|access[_-]?token|management)/i;
const CLIENT_PREFIX = /^(NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_|EXPO_PUBLIC_)/;

function jwtRole(value: string): string | null {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: unknown };
    return typeof claims.role === 'string' ? claims.role : null;
  } catch {
    return null;
  }
}

export function looksPrivilegedValue(value: string): boolean {
  return value.startsWith('sb_secret_') || jwtRole(value) === 'service_role' || /^postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/i.test(value);
}

export function assertNoPrivilegedEnv(env: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(env)) {
    if (!/^[A-Z][A-Z0-9_]{0,99}$/.test(name)) throw new BuilderError('invalid_input', `Invalid environment variable name: ${name.slice(0, 40)}`);
    if (looksPrivilegedValue(value)) throw new BuilderError('invalid_input', `Refusing to send ${name}: its value is a privileged credential.`);
    if (PRIVILEGED_NAME.test(name)) throw new BuilderError('invalid_input', `Refusing to send ${name}: its name indicates a secret.`);
    if (CLIENT_PREFIX.test(name) && PRIVILEGED_NAME.test(name.replace(CLIENT_PREFIX, ''))) throw new BuilderError('invalid_input', `Refusing ${name}: client-visible variables must never hold secrets.`);
  }
}

/** The only variables the app's database connection needs. */
export function publicSupabaseEnv(config: { url: string; publishableKey: string }): Record<string, string> {
  const env = { NEXT_PUBLIC_SUPABASE_URL: config.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: config.publishableKey };
  assertNoPrivilegedEnv(env);
  return env;
}
