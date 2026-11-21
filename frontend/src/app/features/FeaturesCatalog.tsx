'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, ArrowUpRight, BarChart3, Bitcoin, Blocks, Bot, Bug, CheckCheck,
  Clock3, Cloud, CloudUpload, Code2, FileText, FolderOpen, Gamepad2,
  GitBranch, Globe2, History, Image as ImageIcon, KeyRound, Layers3,
  MessageCircle, Monitor, PanelsTopLeft, Plug, Puzzle, Search,
  Server, Settings2, ShieldCheck, Smartphone, Sparkles, TerminalSquare,
  UserRound, Workflow, X,
} from 'lucide-react';
import type {
  FeatureGlyph, FeatureKind, FeatureSectionId, PublicFeature, PublicFeatureGroup,
} from '@/lib/publicFeatureDirectory';

const featureIcons: Record<FeatureGlyph, typeof Search> = {
  chat: MessageCircle,
  search: Search,
  document: FileText,
  image: ImageIcon,
  code: Code2,
  apps: Blocks,
  web: Globe2,
  saas: Layers3,
  game: Gamepad2,
  mobile: Smartphone,
  extension: Puzzle,
  desktop: Monitor,
  api: Server,
  bot: Bot,
  crypto: Bitcoin,
  automation: Workflow,
  bug: Bug,
  test: CheckCheck,
  git: GitBranch,
  preview: PanelsTopLeft,
  shield: ShieldCheck,
  deploy: CloudUpload,
  cloud: Cloud,
  key: KeyRound,
  files: FolderOpen,
  terminal: TerminalSquare,
  history: History,
  settings: Settings2,
  clock: Clock3,
  user: UserRound,
  sparkles: Sparkles,
  plug: Plug,
  chart: BarChart3,
  layers: Layers3,
};

const kindLabels: Partial<Record<FeatureKind, string>> = {
  scaffold: 'Project scaffold',
  conditional: 'Requires setup / availability',
  catalog: 'Integration directory',
};

function DirectoryCard({ item, compact = false }: { item: PublicFeature; compact?: boolean }) {
  const Icon = featureIcons[item.icon];
  return (
    <Link href={item.href} className={compact ? 'xf-catalog-card xf-provider-card' : 'xf-catalog-card'}>
      <span className="xf-catalog-card-top">
        <span className="xf-catalog-icon"><Icon size={compact ? 19 : 22} strokeWidth={1.7} aria-hidden="true"/></span>
        <ArrowUpRight size={16} aria-hidden="true"/>
      </span>
      <strong>{item.title}</strong>
      <span className="xf-catalog-description">{item.description}</span>
      {!compact && <span className="xf-catalog-card-link">Learn more <ArrowRight size={14} aria-hidden="true"/></span>}
      {item.kind && item.kind !== 'feature' && !compact && (
        <span className="xf-catalog-kind">{kindLabels[item.kind]}</span>
      )}
    </Link>
  );
}

export function FeaturesCatalog({ groups }: { groups: PublicFeatureGroup[] }) {
  const [active, setActive] = useState<'all' | FeatureSectionId>('all');
  const [query, setQuery] = useState('');
  const total = groups.reduce((count, group) => count + group.items.length, 0);

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return groups
      .filter(group => active === 'all' || group.id === active)
      .map(group => ({
        ...group,
        items: group.items.filter(item => {
          if (!needle) return true;
          return [item.title, item.description, item.searchTerms ?? '', group.title]
            .some(value => value.toLocaleLowerCase().includes(needle));
        }),
      }))
      .filter(group => group.items.length > 0);
  }, [groups, active, query]);

  const shown = visibleGroups.reduce((count, group) => count + group.items.length, 0);

  return (
    <div className="xf-catalog">
      <div className="xf-catalog-controls">
        <div className="xf-filter-tabs" role="group" aria-label="Filter feature categories">
          <button type="button" className={'xf-filter-tab' + (active === 'all' ? ' xf-filter-active' : '')}
            onClick={() => setActive('all')} aria-pressed={active === 'all'}>
            All <span>{total}</span>
          </button>
          {groups.map(group => (
            <button type="button" className={'xf-filter-tab' + (active === group.id ? ' xf-filter-active' : '')}
              key={group.id} onClick={() => setActive(group.id)} aria-pressed={active === group.id}>
              {group.id === 'research' ? 'Research' : group.id === 'develop' ? 'Develop' : group.id === 'workspace' ? 'Workspace' : group.id === 'connect' ? 'Connect' : group.id === 'ship' ? 'Ship' : 'Build'}
              <span>{group.items.length}</span>
            </button>
          ))}
        </div>
        <label className="xf-search">
          <Search size={17} aria-hidden="true"/>
          <span className="sr-only">Search Xroga features</span>
          <input type="search" placeholder="Search all features..." value={query}
            onChange={event => setQuery(event.target.value)}/>
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear feature search"><X size={16}/></button>}
        </label>
      </div>
      <p className="xf-result-count" aria-live="polite">{shown} of {total} entries across {groups.length} categories</p>

      {visibleGroups.length ? visibleGroups.map((group, index) => (
        <section className="xf-directory-section" id={'feature-category-' + group.id} key={group.id}
          aria-labelledby={'xf-category-' + group.id}>
          <div className="xf-directory-heading">
            <div>
              <span className="xf-directory-index">{String(index + 1).padStart(2, '0')} / {group.id.toUpperCase()}</span>
              <h3 id={'xf-category-' + group.id}>{group.title}</h3>
              <p>{group.subtitle}</p>
            </div>
            <span className="xf-directory-count">{group.items.length} {group.items.length === 1 ? 'entry' : 'entries'}</span>
          </div>
          <div className={group.id === 'connect' ? 'xf-catalog-grid xf-provider-grid' : 'xf-catalog-grid'}>
            {group.items.map(item => <DirectoryCard key={item.id} item={item} compact={group.id === 'connect'}/>)}
          </div>
          {group.id === 'connect' &&
            <div className="xf-connect-note">
              <div><strong>Technology listings are not live connectors.</strong>
                <p>Building with a listed technology is different from performing actions inside an authorized account. Check what is actually supported and connected before relying on it.</p>
              </div>
              <Link href="/integrations">Browse the full technology catalog <ArrowUpRight size={16}/></Link>
            </div>}
        </section>
      )) : (
        <div className="xf-empty-state">
          <Search size={26}/>
          <h3>No matching features found</h3>
          <p>Try a different search or return to all categories.</p>
          <button type="button" onClick={() => { setQuery(''); setActive('all'); }}>Show all features</button>
        </div>
      )}
      <p className="xf-catalog-disclaimer">
        This directory includes product workflows, build targets, conditional provider actions and catalog entries.
        Scaffolds and integration listings are not promises of an already-connected, live service.
      </p>
    </div>
  );
}
