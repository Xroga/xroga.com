'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DOC_PAGES } from '@/lib/docsContent';

export function DocsDirectory() {
  const [query, setQuery] = useState('');
  const pages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? DOC_PAGES.filter((page) => `${page.title} ${page.description}`.toLowerCase().includes(normalized)) : DOC_PAGES;
  }, [query]);
  return <><label className="relative mx-auto block max-w-xl"><span className="sr-only">Search Xroga documentation</span><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documentation" className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-slate-950 shadow-sm outline-none focus:border-[#006aff] dark:border-white/10 dark:bg-white/[.05] dark:text-white" /></label><div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{pages.map((page) => <Link key={page.slug} href={`/docs/${page.slug}`} className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg dark:border-white/10 dark:bg-white/[.04]"><h2 className="font-black">{page.title}</h2><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-300">{page.description}</p><span className="mt-4 inline-block text-xs font-bold text-[#006aff]">Read guide →</span></Link>)}</div>{!pages.length && <p className="mt-10 text-center text-sm text-slate-500">No documentation matches that search.</p>}</>;
}
