import MiniSearch from 'minisearch';
import { searchWords } from './workspaceSearchQuery';

export type WorkspaceSearchResult = {
  id: string;
  kind: 'chat' | 'project' | 'section';
  title: string;
  detail: string;
  href: string;
  updatedAt: string;
};
export type WorkspaceSearchCandidate = WorkspaceSearchResult & { keywords: string };

export function rankWorkspaceSearch(candidates: WorkspaceSearchCandidate[], terms: string[]): WorkspaceSearchResult[] {
  const keyed = [...new Map(candidates.map(result => [`${result.kind}:${result.id}`, result])).entries()];
  const index = new MiniSearch({ fields: ['title', 'detail', 'keywords'], tokenize: searchWords });
  index.addAll(keyed.map(([key, result]) => ({ ...result, id: key })));
  const ranked = terms.length ? index.search(terms.join(' '), { prefix: true, combineWith: 'AND', boost: { title: 5, detail: 2 } }) : [];
  const scores = new Map(ranked.map(result => [result.id, result.score]));
  const phrase = terms.join(' ');
  return keyed.sort(([aKey, a], [bKey, b]) => {
    const titlePriority = (title: string) => {
      if (!phrase) return 0;
      const normalized = searchWords(title).join(' ').toLowerCase();
      return normalized === phrase ? 2 : normalized.startsWith(phrase) ? 1 : 0;
    };
    // Keep DB-confirmed substring matches even when the word index has no score.
    return titlePriority(b.title) - titlePriority(a.title)
      || (scores.get(bKey) ?? 0) - (scores.get(aKey) ?? 0)
      || b.updatedAt.localeCompare(a.updatedAt)
      || aKey.localeCompare(bKey);
  }).slice(0, 24).map(([, { id, kind, title, detail, href, updatedAt }]) => ({ id, kind, title, detail, href, updatedAt }));
}
