import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig } from './config';

let browserClient: SupabaseClient | null = null;

export function createClient() {
  // One browser client owns the auth refresh lock and session listeners. Creating
  // a client for every API request can strand concurrent getSession calls during
  // rapid navigation, leaving authenticated mutations permanently pending.
  if (browserClient) return browserClient;
  const config = getSupabasePublicConfig();
  browserClient = createBrowserClient(config.url, config.publishableKey);
  return browserClient;
}
