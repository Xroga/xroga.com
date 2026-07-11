'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Globe,
  Gift,
  Sparkles,
  Zap,
  CheckCircle2,
  XCircle,
  Users,
  Store,
  PieChart,
} from 'lucide-react';
import { api, type CommunityPoolStatus, type TokenDistributionPreview } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function CommunityView() {
  const [pool, setPool] = useState<CommunityPoolStatus | null>(null);
  const [distribution, setDistribution] = useState<TokenDistributionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [distLoading, setDistLoading] = useState(false);
  const [rollover, setRollover] = useState(true);
  const [shareCommunity, setShareCommunity] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.community.pool(), api.tokenDistribution.preview()])
      .then(([p, d]) => {
        setPool(p);
        setDistribution(d);
      })
      .catch(() => {
        setPool(null);
        setDistribution(null);
      })
      .finally(() => setLoading(false));
  }, []);

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

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton height={40} width={280} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
        <Skeleton height={220} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 universe-fade-in">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe className="w-7 h-7 text-[var(--accent)]" />
          Community
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Community Pool, referrals, token distribution, and marketplace — help builders in need.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Link
          href="/dashboard/referrals"
          className="glass-panel rounded-xl p-4 hover:border-[var(--accent)]/40 transition-colors border border-transparent"
        >
          <Gift className="w-5 h-5 text-[var(--accent)] mb-2" />
          <p className="font-semibold text-sm">Refer &amp; Earn</p>
          <p className="text-[10px] text-[var(--muted)] mt-1">250K tokens + 5K XRG per referral</p>
        </Link>
        <div className="glass-panel rounded-xl p-4 opacity-90">
          <Users className="w-5 h-5 text-violet-400 mb-2" />
          <p className="font-semibold text-sm">Discover</p>
          <p className="text-[10px] text-amber-400/90 mt-1">Builder creations — coming soon</p>
        </div>
        <div className="glass-panel rounded-xl p-4 opacity-90">
          <Store className="w-5 h-5 text-emerald-400 mb-2" />
          <p className="font-semibold text-sm">Marketplace</p>
          <p className="text-[10px] text-amber-400/90 mt-1">Sell projects &amp; templates — coming soon</p>
        </div>
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

          {(pool?.history.length ?? 0) > 0 && (
            <div className="pt-2 border-t border-[var(--card-border)]/40">
              <p className="text-xs font-semibold mb-2">Request history</p>
              <ul className="space-y-1 text-xs text-[var(--muted)]">
                {pool?.history.slice(0, 5).map((h) => (
                  <li key={h.id}>
                    {h.status === 'approved' ? '✅' : '❌'} {formatTokens(h.amount)} —{' '}
                    {new Date(h.createdAt).toLocaleDateString()}
                    {h.reason ? ` (${h.reason})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {distribution && distribution.unusedTokens > 0 && !distribution.alreadyDistributed && (
        <section className="glass-panel rounded-2xl p-5 space-y-4 border border-violet-500/20">
          <h2 className="font-semibold flex items-center gap-2">
            <PieChart className="w-5 h-5 text-violet-400" />
            Distribute unused tokens
          </h2>
          <p className="text-sm text-[var(--muted)]">
            You have {formatTokens(distribution.unusedTokens)} unused tokens. Choose manual options (50%) — automatic 50% is fixed.
          </p>
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
          <div className="text-[10px] text-[var(--muted)] space-y-0.5">
            <p>Automatic: Platform {formatTokens(distribution.autoPlatform)} · Pool {formatTokens(distribution.autoCommunity)} · Heavy users {formatTokens(distribution.autoHeavyUsers)} · Builders {formatTokens(distribution.autoBuilders)}</p>
          </div>
          <button
            type="button"
            disabled={distLoading}
            onClick={handleDistribution}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 disabled:opacity-50"
          >
            {distLoading ? 'Saving…' : 'Confirm distribution'}
          </button>
        </section>
      )}

      <section className="glass-panel rounded-2xl p-5 border border-dashed border-[var(--card-border)]">
        <h2 className="font-semibold text-sm flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-[var(--accent)]" />
          Heavy Users &amp; Active Builders
        </h2>
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          Top 5% heavy users earn +10% AI tokens and XRG monthly. Top 10% active builders get +10% tokens, 5% subscription discount, and reduced marketplace fees. Identification coming soon.
        </p>
      </section>
    </div>
  );
}
