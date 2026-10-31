export interface CitationSource {
  title: string;
  url: string;
  snippet: string;
  thumbnailUrl?: string;
  siteDomain?: string;
}

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

export function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}


/**
 * Mark only user-clicked, external research sources as Xroga referrals.
 * Never mutate citation evidence, self-links, existing attribution, or signed URLs.
 */
export function sourceClickUrl(value: string): string | null {
  const safe = safeSourceUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  const host = url.hostname.toLowerCase();
  if (host === 'xroga.com' || host.endsWith('.xroga.com') || url.searchParams.has('utm_source')) return safe;
  if ([...url.searchParams.keys()].some((key) => /^(?:x-amz-|x-goog-|signature$|sig$|token$|access_token$|policy$|key-pair-id$|expires$|awsaccesskeyid$)/i.test(key))) return safe;
  url.searchParams.set('utm_source', 'xroga.com');
  return url.href;
}

/** Link only bare numeric citations in prose. Existing links and code remain untouched. */
export function remarkSourceCitations(sources: CitationSource[]) {
  return () => (tree: MarkdownNode) => {
    const walk = (parent: MarkdownNode) => {
      if (!parent.children || parent.type === 'link' || parent.type === 'linkReference') return;
      const next: MarkdownNode[] = [];
      for (const child of parent.children) {
        if (child.type !== 'text' || !child.value) {
          walk(child);
          next.push(child);
          continue;
        }
        const text = child.value;
        const pattern = /\[(\d{1,2})\]/g;
        let cursor = 0;
        for (const match of text.matchAll(pattern)) {
          const number = Number(match[1]);
          const url = sources[number - 1] && safeSourceUrl(sources[number - 1]!.url);
          if (!url) continue;
          if (match.index > cursor) next.push({ type: 'text', value: text.slice(cursor, match.index) });
          next.push({ type: 'link', url, children: [{ type: 'text', value: match[0] }] });
          cursor = match.index + match[0].length;
        }
        if (cursor < text.length) next.push({ type: 'text', value: text.slice(cursor) });
      }
      parent.children = next;
    };
    walk(tree);
  };
}
