'use client';

import { Check, CircleDashed, Layers3 } from 'lucide-react';

import { useXrogaArtifactContext } from '@/lib/xrogaArtifactContext';
import type { XrogaOutputDocument } from '@/lib/xrogaBlocks';

export function XrogaArtifactHeader({ artifact, status }: { artifact: NonNullable<XrogaOutputDocument['artifact']>; status: XrogaOutputDocument['status'] }) {
  const activate = useXrogaArtifactContext((state) => state.activate);
  const activeId = useXrogaArtifactContext((state) => state.activeArtifactId);
  const active = activeId === artifact.id;
  return <header className="mb-3 flex max-w-[960px] flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)]/80 px-4 py-3 shadow-sm backdrop-blur-xl">
    <Layers3 className="h-4 w-4" aria-hidden="true" />
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{artifact.title}</p><p className="text-xs text-[var(--muted)]">{artifact.type} · version {artifact.version}</p></div>
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">{status === 'completed' ? <Check className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}{status}</span>
    <button type="button" onClick={() => activate(artifact.id, artifact.title)} disabled={active} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium disabled:opacity-50">{active ? 'In context' : 'Use as context'}</button>
  </header>;
}
