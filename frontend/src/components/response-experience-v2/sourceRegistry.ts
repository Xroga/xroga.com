import { remarkSourceCitations, type CitationSource } from '@/lib/xrogaCitations';
import { safeLinkV2, type ResponseDocumentV2 } from './document';

/** Page identity, not publisher identity. Preserve query parameters because they
 * can select a different document, price, date or signed resource. */
export function sourceKeyV2(value: string): string | undefined {
  const safe = safeLinkV2(value);
  if (!safe) return undefined;
  const url = new URL(safe);
  url.hash = '';
  return url.href;
}
export function sourceRegistryV2(document: ResponseDocumentV2) {
  const pages = new Map<string, CitationSource>();
  const add = (source: CitationSource) => {
    const key = sourceKeyV2(source.url);
    if (key && !pages.has(key)) pages.set(key, source);
  };
  document.sources.forEach(add);
  for (const node of document.nodes) {
    if (node.kind === 'citation') add({ title: node.label, url: node.url, snippet: node.excerpt ?? '' });
    if (node.kind === 'resources') for (const item of node.items) {
      if (item.source) add({ title: item.source.title, url: item.source.url, snippet: '' });
    }
  }
  return pages;
}

type SourceTree = { type: string; value?: string; url?: string; children?: SourceTree[] };
/** Collapse only repeated citations in one adjacent citation cluster. The same
 * page remains available beside separate claims. Prose and code stay intact. */
export function remarkCitationsV2(sources: CitationSource[]) {
  return () => (tree: SourceTree) => {
    remarkSourceCitations(sources)()(tree);
    const visit = (node: SourceTree) => {
      if (!node.children || ['code', 'inlineCode', 'link'].includes(node.type)) return;
      const seen = new Set<string>();
      node.children = node.children.filter(child => {
        const numeric = child.type === 'link' && child.children?.length === 1 && /^\[\d{1,2}\]$/.test(child.children[0].value ?? '');
        const key = numeric && child.url ? sourceKeyV2(child.url) : undefined;
        if (key) {
          if (seen.has(key)) return false;
          seen.add(key);
        } else if (!(child.type === 'text' && /^\s*$/.test(child.value ?? ''))) seen.clear();
        visit(child);
        return true;
      });
    };
    visit(tree);
  };
}
