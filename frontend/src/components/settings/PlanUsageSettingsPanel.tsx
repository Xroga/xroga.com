'use client';

import { PanelLoader } from '@/components/ui/PanelLoader';
import { useEffect, useState, type ReactNode } from 'react';
import { CalendarClock, CreditCard, Gauge, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { SubscriptionManagePanel } from '@/components/billing/SubscriptionManagePanel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { SettingsCard, SettingsDivider, SettingsPanelHeader, SettingsStack } from '@/components/settings/SettingsPrimitives';

type BillingStatus = Awaited<ReturnType<typeof api.billing.status>>;

function dateTime(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Unavailable';
}

const STATE_TONE: Record<string, 'success' | 'accent' | 'warning' | 'neutral'> = {
  paid_active: 'success',
  promotional_active: 'success',
  free_active: 'neutral',
};

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-token-md border border-[var(--border-subtle)] p-3">
      <span className="mb-2 flex text-[var(--accent)]">{icon}</span>
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

export function PlanUsageSettingsPanel() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setStatus(await api.billing.status());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function choosePacing(pacing: 'balanced_month' | 'full_access') {
    if (saving) return;
    const confirmed =
      pacing === 'full_access'
        ? window.confirm(
            'Full Access makes your remaining monthly AI capacity available now. Large or repeated builds may use it before the end of your 30-day period. Completed work will be preserved when the included capacity is used.',
          )
        : true;
    if (!confirmed) return;
    setSaving(true);
    try {
      await api.billing.setPacing(pacing, confirmed);
      await refresh();
      toast.success(pacing === 'full_access' ? 'Full Access pacing enabled.' : 'Balanced Month pacing selected.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsStack>
      <SettingsPanelHeader
        icon={<CreditCard className="h-4 w-4" aria-hidden="true" />}
        title="Plan & Usage"
        description="Your current plan, real usage, and billing controls."
      />

      {loading ? (
        <PanelLoader height={220} />
      ) : (
        <SettingsCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-[var(--text-primary)]">{status?.publicPlanName ?? 'Plan unavailable'}</p>
              <p className="text-sm text-[var(--text-secondary)]">{status?.isPaid ? '$25/month' : '$0 · no card required'}</p>
            </div>
            <Badge tone={status ? STATE_TONE[status.entitlement.state] ?? 'neutral' : 'neutral'} dot>
              {status?.entitlement.state.replaceAll('_', ' ') ?? 'Unavailable'}
            </Badge>
          </div>

          {status && (
            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <StatTile icon={<Gauge className="h-4 w-4" aria-hidden="true" />} label="AI actions" value={`${status.usage.used} used · ${status.usage.remaining} remaining`} />
              <StatTile icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />} label="Period ends" value={dateTime(status.renewalPeriodEnd)} />
              <div className="rounded-token-md border border-[var(--border-subtle)] p-3">
                <span className="mb-2 flex text-[var(--accent)]">
                  <Gauge className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="text-xs text-[var(--text-secondary)]">Monthly capacity remaining</p>
                <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                  {status.entitlement.capacityRemainingPercent == null ? 'Unavailable' : `${status.entitlement.capacityRemainingPercent}%`}
                </p>
                {status.entitlement.capacityRemainingPercent != null && (
                  <Progress className="mt-2" value={status.entitlement.capacityRemainingPercent} label="Monthly capacity remaining" />
                )}
              </div>
              <div className="rounded-token-md border border-[var(--border-subtle)] p-3">
                <span className="mb-2 flex text-[var(--accent)]">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="text-xs text-[var(--text-secondary)]">Available now</p>
                <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                  {status.entitlement.availableNowPercent == null ? 'Unavailable' : `${status.entitlement.availableNowPercent}%`}
                </p>
                {status.entitlement.availableNowPercent != null && (
                  <Progress className="mt-2" value={status.entitlement.availableNowPercent} tone="success" label="Available now" />
                )}
              </div>
              <StatTile icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />} label="Next unlock" value={dateTime(status.entitlement.nextUnlockAt)} />
            </div>
          )}

          {status?.entitlement.pacing && status.plan !== 'free' && (
            <>
              <div className="my-5">
                <SettingsDivider />
              </div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Usage pacing</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Pacing changes availability timing only. It does not change model quality.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" disabled={saving || status.entitlement.pacing === 'balanced_month'} onClick={() => void choosePacing('balanced_month')}>
                  Balanced Month
                </Button>
                <Button variant="secondary" size="sm" disabled={saving || status.entitlement.pacing === 'full_access'} onClick={() => void choosePacing('full_access')}>
                  Full Access…
                </Button>
              </div>
            </>
          )}

          {!loading && !status && (
            <p className="mt-4 text-sm text-[var(--warning)]">Billing state is unavailable. No active or successful status is being assumed.</p>
          )}
        </SettingsCard>
      )}

      <SubscriptionManagePanel />
    </SettingsStack>
  );
}
