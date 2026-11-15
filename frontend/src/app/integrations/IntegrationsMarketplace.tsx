'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, Command,
  KeyRound, Layers3, Link2, LockKeyhole, Network, Play, PlugZap,
  Search, Server, ShieldCheck, SlidersHorizontal, Sparkles, Workflow, X, Zap,
} from 'lucide-react';
import { PluginBrandLogo } from '@/components/integrations/PluginBrandLogo';
import type {
  IntegrationCategory,
  PublicIntegrationCard,
  PublicIntegrationMode,
} from '@/lib/publicIntegrationsDirectory';
import {
  matchesPublicIntegrationCategory,
  PUBLIC_INTEGRATION_FEATURED_IDS,
} from '@/lib/publicIntegrationsDirectory';

type DirectoryMode = 'all' | 'guides' | 'technology';
type SortMode = 'featured' | 'alphabetical';
const PAGE_SIZE = 24;
const SEARCH_SUGGESTIONS = [
  'Search Shopify, GitHub, Slack...',
  'Find a CRM or project tool...',
  'Explore app actions and triggers...',
  'Discover technologies for your build...',
];
const featuredOrder = new Map<string, number>(PUBLIC_INTEGRATION_FEATURED_IDS.map((id, index) => [id, index]));
const modeText: Record<PublicIntegrationMode, string> = {
  native: 'Native setup',
  'app-guide': 'App guide',
  technology: 'Technology listing',
};

function useTypingPlaceholder(active: boolean) {
  const [text, setText] = useState(SEARCH_SUGGESTIONS[0]);
  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setText('Search apps, technologies, or workflows...');
      return;
    }
    let phrase = 0;
    let length = 0;
    let backwards = false;
    let dwell = 0;
    const interval = window.setInterval(() => {
      const current = SEARCH_SUGGESTIONS[phrase];
      if (dwell > 0) { dwell--; return; }
      length += backwards ? -1 : 1;
      setText(current.slice(0, Math.max(0, length)) + (backwards ? '' : ''));
      if (!backwards && length >= current.length) { backwards = true; dwell = 18; }
      else if (backwards && length <= 0) { backwards = false; phrase = (phrase + 1) % SEARCH_SUGGESTIONS.length; dwell = 3; }
    }, 85);
    return () => window.clearInterval(interval);
  }, [active]);
  return text;
}

function AppLogo({ item, size = 'card' }: { item: PublicIntegrationCard; size?: 'micro' | 'card' | 'detail' }) {
  return <PluginBrandLogo id={item.id} name={item.name} toolkit={item.mode === 'technology' ? undefined : item.id} size={size} />;
}

function HowItWorks() {
  return (
    <section className="xi-section xi-how" aria-labelledby="xi-how-heading">
      <div className="xi-section-heading">
        <div><span className="xi-overline">01 / GET CONNECTED</span><h2 id="xi-how-heading">A better way to<br/><em>work together.</em></h2></div>
        <p>Discover a service, understand the permissions it needs, and ask Xroga to perform supported work. Every external action remains subject to authorization and approval.</p>
      </div>
      <div className="xi-steps">
        <div className="xi-step">
          <span className="xi-step-num">01 / DISCOVER</span>
          <div className="xi-step-visual">
            <div className="xi-step-search"><Search size={15}/> Find an app</div>
            <div className="xi-step-search-row"><span className="xi-logo-stamp">G</span><span>GitHub<small>Repositories and code</small></span><CheckCircle2 size={16}/></div>
            <div className="xi-step-search-row xi-step-search-row--faded"><span className="xi-logo-stamp xi-logo-stamp--blue">S</span><span>Slack<small>Messages and channels</small></span><ArrowUpRight size={16}/></div>
          </div>
          <h3>Find your tools</h3>
          <p>Search the catalog by name, category, or the work you want to do.</p>
        </div>
        <div className="xi-step">
          <span className="xi-step-num">02 / AUTHORIZE</span>
          <div className="xi-step-visual">
            <div className="xi-auth-title"><ShieldCheck size={17}/> Review access</div>
            <div className="xi-permission"><Check size={13}/> Inspect the account and scopes</div>
            <div className="xi-permission"><Check size={13}/> Set action permissions</div>
            <div className="xi-permission xi-permission-muted"><LockKeyhole size={13}/> Connect only after approval</div>
          </div>
          <h3>Connect on your terms</h3>
          <p>Use a supported OAuth or credential setup; review capabilities before granting access.</p>
        </div>
        <div className="xi-step">
          <span className="xi-step-num">03 / WORK</span>
          <div className="xi-step-visual">
            <div className="xi-prompt-bubble">Summarize this week&apos;s orders.</div>
            <div className="xi-prompt-status"><Sparkles size={14}/> Xroga checks the available tools</div>
            <div className="xi-prompt-small"><ShieldCheck size={13}/> Approval required for sensitive actions</div>
          </div>
          <h3>Put Xroga to work</h3>
          <p>Ask for an outcome and use the authorized tools available to your account.</p>
        </div>
      </div>
    </section>
  );
}

