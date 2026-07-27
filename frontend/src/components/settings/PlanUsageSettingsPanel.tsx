'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, CreditCard, Gauge, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { SubscriptionManagePanel } from '@/components/billing/SubscriptionManagePanel';

type Entitlement = Awaited<ReturnType<typeof api.billing.entitlement>>;

function dateTime(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Unavailable';
}

export function PlanUsageSettingsPanel() {
  const [status, setStatus] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try { setStatus(await api.billing.entitlement()); }
    catch { setStatus(null); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  async function activate() {
    setSaving(true);
    try {
      await api.billing.activatePromotion();
      await refresh();
      toast.success('Your complete 30-day promotional period is active.');
    } catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }

  async function choosePacing(pacing: 'balanced_month' | 'full_access') {
    const confirmed = pacing === 'full_access'
      ? window.confirm('Full Access makes your remaining monthly AI capacity available now. Large or repeated builds may use it before the end of your 30-day period. Completed work will be preserved when the included capacity is used.')
      : true;
    if (!confirmed) return;
    setSaving(true);
    try {
      await api.billing.setPacing(pacing, confirmed);
      await refresh();
      toast.success(pacing === 'full_access' ? 'Full Access pacing enabled.' : 'Balanced Month pacing selected.');
    } catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <h2 className="font-semibold text-lg flex items-center gap-2"><CreditCard className="w-5 h-5 text-[var(--accent)]" />Plan &amp; Usage</h2>
      <div className="p-5 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-semibold text-lg">Xroga AI</p><p className="text-sm text-[var(--muted)]">$19 per 30-day billing period · all features</p></div>
          <span className="rounded-full border border-[var(--card-border)] px-3 py-1 text-xs capitalize">{loading ? 'Loading…' : status?.state.replaceAll('_', ' ') ?? 'Unavailable'}</span>
        </div>

        {status?.state === 'promotional_eligible' && (
          <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="font-semibold">Complete 30-day launch promotion</p>
            <p className="text-sm text-[var(--muted)] mt-1">Activate by 30 August 2026. No card and no automatic charge.</p>
            <button type="button" onClick={activate} disabled={saving} className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Activating…' : 'Activate promotion'}</button>
          </div>
        )}

        {status?.startsAt && (
          <div className="grid sm:grid-cols-2 gap-3 mt-5 text-sm">
            <div className="rounded-lg border border-[var(--card-border)] p-3"><CalendarClock className="w-4 h-4 text-[var(--accent)] mb-2" /><p className="text-[var(--muted)]">Cycle ends</p><p className="font-medium mt-1">{dateTime(status.endsAt)}</p></div>
            <div className="rounded-lg border border-[var(--card-border)] p-3"><Gauge className="w-4 h-4 text-[var(--accent)] mb-2" /><p className="text-[var(--muted)]">Monthly capacity remaining</p><p className="font-medium mt-1">{status.capacityRemainingPercent == null ? 'Unavailable' : `${status.capacityRemainingPercent}%`}</p></div>
            <div className="rounded-lg border border-[var(--card-border)] p-3"><ShieldCheck className="w-4 h-4 text-[var(--accent)] mb-2" /><p className="text-[var(--muted)]">Available now</p><p className="font-medium mt-1">{status.availableNowPercent == null ? 'Unavailable' : `${status.availableNowPercent}%`}</p></div>
            <div className="rounded-lg border border-[var(--card-border)] p-3"><CalendarClock className="w-4 h-4 text-[var(--accent)] mb-2" /><p className="text-[var(--muted)]">Next unlock</p><p className="font-medium mt-1">{dateTime(status.nextUnlockAt)}</p></div>
          </div>
        )}

        {status?.pacing && (
          <div className="mt-5 border-t border-[var(--card-border)] pt-4">
            <p className="text-sm font-semibold">Usage pacing</p>
            <p className="text-xs text-[var(--muted)] mt-1">Pacing changes availability timing only. It does not change model quality.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" disabled={saving || status.pacing === 'balanced_month'} onClick={() => void choosePacing('balanced_month')} className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-semibold disabled:opacity-50">Balanced Month</button>
              <button type="button" disabled={saving || status.pacing === 'full_access'} onClick={() => void choosePacing('full_access')} className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-semibold disabled:opacity-50">Full Access…</button>
            </div>
          </div>
        )}

        {!loading && !status && <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">Billing state is unavailable. No active or successful status is being assumed.</p>}
      </div>
      <SubscriptionManagePanel />
    </div>
  );
}
