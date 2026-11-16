'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown,
  KeyRound, LockKeyhole, Network, Search, Server, ShieldCheck,
  SlidersHorizontal, Sparkles, Workflow, X, Zap,
} from 'lucide-react';
import { PluginBrandLogo } from '@/components/integrations/PluginBrandLogo';
import { SharedDotBackdrop } from '@/components/homepage-next/backdrop/SharedDotBackdrop';
import { EXTERNAL_AGENTS, EXTERNAL_AGENT_DISCLOSURE } from '@/lib/externalAgentWorkflows';
import { xrogaConnect } from '@/lib/xrogaConnect';
import { publicConnectCatalogPage } from '@/lib/publicConnectCatalog';
import { normalizeLiveIntegration, liveIntegrationCategories } from '@/lib/liveIntegrationDiscovery';
import type {
  IntegrationCategory,
  PublicIntegrationCard,
} from '@/lib/publicIntegrationsDirectory';
import {
  matchesPublicIntegrationCategory,
  PUBLIC_INTEGRATION_FEATURED_IDS,
} from '@/lib/integrationDiscoveryFilters';

type SortMode = 'featured' | 'alphabetical';
const PAGE_SIZE = 24;
const SEARCH_SUGGESTIONS = [
  'Search Shopify, GitHub, Slack...',
  'Find your next favorite app...',
  'Explore providers, tools and triggers...',
  'Search sales, finance and communication...',
];
const featuredOrder = new Map<string, number>(PUBLIC_INTEGRATION_FEATURED_IDS.map((id, index) => [id, index]));

function useTypingPlaceholder(active: boolean) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setText('Search apps, technologies, or workflows...');
      return;
    }
    setText('');
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
  return <PluginBrandLogo id={item.id} name={item.name} toolkit={item.id} logo={item.logoUrl} size={size} verifiedOnly />;
}

function HowItWorks() {
  return (
    <section className="xi-section xi-how" aria-labelledby="xi-how-heading">
      <div className="xi-section-heading">
        <div><span className="xi-overline">HOW IT WORKS</span><h2 id="xi-how-heading">A better way to<br/><em>work together.</em></h2></div>
        <p>Discover a service, understand the permissions it needs, and ask Xroga to perform supported work. Every external action remains subject to authorization and approval.</p>
      </div>
      <div className="xi-steps">
        <div className="xi-step">
          <span className="xi-step-num">DISCOVER</span>
          <div className="xi-step-visual">
            <div className="xi-step-search"><Search size={15}/> Find an app</div>
            <div className="xi-step-search-row"><span className="xi-logo-stamp">G</span><span>GitHub<small>Repositories and code</small></span><CheckCircle2 size={16}/></div>
            <div className="xi-step-search-row xi-step-search-row--faded"><span className="xi-logo-stamp xi-logo-stamp--blue">S</span><span>Slack<small>Messages and channels</small></span><ArrowUpRight size={16}/></div>
          </div>
          <h3>Find your tools</h3>
          <p>Search the catalog by name, category, or the work you want to do.</p>
        </div>
        <div className="xi-step">
          <span className="xi-step-num">AUTHORIZE</span>
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
          <span className="xi-step-num">WORK</span>
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
        <div className="xi-card-kind">{item.fromLiveCatalog ? 'Xroga Connect app' : 'Featured app'}</div>
        <h3>{item.name}</h3>
        {item.description && <p className="xi-card-description">{item.description}</p>}
        <div className="xi-card-meta">
          {item.fromLiveCatalog && <div><Zap size={13} aria-hidden="true"/><span>Capabilities</span><strong>{(item.toolsCount ?? 0).toLocaleString()} actions · {(item.triggersCount ?? 0).toLocaleString()} triggers</strong></div>}
          <div><KeyRound size={13} aria-hidden="true"/><span>Authorization</span><strong>{item.authHint}</strong></div>
        </div>
        <span className="xi-card-bottom">Explore app <ArrowRight size={15} aria-hidden="true"/></span>
      </Link>
    </article>
  );
}


