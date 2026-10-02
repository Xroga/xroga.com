'use client';

import type { UniversalOutput } from '@/lib/universalOutput';
import { universalOutputToXrogaBlocks } from '@/lib/xrogaOutputAdapters';
import { XrogaOutputView } from './XrogaBlockView';

/** Compatibility export retained for callers while canonical blocks own rendering. */
export function UniversalOutputView({ output }: { output: UniversalOutput }) {
  return (
    <XrogaOutputView
      output={{
        schemaVersion: 1,
        id: `output-${output.provenance?.runId ?? 'result'}`,
        status: output.status,
        blocks: universalOutputToXrogaBlocks(output),
      }}
    />
  );
}
