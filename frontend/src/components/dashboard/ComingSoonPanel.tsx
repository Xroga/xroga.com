'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';

export function ComingSoonPanel({
  title,
  description,
  backHref = '/dashboard',
  backLabel = 'Back to Dashboard',
}: {
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <PageFullscreenFrame>
      <div className="max-w-xl mx-auto text-center space-y-5 py-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" /> Coming Soon
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
        <p className="text-sm text-[var(--muted)] leading-relaxed">{description}</p>
        <Link
          href={backHref}
          className="inline-flex text-sm font-semibold text-[var(--accent)] hover:underline"
        >
          {backLabel}
        </Link>
      </div>
    </PageFullscreenFrame>
  );
}
