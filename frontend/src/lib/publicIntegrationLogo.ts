/**
 * Public integration brand artwork. Prefer SVGs that actually exist in Xroga's
 * repository. Then use the provider's original logo URL, and finally Xroga's
 * explicit integration logo table. Never construct guessed brand logos.
 */
import { getIntegrationLogo } from '@/lib/integrationLogos';

export const LOCAL_PUBLIC_INTEGRATION_LOGOS: Readonly<Record<string, string>> = {
  anthropic: '/brand/logos/anthropic.svg',
  cursor: '/brand/logos/cursor.svg',
  github: '/brand/logos/github.svg',
  gitlab: '/brand/logos/gitlab.svg',
  openai: '/brand/logos/openai.svg',
  replit: '/brand/logos/replit.svg',
  supabase: '/brand/logos/supabase.svg',
  vercel: '/brand/logos/vercel.svg',
};

const validProviderLogo = (candidate?: string): string | undefined => {
  if (!candidate) return;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href : undefined;
  } catch { return; }
};

export function getPublicIntegrationLogo(id: string, providerLogo?: string): string | undefined {
  const key = id.trim().toLowerCase();
  return LOCAL_PUBLIC_INTEGRATION_LOGOS[key] ||
    validProviderLogo(providerLogo) ||
    getIntegrationLogo(key);
}
