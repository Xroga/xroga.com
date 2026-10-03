import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'XROGA AI',
    short_name: 'XROGA',
    description: 'AI coding and product-building agent for repository work, validation, and publishing.',
    start_url: '/',
    display: 'standalone',
    background_color: '#02070d',
    theme_color: '#02070d',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/xroga-orb-mark-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
