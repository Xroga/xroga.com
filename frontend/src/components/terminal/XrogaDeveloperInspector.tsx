'use client';

import { Braces } from 'lucide-react';

import type { XrogaOutputDocument } from '@/lib/xrogaBlocks';

export function XrogaDeveloperInspector({ output }: { output: XrogaOutputDocument }) {
  const summary = {
    outputId: output.id,
    status: output.status,
    artifactId: output.artifact?.id ?? null,
    projectId: output.artifact?.projectId ?? null,
    runId: output.artifact?.runId ?? null,
    blocks: output.blocks.map((block) => ({ id: block.id, type: block.type, evidenceRefs: 'evidenceRefs' in block ? block.evidenceRefs ?? [] : [] })),
  };
  return <details className="max-w-[960px] rounded-xl border border-[var(--border)] text-xs text-[var(--muted)]"><summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2"><Braces className="h-3.5 w-3.5" aria-hidden="true" />Developer details</summary><pre className="max-h-64 overflow-auto border-t border-[var(--border)] p-3">{JSON.stringify(summary, null, 2)}</pre></details>;
}
