import { PAGE_SEO } from '@/lib/dashboard-metadata';
import { redirect } from 'next/navigation';

export const metadata = PAGE_SEO.influencer;

/** Standalone route redirects into Community hub influencer tab */
export default function InfluencerPage() {
  redirect('/dashboard/community?tab=influencer');
}
