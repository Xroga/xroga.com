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

export function InfluencerView() {
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
    toast.success('Referral link copied');
  }

  if (loading) {
    return <Skeleton height={400} baseColor="#1a1a2e" highlightColor="#2a2a3e" />;
  }

  if (!dash) {
    return (
      <div className="max-w-3xl mx-auto glass-panel rounded-xl p-8 text-center text-sm text-[var(--muted)]">
        Influencer dashboard unavailable. Try again shortly.
      </div>
    );
  }

  const isApproved = dash.status === 'approved';
  const isPending = dash.status === 'pending';

  return (
    <div className="max-w-3xl mx-auto space-y-6 universe-fade-in">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Award className="w-7 h-7 text-[var(--accent)]" />
          Influencer Program
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Earn commission on subscription revenue + higher token bonuses for every referral.
        </p>
      </header>

      {isApproved && dash.tier && (
        <section className="glass-panel rounded-2xl p-5 border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-transparent">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-[var(--muted)] uppercase tracking-wide">Your tier</p>
              <p className={cn('text-2xl font-bold capitalize flex items-center gap-2', TIER_COLORS[dash.tier])}>
                <Star className="w-6 h-6" />
                {dash.tier}
              </p>
              <p className="text-sm text-[var(--muted)] mt-1">
                {dash.commissionPercent}% commission · {formatTokens(dash.followerCount)} followers
              </p>
              {dash.nextTier && (
                <p className="text-xs text-amber-400/90 mt-2">
                  {dash.nextTierFollowers!.toLocaleString()} followers to reach {dash.nextTier}
                </p>
              )}
            </div>
            {dash.shareUrl && (
              <div className="space-y-2 min-w-[200px]">
                <p className="text-[10px] text-[var(--muted)]">Your referral link</p>
                <div className="flex gap-1">
                  <input
                    readOnly
                    value={dash.shareUrl}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-white/5 border border-[var(--card-border)] text-[10px] font-mono truncate"
                  />
                  <button type="button" onClick={copyLink} className="p-1.5 rounded-lg bg-[var(--accent)] text-white">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] text-[var(--muted)]">Total referrals</p>
              <p className="text-xl font-bold">{dash.stats.totalReferrals}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] text-[var(--muted)]">Active</p>
              <p className="text-xl font-bold text-emerald-400">{dash.stats.activeReferrals}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] text-[var(--muted)]">Monthly commission</p>
              <p className="text-xl font-bold">${dash.stats.monthlyCommissionUsd.toFixed(2)}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] text-[var(--muted)]">Total earned</p>
              <p className="text-xl font-bold">${dash.stats.totalCommissionUsd.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mt-3 text-sm">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--accent)]" />
              AI tokens earned: {formatTokens(dash.stats.aiTokensEarned)}
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              XRG earned: {formatTokens(dash.stats.xrgTokensEarned)}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {dash.perks.map((perk) => (
              <span key={perk} className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
                {perk}
              </span>
            ))}
          </div>
        </section>
      )}

      {isPending && (
        <div className="glass-panel rounded-xl p-5 flex items-center gap-3 border border-amber-500/20">
          <Clock className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Application under review</p>
            <p className="text-xs text-[var(--muted)]">We review influencer applications within 48 hours.</p>
          </div>
        </div>
      )}

      {dash.status === 'none' && (
        <form onSubmit={handleApply} className="glass-panel rounded-xl p-5 space-y-4 border border-[var(--card-border)]">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            Apply to become an influencer
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--muted)]">Follower count</label>
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
              <label className="text-xs text-[var(--muted)]">Username slug (optional)</label>
              <input
                placeholder="your_username"
                value={form.usernameSlug}
                onChange={(e) => setForm({ ...form, usernameSlug: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
              />
            </div>
          </div>
          <textarea
            placeholder="Tell us about your audience and content (optional)"
            value={form.applicationNote}
            onChange={(e) => setForm({ ...form, applicationNote: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm min-h-[80px]"
          />
          <button
            type="submit"
            disabled={applying}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-50"
          >
            {applying ? 'Submitting…' : 'Submit application'}
          </button>
        </form>
      )}

      <section className="glass-panel rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm">Influencer tiers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="text-left py-2 pr-2">Tier</th>
                <th className="text-left py-2 pr-2">Followers</th>
                <th className="text-left py-2 pr-2">Commission</th>
                <th className="text-left py-2 pr-2">AI tokens</th>
                <th className="text-left py-2">XRG</th>
              </tr>
            </thead>
            <tbody>
              {dash.tiers.map((t) => (
                <tr key={t.tier} className="border-b border-[var(--card-border)]/40">
                  <td className={cn('py-2 pr-2 capitalize font-semibold', TIER_COLORS[t.tier])}>{t.tier}</td>
                  <td className="py-2 pr-2 text-[var(--muted)]">
                    {t.minFollowers.toLocaleString()}
                    {t.maxFollowers ? `–${t.maxFollowers.toLocaleString()}` : '+'}
                  </td>
                  <td className="py-2 pr-2">{t.commissionPercent}%</td>
                  <td className="py-2 pr-2">{formatTokens(t.aiTokensOneTime)}</td>
                  <td className="py-2">{formatTokens(t.xrgTokensOneTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-[var(--muted)]">
          New users from influencers receive 100K AI tokens + 2K XRG instantly.
        </p>
      </section>

      <div className="flex flex-wrap gap-3 text-xs">
        <Link href="/dashboard/referrals" className="flex items-center gap-1 text-[var(--accent)] hover:underline">
          Regular referral program <ExternalLink className="w-3 h-3" />
        </Link>
        <Link href="/dashboard/community" className="flex items-center gap-1 text-[var(--muted)] hover:text-[var(--foreground)]">
          Community hub
        </Link>
      </div>

      {isApproved && (
        <p className="text-xs text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Commission paid monthly while referred users stay subscribed.
        </p>
      )}
    </div>
  );
}
