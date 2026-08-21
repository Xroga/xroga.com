import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { ImageLandingPage } from '@/components/image/ImageLandingPage';
import '@/styles/image-landing.css';

export const metadata: Metadata = buildMetadata({
  title: 'Xroga Image – AI Image Generator',
  description:
    'Create cinematic, editorial, photorealistic, 3D, surreal, and product images from a prompt with Xroga Image.',
  path: '/image',
  keywords: [
    'AI image generator',
    'text to image',
    'AI art generator',
    'cinematic AI images',
    'Xroga Image',
  ],
});

export default function ImagePage() {
  return <ImageLandingPage />;
}
