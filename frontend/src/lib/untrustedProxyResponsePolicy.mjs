/** Shared by Next's hosting headers and the actual route responses. */
export const browserProxyHeaders = Object.freeze({
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "sandbox allow-scripts allow-forms allow-popups; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self';",
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
});

export const imageProxyHeaders = Object.freeze({
  'Content-Security-Policy': "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});
