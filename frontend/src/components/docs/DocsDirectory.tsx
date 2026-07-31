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
  return <><label className="relative mx-auto block max-w-xl"><span className="sr-only">Search Xroga documentation</span><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documentation" className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-3.5 pl-11 pr-4 text-[var(--text-primary)] shadow-sm outline-none focus:border-[var(--accent)]" /></label><div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{pages.map((page) => <Link key={page.slug} href={`/docs/${page.slug}`} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"><h2 className="font-black">{page.title}</h2><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{page.description}</p><span className="mt-4 inline-block text-xs font-bold text-[var(--accent)]">Read guide →</span></Link>)}</div>{!pages.length && <p className="mt-10 text-center text-sm text-[var(--text-muted)]">No documentation matches that search.</p>}</>;
}
