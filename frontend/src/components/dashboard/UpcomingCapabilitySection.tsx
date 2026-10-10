import Link from 'next/link';
import { ArrowUpRight, CircleDot, Layers3 } from 'lucide-react';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';

export type Capability = { id: string; name: string; summary: string; status?: 'Available' | 'Coming soon'; href?: string };

export function UpcomingCapabilitySection({ title, description, entries }: { title: string; description: string; entries: readonly Capability[] }) {
  return (
    <PageFullscreenFrame>
      <main className="mx-auto w-full max-w-4xl px-2 pb-16 pt-6 text-[var(--foreground)] sm:px-5">
        <div className="mb-8 flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--card-border)] bg-[var(--card)] text-[var(--accent)]">
            <Layers3 aria-hidden="true" size={21} />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{description}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">Explore every section. Items marked Coming soon describe planned capabilities; execution is not yet available.</p>
          </div>
        </div>
        <nav aria-label={title + ' sections'} className="mb-7 flex flex-wrap gap-2">
          {entries.map(item => (
            <a href={'#' + item.id} key={item.id} className="rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--foreground)]/[0.06] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{item.name}</a>
          ))}
        </nav>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {entries.map(item => (
            <section key={item.id} id={item.id} tabIndex={-1} className="scroll-mt-20 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 transition-colors target:border-[var(--accent)]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{item.name}</h2>
                <span className="rounded-full border border-[var(--card-border)] px-2 py-1 text-[10px] font-medium text-[var(--muted)]">{item.status ?? 'Coming soon'}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{item.summary}</p>
              {item.href ? <Link className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline" href={item.href}>Open existing feature <ArrowUpRight size={13} aria-hidden="true" /></Link>
                : <span className="mt-4 inline-flex items-center gap-1 text-xs text-[var(--muted)]"><CircleDot size={12} aria-hidden="true" /> Preview this section</span>}
            </section>
          ))}
        </div>
        <Link href="/workspace" className="mt-8 inline-flex rounded-xl border border-[var(--card-border)] px-4 py-2 text-xs font-semibold hover:bg-[var(--foreground)]/[0.06]">Return to Workspace</Link>
      </main>
    </PageFullscreenFrame>
  );
}
