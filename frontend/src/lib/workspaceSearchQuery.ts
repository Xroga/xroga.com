export const searchWords = (text: string) => text.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];

export function workspaceSearchTerms(query: string) {
  // PostgREST's .or() accepts raw syntax, so only literal words may enter it.
  return [...new Set(searchWords(query.slice(0, 120)).filter(word => /[\p{L}\p{N}]/u.test(word)).map(word => word.toLowerCase()))].slice(0, 6);
}

const searchFields = ['title', 'name', 'github_repo_name', 'prompt', 'preview', 'title_override'] as const;
type SearchField = (typeof searchFields)[number];

export function workspaceSearchFilter(terms: string[], fields: SearchField[]) {
  if (!fields.length || fields.some(field => !searchFields.includes(field)) || !terms.length || terms.length > 6
    || terms.some(term => !/^[\p{L}\p{M}\p{N}]{1,120}$/u.test(term))) {
    throw new Error('Invalid workspace search filter');
  }
  const clauses = terms.map(term => fields.map(field => `${field}.ilike.%${term}%`).join(','));
  return clauses.length === 1 ? clauses[0] : `and(${clauses.map(clause => `or(${clause})`).join(',')})`;
}
