/** Response isolation only. Outbound destination/DNS policy remains Command010. */
export const browserProxyHeaders = Object.freeze({
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "sandbox allow-scripts allow-forms allow-popups; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self';",
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
});

export const imageProxyHeaders = Object.freeze({
  'Content-Security-Policy': "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});

export function escapeProxyHtml(value: string): string {
  const entities:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  return value.replace(/[&<>"']/g, character => entities[character]!);
}
