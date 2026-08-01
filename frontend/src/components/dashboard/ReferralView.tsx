'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Gift,
  Copy,
  Share2,
  Users,
  Coins,
  Zap,
  Percent,
  Check,
  ExternalLink,
} from 'lucide-react';
import { api, type ReferralSummary } from '@/lib/api';
import toast from 'react-hot-toast';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function ReferralView() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.referrals
      .summary()
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function copyText(text: string, kind: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast.success(kind === 'code' ? 'Code copied' : 'Link copied');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Copy failed');
    }
  }

  async function shareLink(url: string) {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join Xroga AI',
          text: 'Build with Xroga AI using my referral link.',
          url,
        });
      } else {
        await copyText(url, 'link');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toast.error('Share failed');
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton height={36} width={240} baseColor="var(--surface-inset)" highlightColor="var(--surface-raised)" />
        <Skeleton height={200} baseColor="var(--surface-inset)" highlightColor="var(--surface-raised)" />
      </div>
    );
  }

  const profile = summary?.profile;
  const shareUrl = profile?.shareUrl ?? '';

  return (
    <div className="max-w-3xl mx-auto space-y-6 universe-fade-in">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="w-7 h-7 text-[var(--accent)]" />
          Refer &amp; Earn
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Share your referral link. Qualification and earned rewards appear only after server-side evidence is verified.
        </p>
      </header>

      <section className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4 border border-[var(--accent)]/20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Your referral code</p>
          <p className="text-2xl font-bold font-mono tracking-wide mt-1">{profile?.code ?? '—'}</p>
        </div>

        <div className="rounded-xl bg-white/5 p-3 text-sm break-all border border-[var(--card-border)]">
          {shareUrl}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => profile?.code && copyText(profile.code, 'code')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] text-xs font-semibold hover:bg-[var(--accent)]/25"
          >
            {copied === 'code' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            Copy code
          </button>
          <button
            type="button"
            onClick={() => shareLink(shareUrl)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold hover:opacity-90"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share link
          </button>
        </div>
      </section>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="glass-panel rounded-xl p-4">
          <Users className="w-4 h-4 text-[var(--accent)] mb-2" />
          <p className="text-2xl font-bold">{profile?.referralCount ?? 0}</p>
          <p className="text-xs text-[var(--muted)]">Total referrals</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <Zap className="w-4 h-4 text-amber-400 mb-2" />
          <p className="text-2xl font-bold">{formatTokens(summary?.totalAiTokensEarned ?? 0)}</p>
          <p className="text-xs text-[var(--muted)]">AI tokens earned</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <Coins className="w-4 h-4 text-violet-400 mb-2" />
          <p className="text-2xl font-bold">{(summary?.totalXrgEarned ?? 0).toLocaleString()}</p>
          <p className="text-xs text-[var(--muted)]">XRG earned</p>
        </div>
      </div>

      <section className="glass-panel rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Percent className="w-4 h-4 text-[var(--accent)]" />
          Your discount
        </h2>
        <p className="text-sm">
          Current: <strong>{profile?.discountPercent ?? 0}%</strong>
          {summary && summary.nextDiscountPercent < 15 && (
            <span className="text-[var(--muted)]"> · Next referral: {summary.nextDiscountPercent}%</span>
          )}
        </p>
        <p className="text-xs text-[var(--muted)]">+1% per referral, maximum 15% off your subscription.</p>
      </section>

      <section className="glass-panel rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold text-sm">Referral evidence</h2>
        <ul className="text-xs text-[var(--muted)] space-y-1.5">
          <li>Applying a code records attribution; it does not automatically qualify a reward.</li>
          <li>Self-referrals and duplicate referred accounts are rejected.</li>
          <li>Only durable rewarded records are included in the totals above.</li>
          <li>Pending or suspicious referrals remain uncredited until independently qualified.</li>
        </ul>
      </section>

      {(summary?.referrals.length ?? 0) > 0 && (
        <section className="glass-panel rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-sm">Your referrals</h2>
          <ul className="space-y-2">
            {summary?.referrals.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between text-sm py-2 border-b border-[var(--card-border)]/40 last:border-0"
              >
                <span>{r.referredLabel}</span>
                <span className="text-xs text-[var(--muted)]">
                  {r.instantRewarded ? '✅ Instant' : '⏳ Pending'}
                  {r.retentionReleased ? ' · 3mo bonus' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-[var(--muted)]">
        <Link href="/dashboard/community" className="text-[var(--accent)] hover:underline inline-flex items-center gap-1">
          Community Pool <ExternalLink className="w-3 h-3" />
        </Link>
      </p>
    </div>
  );
}
