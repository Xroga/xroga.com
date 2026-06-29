'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { fetchFeatureCatalog, type FeatureCatalogItem } from '@/lib/featureCatalog';
import { cn } from '@/lib/utils';

interface FeatureCatalogPanelProps {
  onSelect: (prompt: string) => void;
  className?: string;
}

export function FeatureCatalogPanel({ onSelect, className }: FeatureCatalogPanelProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<FeatureCatalogItem[]>([]);

  useEffect(() => {
    void fetchFeatureCatalog().then(setCatalog);
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(catalog.map((f) => f.category))).sort(),
    [catalog]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return catalog.filter((f) => {
      if (category && f.category !== category) return false;
      if (!q) return true;
      return f.name.toLowerCase().includes(q) || f.id.includes(q);
    });
  }, [query, category, catalog]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="p-3 border-b border-[var(--card-border)] space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
          98 Features
        </p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]" />
          <input
            type="search"
            placeholder="Search features…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--card)]"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={cn(
              'text-[9px] px-2 py-0.5 rounded-full border',
              !category ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--card-border)]'
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                'text-[9px] px-2 py-0.5 rounded-full border',
                category === c ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--card-border)]'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {filtered.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelect(f.promptTemplate || f.name)}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] hover:bg-[var(--primary)]/10 transition-colors"
          >
            <span className="font-medium">{f.name}</span>
            <span className="block text-[9px] text-[var(--muted)]">{f.category}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
