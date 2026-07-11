'use client';

import { useEffect, useState } from 'react';
import {
  TrendingUp,
  Users,
  DollarSign,
  Zap,
  Globe,
  BarChart3,
  Target,
  ShoppingBag,
} from 'lucide-react';
import { api, type AnalyticsDashboard } from '@/lib/api';
import { cn } from '@/lib/utils';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className={cn('glass-panel rounded-xl p-4 border border-[var(--card-border)] bg-gradient-to-br', color)}>
      <Icon className="w-4 h-4 text-[var(--accent)] mb-2" />
      <p className="text-[10px] text-[var(--muted)] uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-[var(--muted)] mt-1">{sub}</p>}
    </div>
  );
}

function ProgressBar({ value, target, label }: { value: number; target: number; label: string }) {
  const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
  const met = value >= target;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--muted)]">{label}</span>
        <span className={cn('font-mono', met ? 'text-emerald-400' : 'text-[var(--foreground)]')}>
          {(value * 100).toFixed(0)}% / {(target * 100).toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', met ? 'bg-emerald-500' : 'bg-[var(--accent)]')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.analytics
      .dashboard()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton height={40} width={200} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={100} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto glass-panel rounded-xl p-8 text-center text-sm text-[var(--muted)]">
        Analytics temporarily unavailable. Try again shortly.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 universe-fade-in">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-[var(--accent)]" />
          Analytics &amp; Insights
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          User behavior, platform performance, revenue, and community metrics.
        </p>
      </header>

      <section>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-[var(--accent)]" />
          Your Activity
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={Zap} label="Tokens used" value={formatNum(data.user.tokensUsed)} sub={`${data.user.percentUsed.toFixed(0)}% of quota`} color="from-amber-500/10 to-orange-500/5" />
          <MetricCard icon={Target} label="Days active" value={String(data.user.daysActiveThisMonth)} sub="This month" color="from-blue-500/10 to-cyan-500/5" />
          <MetricCard icon={Globe} label="Referrals" value={String(data.user.referralCount)} sub="Total referred" color="from-violet-500/10 to-purple-500/5" />
          <MetricCard icon={TrendingUp} label="XRG balance" value={formatNum(data.user.xrgBalance)} sub={`${data.user.projectsCount} projects`} color="from-emerald-500/10 to-teal-500/5" />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-[var(--accent)]" />
          Platform Metrics
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={Users} label="DAU / MAU" value={`${data.platform.dau} / ${data.platform.mau}`} sub={`Ratio ${(data.platform.dauMauRatio * 100).toFixed(0)}%`} color="from-blue-500/10 to-cyan-500/5" />
          <MetricCard icon={Users} label="Total users" value={formatNum(data.platform.totalUsers)} color="from-violet-500/10 to-purple-500/5" />
          <MetricCard icon={Zap} label="AI tokens consumed" value={formatNum(data.platform.totalAiTokensConsumed)} sub={`Avg ${formatNum(data.platform.avgTokensPerUser)}/user`} color="from-amber-500/10 to-orange-500/5" />
          <MetricCard icon={ShoppingBag} label="Marketplace" value={String(data.platform.marketplaceListings)} sub="Active listings" color="from-emerald-500/10 to-teal-500/5" />
        </div>
      </section>

      <section className="glass-panel rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          Revenue Dashboard
        </h2>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-[var(--muted)] text-xs">Your plan</p>
            <p className="font-bold capitalize">{data.revenue.planTier}</p>
          </div>
          <div>
            <p className="text-[var(--muted)] text-xs">MRR (platform est.)</p>
            <p className="font-bold text-emerald-400">${formatNum(data.platform.mrrUsd)}</p>
          </div>
          <div>
            <p className="text-[var(--muted)] text-xs">ARR (platform est.)</p>
            <p className="font-bold">${formatNum(data.platform.arrUsd)}</p>
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Target className="w-4 h-4 text-[var(--accent)]" />
          Key Targets
        </h2>
        <div className="space-y-3">
          <ProgressBar value={data.platform.dauMauRatio} target={data.targets.dauMauTarget} label="DAU/MAU engagement" />
          <ProgressBar
            value={Math.min(1, data.user.tokensUsed / data.targets.tokenUsageTarget)}
            target={1}
            label="Token usage vs 5M/user/month target"
          />
          <ProgressBar
            value={Math.min(1, data.user.referralCount / data.targets.referralRateTarget)}
            target={1}
            label="Referral rate (2/user target)"
          />
        </div>
      </section>

      <section className="glass-panel rounded-xl p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-emerald-400" />
          Community Dashboard
        </h2>
        <div className="grid sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[var(--muted)] text-xs">Pool balance</p>
            <p className="font-bold">{formatNum(data.community.poolBalance)}</p>
          </div>
          <div>
            <p className="text-[var(--muted)] text-xs">My referrals</p>
            <p className="font-bold">{data.community.myReferrals}</p>
          </div>
          <div>
            <p className="text-[var(--muted)] text-xs">Marketplace sales</p>
            <p className="font-bold">{data.community.marketplaceSales}</p>
          </div>
          <div>
            <p className="text-[var(--muted)] text-xs">Purchases</p>
            <p className="font-bold">{data.community.marketplacePurchases}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