function AgentConnections() {
  const [active, setActive] = useState(EXTERNAL_AGENTS[0].id);
  const selected = EXTERNAL_AGENTS.find(agent => agent.id === active) ?? EXTERNAL_AGENTS[0];

  return (
    <section className="xi-section xi-agents" id="xi-agents" aria-labelledby="xi-agents-heading">
      <div className="xi-section-heading">
        <div>
          <span className="xi-overline">WORK WITH OTHER AGENTS</span>
          <h2 id="xi-agents-heading">Your favorite AI agents.<br/><em>One shared project.</em></h2>
        </div>
        <p>Use Codex, Claude Code, Cursor and more alongside Xroga. The currently supported handoff is an authorized GitHub repository—not a direct agent-to-Xroga connection.</p>
      </div>
      <div className="xi-agent-layout">
        <div className="xi-agent-list" role="group" aria-label="Choose a coding agent">
          {EXTERNAL_AGENTS.map(agent => (
            <button type="button" key={agent.id} className={'xi-agent-option' + (active === agent.id ? ' xi-agent-option-active' : '')}
              aria-pressed={active === agent.id} onClick={() => setActive(agent.id)}>
              <PluginBrandLogo id={agent.logoId} name={agent.maker} toolkit={agent.logoId} size="card"/>
              <span className="xi-agent-option-text"><strong>{agent.name}</strong><small>{agent.maker}</small></span>
              <span className="xi-agent-option-arrow"><ArrowRight size={16}/></span>
            </button>
          ))}
        </div>
        <div className="xi-agent-detail" aria-live="polite">
          <div className="xi-agent-detail-top">
            <PluginBrandLogo id={selected.logoId} name={selected.maker} toolkit={selected.logoId} size="detail"/>
            <div><span className="xi-agent-pill">GitHub handoff</span><h3>{selected.name} + Xroga</h3><p>{selected.summary}</p></div>
          </div>
          <div className="xi-agent-how-heading"><Workflow size={16}/> How to work together</div>
          <ol className="xi-agent-steps">
            {selected.workflow.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, '0')}</span><p>{step}</p></li>)}
          </ol>
          <p className="xi-agent-detail-copy">{selected.detail}</p>
          <div className="xi-agent-actions">
            <Link href="/dashboard/integrations/github" className="xi-agent-primary">Set up GitHub handoff <ArrowUpRight size={16}/></Link>
            <a href={selected.vendorDocumentation} target="_blank" rel="noopener noreferrer" className="xi-agent-doc">Official agent docs <ArrowUpRight size={15}/></a>
          </div>
        </div>
      </div>
      <p className="xi-agent-disclosure"><ShieldCheck size={16}/>{EXTERNAL_AGENT_DISCLOSURE}</p>
    </section>
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
  const [sort, setSort] = useState<SortMode>('featured');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const searchInput = useRef<HTMLInputElement>(null);
  const typing = useTypingPlaceholder(!focused && !query);
  const [liveItems, setLiveItems] = useState<PublicIntegrationCard[] | null>(null);
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(true);
  const [catalogIncomplete, setCatalogIncomplete] = useState(false);

  // Public metadata is served by a narrow, read-only catalog route that
  // excludes custom/private MCP registrations and account connection state.
  // On a preview where that backend route is not yet deployed, signed-in
  // users can still use the existing authenticated catalogue. Anonymous
  // visitors see only Xroga's real curated plugin summaries, never the
  // unrelated 711-entry technology list or synthesized filler text.
  useEffect(() => {
    let active = true;
    void (async () => {
      const seen = new Map<string, PublicIntegrationCard>();
      let reportedTotal: number | null = null;
      let nextCursor: string | undefined;
      let usedPublic = true;
      let incomplete = false;
      try {
        let page;
        try {
          page = await publicConnectCatalogPage();
        } catch {
          usedPublic = false;
          const status = await xrogaConnect.status();
          if (!status.configured) return;
          page = await xrogaConnect.catalog({ sortBy: 'usage', limit: 250 });
        }
        if (!active || !page.ok || !Array.isArray(page.items)) return;

        // Full read-only catalog is paginated server side and hydrated without
        // blocking the first cards; avoid both fictitious counts and bulk DOM.
        for (let pages = 0; active && pages < 12; pages++) {
          for (const entry of page.items) {
            if (entry.slug && !seen.has(entry.slug)) {
              seen.set(entry.slug, normalizeLiveIntegration(entry));
            }
          }
          reportedTotal = page.totalItems;
          nextCursor = page.nextCursor;
          if (active) {
            setLiveItems([...seen.values()]);
            setLiveTotal(reportedTotal);
          }
          if (!nextCursor) break;
          page = usedPublic
            ? await publicConnectCatalogPage(nextCursor)
            : await xrogaConnect.catalog({ sortBy: 'usage', limit: 250, cursor: nextCursor });
        }
        incomplete = Boolean(nextCursor) || (reportedTotal !== null && seen.size < reportedTotal);
        if (active) setCatalogIncomplete(incomplete);
      } catch {
        if (active && seen.size > 0) setCatalogIncomplete(true);
      } finally {
        if (active) setCatalogBusy(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const directoryItems = liveItems ?? items;
  const directoryCategories = useMemo(
    () => liveItems ? liveIntegrationCategories(liveItems) : categories,
    [liveItems, categories],
  );


  const featured = useMemo(() => {
    const lookup = new Map(items.map(item => [item.id, item]));
    return PUBLIC_INTEGRATION_FEATURED_IDS.map(id => lookup.get(id)).filter(
      (item): item is PublicIntegrationCard => Boolean(item),
    ).slice(0, 8);
  }, [items]);

  const categoryCounts = useMemo(() => new Map(directoryCategories.map(option => [
    option.id, directoryItems.filter(item => matchesPublicIntegrationCategory(item, option.id)).length,
  ])), [directoryItems, directoryCategories]);

  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = directoryItems.filter(item => {
      if (!matchesPublicIntegrationCategory(item, category)) return false;
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
  }, [directoryItems, category, query, sort]);

  const shown = matches.slice(0, limit);
  const selectedCategoryLabel = directoryCategories.find(value => value.id === category)?.label || 'All apps';
  const primary = directoryCategories.filter(item => item.group === 'primary');
  const additional = directoryCategories.filter(item => item.group === 'additional');

  const pickCategory = (id: string) => { setCategory(id); setLimit(PAGE_SIZE); };
  const usingLiveCatalog = liveItems !== null;
  useEffect(() => { setCategory('all'); setLimit(PAGE_SIZE); }, [usingLiveCatalog]);
  const typeSearch = (value: string) => { setQuery(value); setLimit(PAGE_SIZE); };

  return (
    <div className="xi-root">
      {/* Reuse the exact homepage S01–S05 dot grid, mounted only once
          behind every Integrations section. The shared footer is outside
          xi-root, so dots end at the page boundary. */}
      <SharedDotBackdrop />
      <section className="xi-hero" aria-labelledby="xi-hero-title">
        <div className="xi-hero-halo" aria-hidden="true" />
        <div className="xi-hero-logos" aria-hidden="true">
          {featured.slice(0, 8).map((item, i) => <div className={'xi-orbit-logo xi-orbit-logo-' + (i + 1)} key={item.id}><AppLogo item={item}/></div>)}
        </div>
        <div className="xi-hero-content">
          <h1 id="xi-hero-title">Connect your favorite apps<br/><em>with Xroga AI.</em></h1>
          <p>Save time with app automation inside your workspace. Set up supported tasks to run on a schedule, including around-the-clock workflows when configured and authorized.</p>
          <div className="xi-hero-actions">
            <a className="xi-primary-button" href="#xi-directory">Browse apps <ArrowUpRight size={17}/></a>
            <a className="xi-secondary-button" href="#xi-agents">Work with AI agents <ArrowRight size={16}/></a>
          </div>
          <div className="xi-hero-app-strip" aria-label="Explore popular applications">
            {featured.slice(0, 6).map(item => (
              <Link key={item.id} href={item.href} className="xi-hero-app" aria-label={`Explore ${item.name}`}>
                <AppLogo item={item} size="micro" /><span>{item.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="xi-section xi-directory" id="xi-directory" aria-labelledby="xi-directory-heading">
        <div className="xi-directory-title">
          <h2 id="xi-directory-heading">Find the apps you need.</h2>
          <p>{liveTotal !== null
            ? `${liveTotal.toLocaleString()} provider apps listed by Xroga Connect.${catalogBusy ? ' Loading more...' : catalogIncomplete ? ' Some results could not be loaded.' : ''}`
            : catalogBusy
              ? 'Loading the Xroga Connect app directory...'
              : 'Explore featured Xroga integrations below. The full, up-to-date app directory is in your workspace.'}</p>
          {!catalogBusy && liveItems === null && (
            <Link href="/dashboard/integrations" className="xi-catalog-continue">
              Browse all apps in your workspace <ArrowUpRight size={16} aria-hidden="true"/>
            </Link>
          )}
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
                <strong>{matches.length.toLocaleString()}</strong> {liveItems ? 'matching apps loaded' : 'featured integrations'} {liveTotal !== null ? `from ${liveTotal.toLocaleString()} listed` : ''}
                <span> / {selectedCategoryLabel}</span>
              </div>
              <div className="xi-sort-control"><label htmlFor="xi-sort">Sort</label><select id="xi-sort" value={sort} onChange={event => setSort(event.target.value as SortMode)}><option value="featured">Recommended first</option><option value="alphabetical">A to Z</option></select></div>
            </div>
            {shown.length ? (
              <div className="xi-app-grid">{shown.map(item => <IntegrationCard key={item.id} item={item}/>)}</div>
            ) : (
              <div className="xi-no-results">
                <Search size={30}/><h3>No matching apps found.</h3>
                <p>Try a broader search or remove the current filters.</p>
                <button type="button" onClick={() => { setQuery(''); setCategory('all'); setLimit(PAGE_SIZE); }}>Show all apps</button>
              </div>
            )}
            {shown.length > 0 && <div className="xi-pagination">
              <span>Showing {shown.length.toLocaleString()} of {matches.length.toLocaleString()} entries</span>
              {shown.length < matches.length && <button type="button" onClick={() => setLimit(value => value + PAGE_SIZE)}>Load more apps <ChevronDown size={17}/></button>}
            </div>}
            <p className="xi-catalog-footnote"><ShieldCheck size={16}/> {liveItems
              ? 'Provider listings and logos come from Xroga Connect. A listing is not a connected account; confirm access inside your workspace.'
              : 'These examples come from Xroga’s maintained plugin definitions. The full live provider directory and connection setup are available in your workspace.'} <Link href="/dashboard/integrations">Open the full plugin marketplace <ArrowUpRight size={14}/></Link></p>
          </div>
        </div>
      </section>

      <AgentConnections />

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

      <section className="xi-section xi-channels" aria-labelledby="xi-channels-heading">
        <div className="xi-section-heading">
          <div><h2 id="xi-channels-heading">Your apps, right where<br/><em>you work.</em></h2></div>
          <p>Open your workspace in one click, or use browser automation where the Xroga extension is installed and a compatible workflow is available.</p>
        </div>
        <div className="xi-channel-grid">
          <div className="xi-channel">
            <div className="xi-channel-icon"><Workflow size={25}/></div>
            <h3>Inside your Xroga workspace</h3>
            <p>Find the integration, authorize the account and ask Xroga to perform supported work without leaving your workspace.</p>
            <Link href="/workspace" className="xi-channel-link">Open your workspace <ArrowUpRight size={16}/></Link>
          </div>
          <div className="xi-channel">
            <div className="xi-channel-icon"><Network size={25}/></div>
            <h3>In your browser, with Xroga</h3>
            <p>For installed, authorized extension workflows, interact with supported browser pages through Xroga. Availability and approvals depend on the actual extension setup.</p>
            <Link href="/dashboard/automations" className="xi-channel-link">Explore browser workflows <ArrowUpRight size={16}/></Link>
          </div>
        </div>
        <p className="xi-channel-disclosure">One click opens the workspace or workflow area; it does not grant permissions or guarantee that a browser task runs without setup.</p>
      </section>

      <section className="xi-mcp xi-mcp-open" aria-labelledby="xi-mcp-heading">
        <div className="xi-mcp-copy">
          <h2 id="xi-mcp-heading">Bring your own<br/><em>MCP server.</em></h2>
          <p>Connect compatible remote tools beyond the directory. Add a server in your workspace, review its authorization, then use its supported actions with Xroga.</p>
          <Link href="/dashboard/integrations?view=custom" className="xi-mcp-cta">Explore custom MCP setup <ArrowUpRight size={17}/></Link>
        </div>
        <div className="xi-mcp-flow" aria-label="MCP server to Xroga workspace workflow">
          <span className="xi-mcp-flow-unit"><Server size={20}/> Your MCP</span>
          <ArrowRight size={22} aria-hidden="true"/>
          <span className="xi-mcp-flow-core"><Network size={24}/> Xroga</span>
          <ArrowRight size={22} aria-hidden="true"/>
          <span className="xi-mcp-flow-unit"><Workflow size={20}/> Your tasks</span>
        </div>
      </section>

      <section className="xi-cta" aria-labelledby="xi-cta-heading">
        <div className="xi-cta-halo" aria-hidden="true"/>
        <h2 id="xi-cta-heading">Start in minutes.<br/><em>Try Xroga for free.</em></h2>
        <p>Find your app, connect it in the workspace and describe what you need done. Some providers and automations need extra setup or approval.</p>
        <Link href="/auth/signup" className="xi-primary-button">Start for free <ArrowUpRight size={17}/></Link>
      </section>
    </div>
  );
}
