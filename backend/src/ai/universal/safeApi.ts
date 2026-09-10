import { isIP } from 'node:net';

export interface ApiAuthority {
  readonly allowedOrigins: ReadonlySet<string>;
  readonly allowedMethods: ReadonlySet<string>;
}

function privateIp(hostname: string): boolean {
  if (!isIP(hostname)) return false;
  return /^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^::1$|^fc|^fd|^fe80/i.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

/** Validates generic HTTP/OpenAPI operations independently of any API brand or task name. */
export function assertSafeApiRequest(input: { url: string; method: string }, authority: ApiAuthority): URL {
  const url = new URL(input.url);
  const method = input.method.trim().toUpperCase();
  if (url.protocol !== 'https:') throw new Error('API requests require HTTPS.');
  if (url.username || url.password) throw new Error('Credentials are not allowed in API URLs.');
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || privateIp(url.hostname)) {
    throw new Error('Private network targets are not allowed.');
  }
  if (!authority.allowedOrigins.has(url.origin)) throw new Error('API origin is not authorized.');
  if (!authority.allowedMethods.has(method)) throw new Error('API method is not authorized.');
  return url;
}
