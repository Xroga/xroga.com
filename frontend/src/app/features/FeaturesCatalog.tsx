'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight, Blocks, CloudUpload, Code2, GitBranch,
  Globe2, Layers3, MessageSquareText, Search, Workflow,
} from 'lucide-react';

export type FeatureListing = {
  title: string;
  description: string;
  href: string;
  group: 'Chat' | 'Build' | 'Develop' | 'Connect' | 'Ship';
  icon: 'chat' | 'apps' | 'web' | 'saas' | 'code' | 'github' | 'deploy' | 'connect';
};

const categories = ['All', 'Chat', 'Build', 'Develop', 'Connect', 'Ship'] as const;
type Category = (typeof categories)[number];

const icons = {
  chat: MessageSquareText,
  apps: Blocks,
  web: Globe2,
  saas: Layers3,
  code: Code2,
  github: GitBranch,
  deploy: CloudUpload,
  connect: Workflow,
};

export function FeaturesCatalog({ items }: { items: FeatureListing[] }) {
  const [category, setCategory] = useState<Category>('All');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return items.filter(item =>
      (category === 'All' || item.group === category) &&
      (!q || [item.title, item.description, item.group].some(value => value.toLocaleLowerCase().includes(q)))
    );
  }, [items, category, query]);

  return (
    <div className="xf-catalog">
      <div className="xf-catalog-controls">
        <div className="xf-filter-tabs" role="group" aria-label="Filter capabilities by category">
          {categories.map(group => (
            <button
              key={group}
              type="button"
              className={category === group ? 'xf-filter-tab xf-filter-active' : 'xf-filter-tab'}
              onClick={() => setCategory(group)}
              aria-pressed={category === group}
            >{group}</button>
          ))}
        </div>
        <label className="xf-search"><Search size={17}/><span className="sr-only">Search features</span><input type="search" placeholder="Search features..." value={query} onChange={event => setQuery(event.target.value)}/></label>
      </div>
      <p className="xf-result-count" role="status">{filtered.length} {filtered.length === 1 ? 'capability' : 'capabilities'} found</p>
      {filtered.length ? (
        <div className="xf-catalog-grid">
          {filtered.map(item => {
            const Icon = icons[item.icon];
            return (
              <Link className="xf-catalog-card" href={item.href} key={item.href}>
                <span className="xf-catalog-card-top"><span className="xf-catalog-icon"><Icon size={22} strokeWidth={1.7}/></span><ArrowUpRight size={17}/></span>
                <span className="xf-catalog-group">{item.group}</span>
                <strong>{item.title}</strong>
                <span className="xf-catalog-description">{item.description}</span>
                <span className="xf-catalog-card-link">Explore <ArrowUpRight size={14}/></span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="xf-empty-state">
          <Search size={26}/>
          <h3>No matching capabilities</h3>
          <p>Try another term or browse all features.</p>
          <button type="button" onClick={() => { setQuery(''); setCategory('All'); }}>Show all features</button>
        </div>
      )}
    </div>
  );
}
