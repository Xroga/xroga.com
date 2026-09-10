import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CommunityFeed } from '@/components/community/CommunityFeed';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Xroga Community — Feedback, Ideas and Builder Help',
  description: 'Share feedback, request features, report bugs, ask questions, and get help from Xroga builders and the Xroga team.',
  path: '/community',
  keywords: ['Xroga Community', 'Xroga feedback', 'AI coding community', 'Xroga feature requests'],
});

export default function CommunityPage() {
  return <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#060a0f] dark:text-white">
    <section className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <p className="text-xs font-black uppercase tracking-[.2em] text-[#006aff]">Built in public</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-6xl">Xroga Community</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">Share ideas, ask questions and build with the community.</p>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500 dark:text-slate-400">Browse public feedback, feature requests, bug reports, and practical answers from builders. Signed-in members can publish and vote; official replies are assigned only through Xroga&rsquo;s protected staff workflow.</p>
      <div className="mt-8"><Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[.05]" />}><CommunityFeed /></Suspense></div>
    </section>
  </main>;
}
