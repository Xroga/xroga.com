/**
 * An intentionally narrow, anonymous, read-only projection of the provider
 * metadata catalog. No connection state, identity, OAuth config, token,
 * secret, custom MCP server, or user-specific data is exposed.
 */
import type { XrogaConnectCatalogToolkit } from './composioClient.js';

export type PublicCatalogItem = {
  slug: string;
  name: string;
  description?: string;
  logo?: string;
  xrogaGroup?: string;
  categories: Array<{ id: string; name: string }>;
  toolsCount: number;
  triggersCount: number;
  authSchemes: string[];
  managedAuthSchemes: string[];
  noAuth: boolean;
};

const slugPattern = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const safeText = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max) : '';

export function publicCatalogLogoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 1024) return;
  try {
    const url = new URL(value);
    // Never emit provider-supplied javascript:, data:, HTTP, embedded credentials
    // or private-network URLs into a public visitor's browser.
    if (url.protocol !== 'https:' || url.username || url.password) return;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
      host.includes(':') || !host.includes('.')) return;
    return url.href;
  } catch { return; }
}

export function publicCatalogProjection(items: readonly XrogaConnectCatalogToolkit[]): PublicCatalogItem[] {
  const seen = new Set<string>();
  const result: PublicCatalogItem[] = [];
  for (const item of items) {
    const slug = safeText(item.slug, 80).toLowerCase();
    // Custom MCP registrations are always private, including if the upstream
    // provider unexpectedly returns them on a global metadata endpoint.
    if (!slugPattern.test(slug) || slug.startsWith('custom_') || seen.has(slug) || item.deprecated) continue;
    const name = safeText(item.name, 100);
    if (!name) continue;
    seen.add(slug);
    const description = safeText(item.description, 420);
    const logo = publicCatalogLogoUrl(item.logo);
    result.push({
      slug, name,
      ...(description ? { description } : {}),
      ...(logo ? { logo } : {}),
      ...(item.xrogaGroup ? { xrogaGroup: safeText(item.xrogaGroup, 80) } : {}),
      categories: (item.categories ?? []).slice(0, 8).map(c => ({
        id: safeText(c.id, 100),
        name: safeText(c.name, 100),
      })).filter(c => c.id && c.name),
      toolsCount: Number.isSafeInteger(item.toolsCount) && item.toolsCount >= 0 ? item.toolsCount : 0,
      triggersCount: Number.isSafeInteger(item.triggersCount) && item.triggersCount >= 0 ? item.triggersCount : 0,
      authSchemes: (item.authSchemes ?? []).filter(s => typeof s === 'string').map(s => safeText(s, 35)).slice(0, 10),
      managedAuthSchemes: (item.managedAuthSchemes ?? []).filter(s => typeof s === 'string').map(s => safeText(s, 35)).slice(0, 10),
      noAuth: item.noAuth === true,
    });
  }
  return result;
}
