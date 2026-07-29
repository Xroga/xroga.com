import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsDirectory } from '@/components/docs/DocsDirectory';
import { Logo } from '@/components/layout/Logo';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'Xroga Documentation — Build, Test and Publish', description: 'Practical guides for Xroga Workspace, GitHub, Vercel, repositories, testing, repairs, publishing, security, and hackathon workflows.', path: '/docs', keywords: ['Xroga documentation', 'AI coding agent guide', 'Xroga GitHub', 'Xroga Vercel'] });
export default function DocsPage() { return <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#060a0f] dark:text-white"><header className="border-b border-slate-200 bg-white dark:border-white/10 dark:bg-[#060a0f]"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3"><Logo href="/" height={38} /><nav className="flex gap-4 text-sm font-bold"><Link href="/community">Community</Link><Link href="/workspace">Open Xroga</Link></nav></div></header><section className="mx-auto max-w-6xl px-4 py-12"><p className="text-xs font-black uppercase tracking-[.2em] text-[#006aff]">Product documentation</p><h1 className="mt-2 text-4xl font-black tracking-tight sm:text-6xl">Build with evidence.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">Learn the real Xroga flow—from a clear outcome to repository changes, validation, provider operations, and verified results.</p><div className="mt-9"><DocsDirectory /></div></section></main>; }