function IntegrationCard({ item }: { item: PublicIntegrationCard }) {
  return (
    <article className="xi-app-card">
      <Link href={item.href} className="xi-card-link" aria-label={'View ' + item.name + ' integration details'}>
        <div className="xi-card-top">
          <AppLogo item={item}/>
          <ArrowUpRight size={18} className="xi-card-go" aria-hidden="true"/>
        </div>
        <div className="xi-card-kind">{modeText[item.mode]}</div>
        <h3>{item.name}</h3>
        <p className="xi-card-description">{item.description}</p>
        <div className="xi-card-meta">
          <div><Zap size={13} aria-hidden="true"/><span>Tools & triggers</span><strong>{item.mode === 'technology' ? 'Not verified' : 'View details'}</strong></div>
          <div><KeyRound size={13} aria-hidden="true"/><span>Authorization</span><strong>{item.authHint}</strong></div>
        </div>
        <span className="xi-card-bottom">Explore app <ArrowRight size={15} aria-hidden="true"/></span>
      </Link>
    </article>
  );
}

export function IntegrationsMarketplace({
  items,
  categories,
}: {
  items: PublicIntegrationCard[];
  categories: IntegrationCategory[];
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [category, setCategory] = useState('all');
  const [mode, setMode] = useState<DirectoryMode>('all');
  const [sort, setSort] = useState<SortMode>('featured');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const searchInput = useRef<HTMLInputElement>(null);
  const typing = useTypingPlaceholder(!focused && !query);

  const featured = useMemo(() => {
    const lookup = new Map(items.map(item => [item.id, item]));
    return PUBLIC_INTEGRATION_FEATURED_IDS.map(id => lookup.get(id)).filter(
      (item): item is PublicIntegrationCard => Boolean(item),
    ).slice(0, 8);
  }, [items]);

  const categoryCounts = useMemo(() => new Map(categories.map(option => [
    option.id, items.filter(item => matchesPublicIntegrationCategory(item, option.id)).length,
  ])), [items, categories]);

  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = items.filter(item => {
      if (!matchesPublicIntegrationCategory(item, category)) return false;
      if (mode === 'guides' && item.mode === 'technology') return false;
      if (mode === 'technology' && item.mode !== 'technology') return false;
      if (terms.length && !terms.every(term => (item.searchTerms + ' ' + item.name.toLowerCase()).includes(term))) return false;
      return true;
    });
    filtered.sort((a, b) => {
      if (sort === 'alphabetical') return a.name.localeCompare(b.name);
      const aOrder = featuredOrder.get(a.id) ?? 9999;
      const bOrder = featuredOrder.get(b.id) ?? 9999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      if (a.mode !== b.mode) {
        const order = { native: 0, 'app-guide': 1, technology: 2 };
        return order[a.mode] - order[b.mode];
      }
      return a.name.localeCompare(b.name);
    });
    return filtered;
  }, [items, category, mode, query, sort]);

  const shown = matches.slice(0, limit);
  const selectedCategoryLabel = categories.find(value => value.id === category)?.label || 'All apps';
  const primary = categories.filter(item => item.group === 'primary');
  const additional = categories.filter(item => item.group === 'additional');

  const pickCategory = (id: string) => { setCategory(id); setLimit(PAGE_SIZE); };
  const pickMode = (value: DirectoryMode) => { setMode(value); setLimit(PAGE_SIZE); };
  const typeSearch = (value: string) => { setQuery(value); setLimit(PAGE_SIZE); };

  return (
    <div className="xi-root">
      <section className="xi-hero" aria-labelledby="xi-hero-title">
        <div className="xi-hero-halo" aria-hidden="true" />
        <div className="xi-hero-logos" aria-hidden="true">
          {featured.slice(0, 8).map((item, i) => <div className={'xi-orbit-logo xi-orbit-logo-' + (i + 1)} key={item.id}><AppLogo item={item}/></div>)}
        </div>
        <div className="xi-hero-content">
          <div className="xi-eyebrow"><span/> XROGA CONNECT <i/> INTEGRATIONS</div>
          <h1 id="xi-hero-title">Connect all your tools.<br/><em>Make more possible.</em></h1>
          <p>Power Xroga with the apps your team uses every day. Explore technologies, discover supported connections, and put your tools to work in an authorized AI workflow.</p>
          <div className="xi-hero-actions">
            <a className="xi-primary-button" href="#xi-directory">Explore integrations <ArrowUpRight size={17}/></a>
            <Link className="xi-secondary-button" href="/dashboard/integrations?view=custom">Bring your own MCP <ArrowRight size={16}/></Link>
          </div>
          <div className="xi-hero-proof"><span><CheckCircle2 size={15}/> Inspect access</span><span><CheckCircle2 size={15}/> Own your connections</span><span><CheckCircle2 size={15}/> Approve sensitive actions</span></div>
        </div>
      </section>

      <section className="xi-spotlight" aria-labelledby="xi-spotlight-heading">
        <div className="xi-spotlight-heading"><span className="xi-overline">THE TOOLS YOU ALREADY KNOW</span><h2 id="xi-spotlight-heading">Your stack, connected to<br/><em>your next idea.</em></h2></div>
        <div className="xi-featured-list">
          {featured.map(item =>
            <Link href={item.href} key={item.id} className="xi-featured-item">
              <AppLogo item={item}/><span>{item.name}</span><ArrowUpRight size={15} aria-hidden="true"/>
            </Link>,
          )}
        </div>
        <p className="xi-small-note">Featured names are discovery links—not a statement that the viewer&apos;s accounts are connected.</p>
      </section>

      <HowItWorks />

      <section className="xi-mcp" aria-labelledby="xi-mcp-heading">
        <div className="xi-mcp-copy">
          <div className="xi-overline">OPEN TO MORE / CUSTOM MCP</div>
          <h2 id="xi-mcp-heading">Your tools don&apos;t<br/>end at a list.</h2>
          <p>Bring a compatible remote MCP server into your Xroga workspace. Supported authentication, server reachability, permissions and available actions are checked during setup.</p>
          <Link href="/dashboard/integrations?view=custom" className="xi-mcp-cta">Explore custom MCP connections <ArrowUpRight size={17}/></Link>
        </div>
        <div className="xi-mcp-art" aria-hidden="true">
          <div className="xi-mcp-centre"><Network size={34}/><strong>YOUR MCP</strong><small>Connection</small></div>
          <span className="xi-mcp-line xi-mcp-line-a"/>
          <span className="xi-mcp-line xi-mcp-line-b"/>
          <span className="xi-mcp-line xi-mcp-line-c"/>
          <span className="xi-mcp-node xi-mcp-node-a"><Server size={19}/></span>
          <span className="xi-mcp-node xi-mcp-node-b"><KeyRound size={19}/></span>
          <span className="xi-mcp-node xi-mcp-node-c"><Workflow size={19}/></span>
        </div>
      </section>

      <section className="xi-section xi-directory" id="xi-directory" aria-labelledby="xi-directory-heading">
        <div className="xi-directory-title">
          <span className="xi-overline">02 / THE INTEGRATION LIBRARY</span>
          <h2 id="xi-directory-heading">Automate the apps<br/><em>you already use.</em></h2>
          <p>Explore {items.length.toLocaleString()} catalog entries across software, work and business categories. App setup, actions, triggers and authorization are verified in each available integration detail view.</p>
        </div>
        <div className="xi-directory-search" id="xi-search">
          <Search size={23} aria-hidden="true"/>
          <label className="xi-visually-hidden" htmlFor="xi-app-query">Search integrations and technologies</label>
          <input
            ref={searchInput}
            id="xi-app-query"
            type="search"
            autoComplete="off"
            placeholder={typing}
            value={query}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={event => typeSearch(event.target.value)}
          />
          {query && <button type="button" aria-label="Clear search" onClick={() => { typeSearch(''); searchInput.current?.focus(); }}><X size={18}/></button>}
          <span className="xi-search-kbd"><Search size={13}/> Find apps</span>
        </div>
        <div className="xi-library">
          <aside className="xi-library-sidebar" aria-label="Integration category filters">
            <div className="xi-sidebar-title"><SlidersHorizontal size={16}/> Categories</div>
            <div className="xi-category-stack">
              {primary.map(option => (
                <button key={option.id} type="button" onClick={() => pickCategory(option.id)}
                  className={'xi-category-option' + (category === option.id ? ' xi-category-option-active' : '')}
                  aria-pressed={category === option.id}>
                  <span>{option.label}</span><small>{(categoryCounts.get(option.id) ?? 0).toLocaleString()}</small>
                </button>
              ))}
            </div>
            <details className="xi-more-categories" open={category.startsWith('source:') && additional.some(item => item.id === category) ? true : undefined}>
              <summary>More industries <ChevronDown size={15}/></summary>
              <div className="xi-category-stack">
                {additional.map(option => (
                  <button key={option.id} type="button" onClick={() => pickCategory(option.id)}
                    className={'xi-category-option' + (category === option.id ? ' xi-category-option-active' : '')}
                    aria-pressed={category === option.id}>
                    <span>{option.label}</span><small>{(categoryCounts.get(option.id) ?? 0).toLocaleString()}</small>
                  </button>
                ))}
              </div>
            </details>
          </aside>
          <div className="xi-library-main">
            <div className="xi-library-toolbar">
              <div className="xi-result-status" role="status" aria-live="polite">
                <strong>{matches.length.toLocaleString()}</strong> matching {matches.length === 1 ? 'entry' : 'entries'}
                <span> / {selectedCategoryLabel}</span>
              </div>
              <div className="xi-sort-control"><label htmlFor="xi-sort">Sort</label><select id="xi-sort" value={sort} onChange={event => setSort(event.target.value as SortMode)}><option value="featured">Recommended first</option><option value="alphabetical">A to Z</option></select></div>
            </div>
            <div className="xi-mode-filters" role="group" aria-label="Integration listing type">
              <button className={mode === 'all' ? 'xi-mode-active' : ''} type="button" aria-pressed={mode === 'all'} onClick={() => pickMode('all')}>All entries</button>
              <button className={mode === 'guides' ? 'xi-mode-active' : ''} type="button" aria-pressed={mode === 'guides'} onClick={() => pickMode('guides')}>App setup guides</button>
              <button className={mode === 'technology' ? 'xi-mode-active' : ''} type="button" aria-pressed={mode === 'technology'} onClick={() => pickMode('technology')}>Build technologies</button>
            </div>
            {shown.length ? (
              <div className="xi-app-grid">{shown.map(item => <IntegrationCard key={item.id} item={item}/>)}</div>
            ) : (
              <div className="xi-no-results">
                <Search size={30}/><h3>No matching apps found.</h3>
                <p>Try a broader search or remove the current filters.</p>
                <button type="button" onClick={() => { setQuery(''); setCategory('all'); setMode('all'); setLimit(PAGE_SIZE); }}>Show all apps</button>
              </div>
            )}
            {shown.length > 0 && <div className="xi-pagination">
              <span>Showing {shown.length.toLocaleString()} of {matches.length.toLocaleString()} entries</span>
              {shown.length < matches.length && <button type="button" onClick={() => setLimit(value => value + PAGE_SIZE)}>Load more apps <ChevronDown size={17}/></button>}
            </div>}
            <p className="xi-catalog-footnote"><ShieldCheck size={16}/> Technology listings describe software Xroga may build with, not automatically connected accounts. Auth, actions and triggers are validated inside the authenticated workspace.</p>
          </div>
        </div>
      </section>

      <section className="xi-cta" aria-labelledby="xi-cta-heading">
        <div className="xi-cta-halo" aria-hidden="true"/>
        <span className="xi-overline">START WITH XROGA FREE</span>
        <h2 id="xi-cta-heading">Put Xroga to work<br/><em>with your tools.</em></h2>
        <p>Find an app, review its capabilities and authorize connections when you need them.</p>
        <Link href="/auth/signup" className="xi-primary-button">Get started for free <ArrowUpRight size={17}/></Link>
      </section>
    </div>
  );
}
