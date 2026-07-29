import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CommunityFeed } from '@/components/community/CommunityFeed';
import { Logo } from '@/components/layout/Logo';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Xroga Community — Feedback, Ideas and Builder Help',
  description: 'Share feedback, request features, report bugs, ask questions, and get help from Xroga builders and the Xroga team.',
  path: '/community',
  keywords: ['Xroga Community', 'Xroga feedback', 'AI coding community', 'Xroga feature requests'],
});

export default function CommunityPage() {
  return <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#060a0f] dark:text-white">
    <header className="border-b border-slate-200 bg-white/85 backdrop-blur dark:border-white/10 dark:bg-[#060a0f]/85">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3"><Logo href="/" height={38} /><nav className="flex items-center gap-4 text-sm font-semibold"><Link href="/docs">Docs</Link><Link href="/pricing">Pricing</Link><Link href="/workspace" className="rounded-lg bg-[#006aff] px-3 py-2 text-white">Open Xroga</Link></nav></div>
    </header>
    <section className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <p className="text-xs font-black uppercase tracking-[.2em] text-[#006aff]">Built in public</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-6xl">Xroga Community</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">Share ideas, ask questions and build with the community.</p>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500 dark:text-slate-400">Browse public feedback, feature requests, bug reports, and practical answers from builders. Signed-in members can publish and vote; official replies are assigned only through Xroga&rsquo;s protected staff workflow.</p>
      <div className="mt-8"><Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[.05]" />}><CommunityFeed /></Suspense></div>
    </section>
  </main>;
}
