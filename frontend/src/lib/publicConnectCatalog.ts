import { API_URL } from '@/lib/api';
import type { XrogaConnectCatalogToolkit } from '@/lib/xrogaConnect';

export type PublicCatalogToolkit = Pick<XrogaConnectCatalogToolkit,
  'slug' | 'name' | 'description' | 'logo' | 'categories' | 'authSchemes' |
  'managedAuthSchemes' | 'noAuth' | 'toolsCount' | 'triggersCount'> & {
    xrogaGroup?: string;
  };

export type PublicCatalogPage = {
  ok: boolean;
  items: PublicCatalogToolkit[];
  totalItems: number;
  nextCursor?: string;
};

/** Public read-only projection. No credentials, OAuth exchange or account status. */
export async function publicConnectCatalogPage(cursor?: string): Promise<PublicCatalogPage> {
  const params = new URLSearchParams({ limit: '250', sortBy: 'usage' });
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(`${API_URL}/api/public/integrations/catalog?${params}`, {
    // This endpoint returns shared catalog metadata with a short CDN TTL;
    // avoid forcing a provider request for every anonymous page view.
    method: 'GET', credentials: 'omit', cache: 'default',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error('PUBLIC_PLUGIN_CATALOG_UNAVAILABLE');
  const data = await response.json() as PublicCatalogPage;
  if (!data.ok || !Array.isArray(data.items) || !Number.isSafeInteger(data.totalItems) ||
    data.totalItems < 0) throw new Error('INVALID_PUBLIC_PLUGIN_CATALOG');
  return data;
}
