'use client';

/**
 * The browsable half of the showcase: real search, real filters, real sorting.
 *
 * Every control acts on the registry, and the visible count always reflects what is
 * actually rendered — the filters are not decorative. Categories and technologies are
 * derived from the registry rather than hardcoded, so adding a product cannot leave a
 * stale filter list behind.
 */

import { useCallback, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { ShowcaseCard } from './ShowcaseCard';
import { SHOWCASE_TEMPLATES, type ShowcaseTemplate } from '@/lib/showcase/registry';
import { cn } from '@/lib/utils';

const SORTS = [
  { id: 'featured', label: 'Featured first' },
  { id: 'name', label: 'Name (A–Z)' },
  { id: 'category', label: 'Category' },
] as const;

type SortId = (typeof SORTS)[number]['id'];

function haystack(template: ShowcaseTemplate): string {
  return [
    template.name,
    template.category,
    template.shortDescription,
    template.longDescription,
    ...template.capabilities,
    ...template.technologies,
  ]
    .join(' ')
    .toLowerCase();
}

export function ShowcaseBrowser({
  templates = SHOWCASE_TEMPLATES,
  onCustomize,
  onGithub,
}: {
  templates?: readonly ShowcaseTemplate[];
  onCustomize?: (template: ShowcaseTemplate) => void;
  onGithub?: (template: ShowcaseTemplate) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [tech, setTech] = useState('All');
  const [sort, setSort] = useState<SortId>('featured');

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(templates.map((template) => template.category))).sort()],
    [templates],
  );
  const technologies = useMemo(
    () => ['All', ...Array.from(new Set(templates.flatMap((template) => template.technologies))).sort()],
    [templates],
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = templates.filter((template) => {
      if (category !== 'All' && template.category !== category) return false;
      if (tech !== 'All' && !template.technologies.includes(tech)) return false;
      if (needle && !haystack(template).includes(needle)) return false;
      return true;
    });

    const sorted = [...filtered];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'category') sorted.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    else sorted.sort((a, b) => Number(b.featured) - Number(a.featured));
    return sorted;
  }, [templates, query, category, tech, sort]);

  const activeCount = (query.trim() ? 1 : 0) + (category !== 'All' ? 1 : 0) + (tech !== 'All' ? 1 : 0);

  const reset = useCallback(() => {
    setQuery('');
    setCategory('All');
    setTech('All');
    setSort('featured');
  }, []);

  return (
    <section aria-labelledby="showcase-browse-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="showcase-browse-heading" className="text-lg font-semibold text-[var(--text-primary)]">
          All templates
        </h2>
        <p className="text-xs text-[var(--text-secondary)]" role="status" aria-live="polite">
          Showing <strong className="text-[var(--text-primary)]">{results.length}</strong> of {templates.length}
        </p>
      </div>

      {/* Controls */}
      <div className="mt-4 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search templates</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, feature, or technology"
              className="w-full rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] pl-9 pr-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            />
          </label>

          <div className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            <label className="sr-only" htmlFor="showcase-tech">
              Technology
            </label>
            <select
              id="showcase-tech"
              value={tech}
              onChange={(event) => setTech(event.target.value)}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              {technologies.map((option) => (
                <option key={option} value={option}>
                  {option === 'All' ? 'Any technology' : option}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="showcase-sort">
              Sort
            </label>
            <select
              id="showcase-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortId)}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              {SORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category chips */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
          {categories.map((option) => {
            const selected = option === category;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => setCategory(option)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  selected
                    ? 'border-transparent bg-[var(--text-primary)] text-[var(--surface-page)]'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
                )}
              >
                {option}
              </button>
            );
          })}

          {activeCount > 0 && (
            <button
              type="button"
              onClick={reset}
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Clear {activeCount} {activeCount === 1 ? 'filter' : 'filters'}
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div className="mt-6 rounded-token-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-inset)] p-10 text-center">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Nothing matches those filters</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-[var(--text-secondary)]">
            Try a broader search, or clear the filters to see all {templates.length} templates.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((template) => (
            <ShowcaseCard key={template.id} template={template} onCustomize={onCustomize} onGithub={onGithub} />
          ))}
        </div>
      )}
    </section>
  );
}
