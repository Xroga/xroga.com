'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Copy,
  ExternalLink,
  Star,
  TrendingUp,
  Users,
  Zap,
  CheckCircle2,
  Clock,
  Share2,
} from 'lucide-react';
import { api, type InfluencerDashboard } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

const TIER_COLORS: Record<string, string> = {
  bronze: 'text-amber-600',
  silver: 'text-slate-300',
  gold: 'text-yellow-400',
  platinum: 'text-cyan-300',
  diamond: 'text-violet-300',
};

const TIER_BG: Record<string, string> = {
  bronze: 'from-amber-600/10 to-amber-900/5 border-amber-600/20',
  silver: 'from-slate-400/10 to-slate-600/5 border-slate-400/20',
  gold: 'from-yellow-500/10 to-amber-600/5 border-yellow-500/25',
  platinum: 'from-cyan-400/10 to-blue-600/5 border-cyan-400/20',
  diamond: 'from-violet-500/10 to-purple-600/5 border-violet-400/25',
};

interface InfluencerPanelProps {
  embedded?: boolean;
}

export function InfluencerPanel({ embedded }: InfluencerPanelProps) {
  const [dash, setDash] = useState<InfluencerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [form, setForm] = useState({ followerCount: 5000, usernameSlug: '', applicationNote: '' });

  const load = useCallback(() => {
    setLoading(true);
    api.influencer
      .dashboard()
      .then(setDash)
      .catch(() => setDash(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setApplying(true);
    try {
      const result = await api.influencer.apply({
        followerCount: form.followerCount,
        usernameSlug: form.usernameSlug || undefined,
        applicationNote: form.applicationNote || undefined,
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
      setApplying(false);
    }
  }

  function copyLink() {
    if (!dash?.shareUrl) return;
    void navigator.clipboard.writeText(dash.shareUrl);
    toast.success('Influencer link copied');
  }

  if (loading) {
    return <Skeleton height={embedded ? 320 : 400} baseColor="#1a1a2e" highlightColor="#2a2a3e" />;
  }

  if (!dash) {
    return (
      <div className="glass-panel rounded-xl p-8 text-center text-sm text-[var(--muted)]">
        Influencer dashboard unavailable. Try again shortly.
      </div>
    );
  }

  const isApproved = dash.status === 'approved';
  const isPending = dash.status === 'pending';
  const previewTier = dash.tiers.find((t) => t.tier === (dash.tier ?? 'gold')) ?? dash.tiers[2];

  return (
    <div className={cn('space-y-5 universe-fade-in', !embedded && 'max-w-3xl mx-auto')}>
      {!embedded && (
        <header>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Award className="w-7 h-7 text-[var(--accent)]" />
            Influencer Program
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Earn commission on subscription revenue + higher token bonuses for every referral.
          </p>
        </header>
      )}

      {embedded && (
        <div className="glass-panel rounded-xl p-4 border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-yellow-500/5">
          <div className="flex items-start gap-3">
            <Award className="w-6 h-6 text-violet-400 shrink-0" />
            <div>
              <h2 className="font-semibold text-base">Influencer Program</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                2–10% commission on subscriptions · up to 3M AI tokens + 50K XRG per referral · exclusive perks
              </p>
            </div>
          </div>
        </div>
      )}

      {isApproved && dash.tier && (
        <section
          className={cn(
            'glass-panel rounded-2xl p-5 border bg-gradient-to-br',
            TIER_BG[dash.tier] ?? TIER_BG.gold
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-[var(--muted)] uppercase tracking-wide">Your tier</p>
              <p className={cn('text-2xl font-bold capitalize flex items-center gap-2', TIER_COLORS[dash.tier])}>
                <Star className="w-6 h-6 fill-current" />
                {dash.tier}
              </p>
              <p className="text-sm text-[var(--muted)] mt-1">
                {dash.commissionPercent}% commission · {dash.followerCount.toLocaleString()} followers
              </p>
              {dash.nextTier && dash.nextTierFollowers && (
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-[10px] text-[var(--muted)]">
                    <span>Progress to {dash.nextTier}</span>
                    <span>{Math.min(100, Math.round((dash.followerCount / dash.nextTierFollowers) * 100))}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden w-full max-w-xs">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-violet-500"
                      style={{ width: `${Math.min(100, (dash.followerCount / dash.nextTierFollowers) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-amber-400/90">
                    {(dash.nextTierFollowers - dash.followerCount).toLocaleString()} followers to {dash.nextTier}
                  </p>
                </div>
              )}
            </div>
            {dash.shareUrl && (
              <div className="space-y-2 min-w-[220px] flex-1 max-w-sm">
                <p className="text-[10px] text-[var(--muted)] flex items-center gap-1">
                  <Share2 className="w-3 h-3" /> Your influencer link
                </p>
                <div className="flex gap-1">
                  <input
                    readOnly
                    value={dash.shareUrl}
                    className="flex-1 px-2 py-2 rounded-lg bg-black/30 border border-[var(--card-border)] text-[10px] font-mono truncate"
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    className="px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-5">
            <div className="rounded-xl bg-black/20 p-3 text-center sm:text-left">
              <p className="text-[10px] text-[var(--muted)]">Total referrals</p>
              <p className="text-xl font-bold">{dash.stats.totalReferrals}</p>
            </div>
            <div className="rounded-xl bg-black/20 p-3 text-center sm:text-left">
              <p className="text-[10px] text-[var(--muted)]">Active</p>
              <p className="text-xl font-bold text-emerald-400">{dash.stats.activeReferrals}</p>
            </div>
            <div className="rounded-xl bg-black/20 p-3 text-center sm:text-left">
              <p className="text-[10px] text-[var(--muted)]">Pending</p>
              <p className="text-xl font-bold text-amber-400">{dash.stats.pendingReferrals}</p>
            </div>
            <div className="rounded-xl bg-black/20 p-3 text-center sm:text-left">
              <p className="text-[10px] text-[var(--muted)]">Monthly $</p>
              <p className="text-xl font-bold">${dash.stats.monthlyCommissionUsd.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 mt-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2 rounded-lg bg-black/15 px-3 py-2">
              <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Total commission: <strong>${dash.stats.totalCommissionUsd.toFixed(2)}</strong></span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-black/15 px-3 py-2">
              <Zap className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>AI earned: <strong>{formatTokens(dash.stats.aiTokensEarned)}</strong></span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-black/15 px-3 py-2">
              <Star className="w-4 h-4 text-yellow-400 shrink-0" />
              <span>XRG earned: <strong>{formatTokens(dash.stats.xrgTokensEarned)}</strong></span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {dash.perks.map((perk) => (
              <span
                key={perk}
                className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
              >
                {perk}
              </span>
            ))}
          </div>
        </section>
      )}

      {isPending && (
        <div className="glass-panel rounded-xl p-5 flex items-center gap-3 border border-amber-500/20">
          <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
          <div>
            <p className="font-semibold text-sm">Application under review</p>
            <p className="text-xs text-[var(--muted)]">We review influencer applications within 48 hours. You&apos;ll get an email when approved.</p>
          </div>
        </div>
      )}

      {dash.status === 'none' && (
        <>
          <div className="grid sm:grid-cols-3 gap-2 text-center">
            {[
              { label: 'Commission', value: '2–10%', sub: 'per subscription' },
              { label: 'AI tokens', value: 'Up to 3M', sub: 'per referral' },
              { label: 'XRG bonus', value: 'Up to 50K', sub: 'per referral' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="glass-panel rounded-xl p-3 border border-violet-500/15">
                <p className="text-[10px] text-[var(--muted)]">{label}</p>
                <p className="text-lg font-bold text-violet-400">{value}</p>
                <p className="text-[9px] text-[var(--muted)]">{sub}</p>
              </div>
            ))}
          </div>

          <form onSubmit={handleApply} className="glass-panel rounded-xl p-5 space-y-4 border border-[var(--card-border)]">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-400" />
              Apply to become an influencer
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Based on your follower count you&apos;ll be placed in a tier ({previewTier.commissionPercent}% commission at signup preview).
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--muted)]">Follower count *</label>
                <input
                  type="number"
                  min={1000}
                  required
                  value={form.followerCount}
                  onChange={(e) => setForm({ ...form, followerCount: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--muted)]">Custom link slug</label>
                <input
                  placeholder="your_username"
                  value={form.usernameSlug}
                  onChange={(e) => setForm({ ...form, usernameSlug: e.target.value.replace(/[^a-z0-9-_]/gi, '').toLowerCase() })}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm font-mono"
                />
                <p className="text-[9px] text-[var(--muted)] mt-0.5">xroga.ai/influencer/your_username</p>
              </div>
            </div>
            <textarea
              placeholder="Tell us about your audience, platforms, and content niche (optional)"
              value={form.applicationNote}
              onChange={(e) => setForm({ ...form, applicationNote: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm min-h-[80px]"
            />
            <button
              type="submit"
              disabled={applying}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-[var(--accent)] text-white text-sm font-bold disabled:opacity-50"
            >
              {applying ? 'Submitting…' : 'Submit application'}
            </button>
          </form>
        </>
      )}

      <section className="glass-panel rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Award className="w-4 h-4 text-yellow-400" />
          Influencer tiers &amp; rewards
        </h2>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="text-left py-2 px-1">Tier</th>
                <th className="text-left py-2 px-1">Followers</th>
                <th className="text-left py-2 px-1">Commission</th>
                <th className="text-left py-2 px-1">AI / referral</th>
                <th className="text-left py-2 px-1">XRG</th>
              </tr>
            </thead>
            <tbody>
              {dash.tiers.map((t) => (
                <tr
                  key={t.tier}
                  className={cn(
                    'border-b border-[var(--card-border)]/40',
                    dash.tier === t.tier && isApproved && 'bg-yellow-500/5'
                  )}
                >
                  <td className={cn('py-2 px-1 capitalize font-semibold', TIER_COLORS[t.tier])}>{t.tier}</td>
                  <td className="py-2 px-1 text-[var(--muted)]">
                    {t.minFollowers.toLocaleString()}
                    {t.maxFollowers ? `–${t.maxFollowers.toLocaleString()}` : '+'}
                  </td>
                  <td className="py-2 px-1 font-medium">{t.commissionPercent}%</td>
                  <td className="py-2 px-1">{formatTokens(t.aiTokensOneTime)}</td>
                  <td className="py-2 px-1">{formatTokens(t.xrgTokensOneTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-[10px] text-emerald-400">
          New users from your link get <strong>100K AI tokens + 2K XRG</strong> instantly — on top of your tier rewards.
        </div>
      </section>

      <div className="flex flex-wrap gap-3 text-xs">
        <Link href="/dashboard/referrals" className="flex items-center gap-1 text-[var(--accent)] hover:underline">
          Regular referral program <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {isApproved && (
        <p className="text-xs text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Commission paid monthly while referred users stay subscribed. ROI 15×+ for the platform.
        </p>
      )}
    </div>
  );
}
