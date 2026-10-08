import { adaptOutputToXrogaDocument } from './xrogaOutputAdapters';

/** Reuse the existing ACL-backed text share for genuine generated document content. */
export function shareableDocumentText(output: unknown): string {
  const document = adaptOutputToXrogaDocument(output);
  if (!document) return '';
  return document.blocks
    .filter((block) => block.type === 'document')
    .map((block) => block.content)
    .join('\n\n')
    .trim();
}
