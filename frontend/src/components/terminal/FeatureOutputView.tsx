'use client';

import { XrogaOutputView } from './XrogaBlockView';
import { adaptOutputToXrogaDocument } from '@/lib/xrogaOutputAdapters';

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
}: {
  output: unknown;
  onDelete?: () => void;
  messageId?: string;
  onPreviewUpdate?: (messageId: string, output: unknown) => void;
}) {
  void _onDelete;

  if (!output || typeof output !== 'object') return null;
  const row = output as Record<string, unknown>;
  if (row.type === 'chat' && typeof row.content === 'string') return null;

  const canonical = adaptOutputToXrogaDocument(output);
  if (canonical) return <XrogaOutputView output={canonical} onChange={messageId && onPreviewUpdate ? (next) => onPreviewUpdate(messageId, next) : undefined} />;

  return (
    <p className="max-w-[820px] py-1 text-sm text-[var(--muted)]" role="status">
      Xroga saved an output this client cannot preview yet. Open task details to inspect it.
    </p>
  );
}
