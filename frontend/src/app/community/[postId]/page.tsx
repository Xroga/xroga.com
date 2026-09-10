import type { Metadata } from 'next';
import { CommunityPostView } from '@/components/community/CommunityPostView';

export const metadata: Metadata = {
  title: 'Community post — Xroga',
  description: 'Read and join this public Xroga Community discussion.',
  alternates: { canonical: '/community' },
};

export default async function CommunityPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#060a0f] dark:text-white"><div className="mx-auto max-w-4xl px-4 py-8 sm:py-12"><CommunityPostView postId={postId} /></div></main>;
}
