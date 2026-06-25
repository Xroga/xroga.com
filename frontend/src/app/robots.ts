import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://xroga.com';
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/dashboard/', '/settings', '/onboarding'] },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
