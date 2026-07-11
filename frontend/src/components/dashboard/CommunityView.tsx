'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Globe,
  Gift,
  Sparkles,
  Zap,
  CheckCircle2,
  XCircle,
  Award,
  Store,
  RefreshCw,
  ShoppingBag,
  Plus,
} from 'lucide-react';
import {
  api,
  type CommunityPoolStatus,
  type TokenDistributionPreview,
  type MarketplaceListing,
} from '@/lib/api';
import { InfluencerPanel } from '@/components/dashboard/InfluencerPanel';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

type CommunityTab = 'overview' | 'marketplace' | 'distribution' | 'influencer';

const VALID_TABS: CommunityTab[] = ['overview', 'marketplace', 'distribution', 'influencer'];

function parseTab(value: string | null): CommunityTab {
  if (value && VALID_TABS.includes(value as CommunityTab)) return value as CommunityTab;
  return 'overview';
}

export function CommunityView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<CommunityTab>(() => parseTab(searchParams.get('tab')));
  const [pool, setPool] = useState<CommunityPoolStatus | null>(null);
  const [distribution, setDistribution] = useState<TokenDistributionPreview | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [distLoading, setDistLoading] = useState(false);
  const [rollover, setRollover] = useState(true);
  const [shareCommunity, setShareCommunity] = useState(false);
  const [marketCategory, setMarketCategory] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newListing, setNewListing] = useState({ title: '', description: '', category: 'template', priceXrg: 1000 });
  const [buyingId, setBuyingId] = useState<string | null>(null);

  function setTab(next: CommunityTab) {
    setTabState(next);
    router.replace(`/dashboard/community?tab=${next}`, { scroll: false });
  }

  useEffect(() => {
    const fromUrl = parseTab(searchParams.get('tab'));
    setTabState(fromUrl);
  }, [searchParams]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.community.pool(),
      api.tokenDistribution.preview(),
      api.marketplace.listings({ category: marketCategory === 'all' ? undefined : marketCategory }),
    ])
      .then(([p, d, m]) => {
        setPool(p);
        setDistribution(d);
        setListings(m.listings);
      })
      .catch(() => {
        setPool(null);
        setDistribution(null);
        setListings([]);
      })
      .finally(() => setLoading(false));
  }, [marketCategory]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClaim() {
    setClaiming(true);
    try {
      const result = await api.community.requestPool();
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setClaiming(false);
    }
  }

  async function handleDistribution() {
    setDistLoading(true);
    try {
      const result = await api.tokenDistribution.confirm({
        rollover,
        shareTarget: shareCommunity ? 'community' : undefined,
      });
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDistLoading(false);
    }
  }

  async function handleCreateListing(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const result = await api.marketplace.create(newListing);
      if (result.success) {
        toast.success(result.message);
        setShowCreate(false);
        setNewListing({ title: '', description: '', category: 'template', priceXrg: 1000 });
        load();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handlePurchase(listingId: string) {
    setBuyingId(listingId);
    try {
      const result = await api.marketplace.purchase(listingId);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBuyingId(null);
    }
  }

  if (loading && !pool) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton height={40} width={280} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
        <Skeleton height={220} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
      </div>
    );
  }

  const tabs: { id: CommunityTab; label: string; icon: typeof Globe }[] = [
    { id: 'overview', label: 'Overview', icon: Globe },
    { id: 'influencer', label: 'Influencer', icon: Award },
    { id: 'marketplace', label: 'Marketplace', icon: Store },
    { id: 'distribution', label: 'Auto Distribution', icon: RefreshCw },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 universe-fade-in">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe className="w-7 h-7 text-[var(--accent)]" />
          Community
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Community Pool, influencer program, live marketplace, and auto token distribution.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
              tab === id
                ? 'bg-[var(--accent)]/20 border-[var(--accent)]/40 text-[var(--accent)]'
                : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Link
              href="/dashboard/referrals"
              className="glass-panel rounded-xl p-4 hover:border-[var(--accent)]/40 transition-colors border border-transparent"
            >
              <Gift className="w-5 h-5 text-[var(--accent)] mb-2" />
              <p className="font-semibold text-sm">Refer &amp; Earn</p>
              <p className="text-[10px] text-[var(--muted)] mt-1">250K tokens + 5K XRG per referral</p>
            </Link>
            <button
              type="button"
              onClick={() => setTab('influencer')}
              className="glass-panel rounded-xl p-4 hover:border-violet-500/40 transition-colors border border-transparent text-left"
            >
              <Award className="w-5 h-5 text-violet-400 mb-2" />
              <p className="font-semibold text-sm">Influencer Program</p>
              <p className="text-[10px] text-[var(--muted)] mt-1">2–10% commission + token bonuses</p>
            </button>
            <button
              type="button"
              onClick={() => setTab('marketplace')}
              className="glass-panel rounded-xl p-4 hover:border-emerald-500/40 transition-colors border border-transparent text-left"
            >
              <Store className="w-5 h-5 text-emerald-400 mb-2" />
              <p className="font-semibold text-sm">Marketplace</p>
              <p className="text-[10px] text-emerald-400/90 mt-1">{listings.length} live listings</p>
            </button>
            <Link
              href="/dashboard/tasks"
              className="glass-panel rounded-xl p-4 hover:border-[var(--accent)]/40 transition-colors border border-transparent"
            >
              <Sparkles className="w-5 h-5 text-amber-400 mb-2" />
              <p className="font-semibold text-sm">Earn XRG</p>
              <p className="text-[10px] text-[var(--muted)] mt-1">Complete tasks for XRG rewards</p>
            </Link>
          </div>

          <section className="glass-panel rounded-2xl overflow-hidden border border-emerald-500/20">
            <div className="px-5 py-4 border-b border-[var(--card-border)] bg-gradient-to-r from-emerald-500/10 to-transparent">
              <h2 className="font-semibold flex items-center gap-2">
                <Globe className="w-5 h-5 text-emerald-400" />
                Community Pool
              </h2>
              <p className="text-xs text-[var(--muted)] mt-1">
                Request AI usage tokens when running low — not XRG. Max 50,000 per request, 2× per month.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[var(--muted)] text-xs">Pool balance</p>
                  <p className="text-xl font-bold text-emerald-400">{formatTokens(pool?.poolBalance ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[var(--muted)] text-xs">Your remaining tokens</p>
                  <p className="text-xl font-bold">{formatTokens(pool?.remainingTokens ?? 0)}</p>
                </div>
              </div>

              <div className="rounded-xl bg-white/5 p-4 space-y-2 text-xs">
                <p className="font-semibold">Your eligibility</p>
                <ul className="space-y-1 text-[var(--muted)]">
                  <li className="flex items-center gap-2">
                    {pool && pool.accountAgeDays >= 30 ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                    Account age: {pool?.accountAgeDays ?? 0} days (need 30+)
                  </li>
                  <li className="flex items-center gap-2">
                    {pool && pool.remainingTokens < 500_000 ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                    Remaining below 500K
                  </li>
                  <li className="flex items-center gap-2">
                    {pool && pool.requestsThisMonth < pool.maxRequestsPerMonth ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                    Requests this month: {pool?.requestsThisMonth ?? 0}/{pool?.maxRequestsPerMonth ?? 2}
                  </li>
                </ul>
              </div>

              <button
                type="button"
                disabled={!pool?.eligible || claiming}
                onClick={handleClaim}
                className={cn(
                  'w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-bold transition-colors',
                  pool?.eligible
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-white/10 text-[var(--muted)] cursor-not-allowed'
                )}
              >
                {claiming ? 'Processing…' : `Request ${formatTokens(pool?.requestAmount ?? 50000)} AI Tokens`}
              </button>

              {!pool?.eligible && pool?.eligibilityReasons[0] && (
                <p className="text-xs text-amber-400">{pool.eligibilityReasons[0]}</p>
              )}
            </div>
          </section>

          <button
            type="button"
            onClick={() => setTab('distribution')}
            className="w-full glass-panel rounded-xl p-4 flex items-center gap-3 hover:border-violet-500/40 border border-violet-500/20 text-left transition-colors"
          >
            <RefreshCw className="w-5 h-5 text-violet-400 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Auto Token Distribution</p>
              <p className="text-[10px] text-[var(--muted)]">
                50% auto-allocated monthly · {formatTokens(distribution?.unusedTokens ?? 0)} unused tokens
              </p>
            </div>
          </button>
        </>
      )}

      {tab === 'influencer' && <InfluencerPanel embedded />}

      {tab === 'marketplace' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {['all', 'template', 'component', 'automation', 'project', 'prompt'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setMarketCategory(cat)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[10px] font-semibold capitalize border',
                    marketCategory === cat
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'border-[var(--card-border)] text-[var(--muted)]'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500"
            >
              <Plus className="w-3.5 h-3.5" />
              Sell item
            </button>
          </div>

          {showCreate && (
            <form onSubmit={handleCreateListing} className="glass-panel rounded-xl p-4 space-y-3 border border-emerald-500/20">
              <h3 className="font-semibold text-sm">Create listing</h3>
              <input
                required
                placeholder="Title"
                value={newListing.title}
                onChange={(e) => setNewListing({ ...newListing, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
              />
              <textarea
                placeholder="Description"
                value={newListing.description}
                onChange={(e) => setNewListing({ ...newListing, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm min-h-[80px]"
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <select
                  value={newListing.category}
                  onChange={(e) => setNewListing({ ...newListing, category: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
                >
                  <option value="template">Template</option>
                  <option value="component">Component</option>
                  <option value="automation">Automation</option>
                  <option value="project">Project</option>
                  <option value="prompt">Prompt pack</option>
                </select>
                <input
                  type="number"
                  min={0}
                  placeholder="Price (XRG)"
                  value={newListing.priceXrg}
                  onChange={(e) => setNewListing({ ...newListing, priceXrg: Number(e.target.value) })}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
              >
                {creating ? 'Publishing…' : 'Publish listing'}
              </button>
            </form>
          )}

          {listings.length === 0 ? (
            <div className="glass-panel rounded-xl p-8 text-center text-sm text-[var(--muted)]">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No listings yet. Be the first to sell a template or project.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {listings.map((item) => (
                <div key={item.id} className="glass-panel rounded-xl p-4 border border-[var(--card-border)] space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{item.title}</p>
                      <p className="text-[10px] text-[var(--muted)]">by {item.sellerName} · {item.category}</p>
                    </div>
                    <span className="text-xs font-bold text-emerald-400 shrink-0">{formatTokens(item.priceXrg)} XRG</span>
                  </div>
                  <p className="text-xs text-[var(--muted)] line-clamp-2">{item.description}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-[var(--muted)]">{item.salesCount} sales</span>
                    {item.owned ? (
                      <span className="text-[10px] text-[var(--accent)]">Your listing</span>
                    ) : item.purchased ? (
                      <span className="text-[10px] text-emerald-400">Owned</span>
                    ) : (
                      <button
                        type="button"
                        disabled={buyingId === item.id}
                        onClick={() => handlePurchase(item.id)}
                        className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {buyingId === item.id ? 'Buying…' : 'Buy now'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'distribution' && distribution && (
        <section className="glass-panel rounded-2xl p-5 space-y-4 border border-violet-500/20">
          <div className="flex items-start gap-3">
            <RefreshCw className="w-6 h-6 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-lg">Auto Token Distribution</h2>
              <p className="text-sm text-[var(--muted)] mt-1">
                At month-end, 50% of unused tokens are automatically distributed across the platform.
                You choose the other 50% manually below.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-violet-500/10 p-3 border border-violet-500/20">
              <p className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Unused tokens</p>
              <p className="text-2xl font-bold text-violet-400">{formatTokens(distribution.unusedTokens)}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Auto allocation (50%)</p>
              <p className="text-2xl font-bold">{formatTokens(distribution.autoTotal)}</p>
            </div>
          </div>

          <div className="rounded-xl bg-white/5 p-4 space-y-2 text-xs">
            <p className="font-semibold text-sm">Automatic breakdown</p>
            <div className="grid sm:grid-cols-2 gap-2 text-[var(--muted)]">
              <p>Platform reserve: {formatTokens(distribution.autoPlatform)} (25%)</p>
              <p>Community pool: {formatTokens(distribution.autoCommunity)} (10%)</p>
              <p>Heavy users: {formatTokens(distribution.autoHeavyUsers)} (5%)</p>
              <p>Active builders: {formatTokens(distribution.autoBuilders)} (10%)</p>
            </div>
          </div>

          {distribution.alreadyDistributed ? (
            <p className="text-sm text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Distribution confirmed for this month.
            </p>
          ) : distribution.unusedTokens > 0 ? (
            <>
              <p className="text-sm font-medium">Manual options (50%)</p>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} className="rounded" />
                Rollover {formatTokens(distribution.rolloverAmount)} to next month (25%)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareCommunity}
                  onChange={(e) => setShareCommunity(e.target.checked)}
                  className="rounded"
                />
                Donate {formatTokens(distribution.shareAmount)} to Community Pool (25%)
              </label>
              <button
                type="button"
                disabled={distLoading}
                onClick={handleDistribution}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 disabled:opacity-50"
              >
                {distLoading ? 'Saving…' : 'Confirm distribution'}
              </button>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              No unused tokens right now. Auto distribution will apply when you have remaining tokens at month-end.
            </p>
          )}
        </section>
      )}

      <section className="glass-panel rounded-2xl p-5 border border-dashed border-[var(--card-border)]">
        <h2 className="font-semibold text-sm flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-[var(--accent)]" />
          Heavy Users &amp; Active Builders
        </h2>
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          Top 5% heavy users earn +10% AI tokens and XRG monthly. Top 10% active builders get +10% tokens, 5% subscription discount, and reduced marketplace fees.
        </p>
      </section>
    </div>
  );
}
