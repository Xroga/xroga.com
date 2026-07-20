/** Integrations that show a real Connect button (others = coming soon / blurred). */
export const CONNECTABLE_INTEGRATION_IDS = new Set([
  'github',
  'vercel',
  'supabase',
  'brevo',
  'cloudflare',
  'cloudflare_r2',
  'cloudflare_workers_dns',
  'lemon_squeezy',
]);

export function isConnectableIntegration(id: string): boolean {
  return CONNECTABLE_INTEGRATION_IDS.has(id);
}
