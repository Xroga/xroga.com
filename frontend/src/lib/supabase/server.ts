import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicConfig } from './config';
import { authCookieOptions } from './authCookiePolicy';

export async function createClient() {
  const cookieStore = await cookies();
  const config = getSupabasePublicConfig();

  return createServerClient(
    config.url,
    config.publishableKey,
    {
      cookieOptions: authCookieOptions(config.projectRef),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component – ignore
          }
        },
      },
    }
  );
}
