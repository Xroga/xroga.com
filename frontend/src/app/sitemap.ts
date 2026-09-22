import type { MetadataRoute } from 'next';
import { buildSitemapRecords } from '@/lib/publicUrlInventory';

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapRecords();
}
