import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { VideoLandingPage } from '@/components/video/VideoLandingPage';
import '@/styles/video-landing.css';

export const metadata: Metadata = buildMetadata({
  title: 'Xroga Video – AI Video Generation Platform | Coming Soon',
  description: 'Xroga Video is an upcoming AI video generation platform for creating videos from prompts, images, and scripts. Join early access to explore the future of video creation.',
  path: '/video',
  keywords: ['AI video generation', 'prompt to video', 'image to video', 'script to video', 'Xroga Video'],
});

export default function VideoPage() {
  return <VideoLandingPage />;
}
