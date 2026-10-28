import { ComposioClientError } from './composioClient.js';

/** Select the OAuth return origin without allowing a caller-chosen open redirect. */
export function composioCallbackUrl(input: {
  toolkit: string;
  requestOrigin?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = input.env ?? process.env;
  const configured = [env.FRONTEND_URL ?? 'https://xroga.com', ...(env.XROGA_COMPOSIO_CALLBACK_ORIGINS ?? '').split(',')]
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = new Set(configured.map((value) => {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new ComposioClientError('An unsafe Composio callback origin is configured.', { status: 500, code: 'COMPOSIO_CALLBACK_CONFIG_INVALID' });
    }
    if (url.pathname !== '/' || url.search || url.hash) throw new ComposioClientError('Composio callback origins must contain only a scheme and host.', { status: 500, code: 'COMPOSIO_CALLBACK_CONFIG_INVALID' });
    return url.origin;
  }));
  const fallback = new URL(configured[0]!).origin;
  let origin = fallback;
  if (input.requestOrigin) {
    let requested: URL;
    try {
      requested = new URL(input.requestOrigin);
    } catch {
      throw new ComposioClientError('Invalid Xroga frontend origin for Composio OAuth.', { status: 403, code: 'COMPOSIO_CALLBACK_ORIGIN_FORBIDDEN' });
    }
    if (requested.origin !== input.requestOrigin || !allowed.has(requested.origin)) {
      throw new ComposioClientError('This Xroga frontend is not authorized as a Composio OAuth callback origin.', { status: 403, code: 'COMPOSIO_CALLBACK_ORIGIN_FORBIDDEN' });
    }
    origin = requested.origin;
  }
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(input.toolkit)) throw new ComposioClientError('Invalid toolkit for OAuth callback.', { status: 400, code: 'INVALID_COMPOSIO_TOOLKIT' });
  return `${origin}/dashboard/integrations/connect/callback?toolkit=${encodeURIComponent(input.toolkit.toLowerCase())}`;
}
