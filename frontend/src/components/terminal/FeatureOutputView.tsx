'use client';

import { XrogaOutputView } from './XrogaBlockView';
import { adaptOutputToXrogaDocument } from '@/lib/xrogaOutputAdapters';
import type { CitationSource } from '@/lib/xrogaCitations';
import type { XrogaBlock } from '@/lib/xrogaBlocks';

/**
 * Compatibility boundary for persisted and current task outputs.
 *
 * Historical shapes remain accepted, but every supported shape is adapted to
 * canonical Xroga blocks before presentation. Unknown shapes receive a safe,
 * explicit fallback rather than crashing or disappearing.
 */
export function FeatureOutputView({
  output,
  onDelete: _onDelete,
  messageId,
  onPreviewUpdate,
  sources,
  discoveryBlock,
}: {
  output: unknown;
  onDelete?: () => void;
  messageId?: string;
  onPreviewUpdate?: (messageId: string, output: unknown) => void;
  sources?: CitationSource[];
  discoveryBlock?: XrogaBlock | null;
}) {
  void _onDelete;

  if (!output || typeof output !== 'object') return null;
  const row = output as Record<string, unknown>;
  if (row.type === 'chat' && typeof row.content === 'string') return null;

  const canonical = adaptOutputToXrogaDocument(output);
  if (canonical) {
    const documentWithDiscovery = discoveryBlock && !canonical.blocks.some((block) => block.type === 'rich-results')
      ? { ...canonical, blocks: [...canonical.blocks, discoveryBlock] }
      : canonical;
    return <XrogaOutputView output={documentWithDiscovery} sources={sources} onChange={messageId && onPreviewUpdate ? (next) => onPreviewUpdate(messageId, next) : undefined} />;
  }

  return (
    <p className="max-w-[820px] py-1 text-sm text-[var(--muted)]" role="status">
      Xroga saved an output this client cannot preview yet. Open task details to inspect it.
    </p>
  );
}
