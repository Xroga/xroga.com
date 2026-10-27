'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

import { builderPhase3Api, DELIVERY_LEVEL_LABEL, type DeliveryStep, type RevisionDelivery } from '@/lib/builderApiPhase3';
import { cn } from '@/lib/utils';

const TONE: Record<DeliveryStep['level'], string> = {
  RECORDED: 'text-emerald-400',
  PENDING: 'text-amber-400',
  FAILED: 'text-red-400',
  NOT_ATTEMPTED: 'text-[var(--muted)]',
};

const STEPS: Array<[keyof Pick<RevisionDelivery, 'github' | 'supabase' | 'vercelPreview' | 'remoteTests' | 'production'>, string]> = [
  ['github', 'GitHub'],
  ['supabase', 'Database'],
  ['vercelPreview', 'Preview'],
  ['remoteTests', 'Remote tests'],
  ['production', 'Production'],
];

/** What actually reached each provider for each version. Only recorded provider receipts count. */
export function BuilderProvenance({ projectId, refreshKey }: { projectId: string; refreshKey: number }) {
  const [rows, setRows] = useState<RevisionDelivery[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    builderPhase3Api.delivery(projectId).then((result) => { if (live) setRows(result.revisions); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [projectId, refreshKey]);

  if (failed) return <p className="text-[11px] text-amber-400">Delivery history could not be loaded.</p>;
  if (!rows) return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading delivery history" />;
  const meaningful = rows.filter((row) => STEPS.some(([key]) => row[key].level !== 'NOT_ATTEMPTED'));
  if (meaningful.length === 0) return <p className="text-[11px] text-[var(--muted)]">Nothing has been delivered to GitHub, a database or hosting yet.</p>;

  return (
    <section aria-label="Delivery history" className="space-y-2">
      <div className="font-medium">What reached where</div>
      {meaningful.map((row) => (
        <div key={row.revisionId} className="rounded-lg border border-[var(--card-border)] p-2 text-[11px]">
          <p className="font-medium">Version {row.revisionNumber ?? '?'}</p>
          <ul className="mt-1 space-y-0.5">
            {STEPS.map(([key, label]) => {
              const step = row[key];
              return (
                <li key={key} className="flex flex-wrap gap-x-1">
                  <span className="w-24 shrink-0 text-[var(--muted)]">{label}</span>
                  <span className={cn('font-medium', TONE[step.level])}>{DELIVERY_LEVEL_LABEL[step.level]}</span>
                  {step.level !== 'NOT_ATTEMPTED' ? <span className="text-[var(--muted)]">{step.detail}</span> : null}
                  {step.link ? <a href={step.link} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label}`}><ExternalLink className="inline h-3 w-3" aria-hidden="true" /></a> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
