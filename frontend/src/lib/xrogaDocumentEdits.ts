import { parseXrogaOutput, type XrogaOutputDocument } from './xrogaBlocks';

/** Pure update: only the selected document changes, and the previous text stays recoverable. */
export function applyDocumentEdit(
  output: XrogaOutputDocument,
  blockId: string,
  content: string,
  savedAt = new Date().toISOString(),
): XrogaOutputDocument | null {
  if (content.length > 200_000) return null;
  const current = output.blocks.find((block) => block.id === blockId && block.type === 'document');
  if (!current || current.type !== 'document' || current.content === content) return null;
  const previousVersion = current.version ?? 1;
  const next: XrogaOutputDocument = {
    ...output,
    blocks: output.blocks.map((block) => block.id === blockId && block.type === 'document'
      ? {
          ...block,
          content,
          version: previousVersion + 1,
          revisions: [...(block.revisions ?? []), { version: previousVersion, content: block.content, savedAt }].slice(-20),
        }
      : block),
  };
  return parseXrogaOutput(next);
}
