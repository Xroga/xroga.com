'use client';

import Link from 'next/link';
import { PanelLoader } from '@/components/ui/PanelLoader';
import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, usePathname } from 'next/navigation';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { GeneralSettingsPanel } from '@/components/settings/GeneralSettingsPanel';
import { PrivacySettingsPanel } from '@/components/settings/PrivacySettingsPanel';
import { DataAiSettingsPanel } from '@/components/settings/DataAiSettingsPanel';
import { PlanUsageSettingsPanel } from '@/components/settings/PlanUsageSettingsPanel';
import { SecuritySettingsPanel } from '@/components/settings/SecuritySettingsPanel';
import { NotificationsSettingsPanel } from '@/components/settings/NotificationsSettingsPanel';
import { ThemeSettingsPanel } from '@/components/settings/ThemeSettingsPanel';
import type { SettingsSectionId } from '@/lib/settingsSections';
import { useShellIdentity } from '@/components/layout/ShellIdentityContext';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { UserRoundPenIcon } from '@/components/icons/animated/UserRoundPenIcon';
import { ShieldCheckIcon } from '@/components/icons/animated/ShieldCheckIcon';
import { DatabaseBackupIcon } from '@/components/icons/animated/DatabaseBackupIcon';
import { WalletIcon } from '@/components/icons/animated/WalletIcon';
import { ConnectIcon } from '@/components/icons/animated/ConnectIcon';
import { UserLockIcon } from '@/components/icons/animated/UserLockIcon';
import { BellElectricIcon } from '@/components/icons/animated/BellElectricIcon';
import { PaletteIcon } from '@/components/icons/animated/PaletteIcon';
import { ArrowRight } from 'lucide-react';

const CompanionCustomizer = dynamic(
  () => import('@/components/companion/CompanionCustomizer').then((module) => module.CompanionCustomizer),
  { loading: () => <PanelLoader height={280} /> },
);

/*
 * Every section wears an icon that animates its own paths, the same family the
 * sidebar and the composer use. `intro={false}` throughout: nine tabs all waving at
 * once when Settings loads is noise, so they play on hover and on click instead.
 */
const SECTIONS = [
  { id: 'general', label: 'General', icon: <AnimatedIcon icon={UserRoundPenIcon} size={16} intro={false} /> },
  { id: 'personalization', label: 'Personalization', icon: <AnimatedIcon icon={PaletteIcon} size={16} intro={false} /> },
  { id: 'privacy', label: 'Privacy', icon: <AnimatedIcon icon={ShieldCheckIcon} size={16} intro={false} /> },
  { id: 'data-ai', label: 'Data & AI', icon: <AnimatedIcon icon={DatabaseBackupIcon} size={16} intro={false} /> },
  { id: 'plan', label: 'Plan & Usage', icon: <AnimatedIcon icon={WalletIcon} size={16} intro={false} /> },
  { id: 'integrations', label: 'Plugins', icon: <AnimatedIcon icon={ConnectIcon} size={16} intro={false} /> },
  { id: 'security', label: 'Security', icon: <AnimatedIcon icon={UserLockIcon} size={16} intro={false} /> },
  { id: 'notifications', label: 'Notifications', icon: <AnimatedIcon icon={BellElectricIcon} size={16} intro={false} /> },
] as const satisfies readonly TabItem[];

function PluginsSettingsSummary() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Plugins</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
          Manage the apps, developer tools and services Xroga can securely work with from the dedicated Plugins marketplace.
        </p>
      </div>

      <Link
        href="/dashboard/integrations"
        className="flex items-center justify-between gap-3 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-4 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <span>
          <span className="block text-sm font-semibold text-[var(--text-primary)]">Open Plugins</span>
          <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">
            Discover, connect and manage Plugins without squeezing the marketplace into Settings.
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
      </Link>
    </div>
  );
}

export function SettingsView({ initialSection = 'general' }: { initialSection?: SettingsSectionId }) {
  const router = useRouter();
  const pathname = usePathname();
  const { email = '' } = useShellIdentity();
  const [section, setSectionState] = useState<SettingsSectionId>(initialSection);

  const setSection = useCallback(
    (id: string) => {
      setSectionState(id as SettingsSectionId);
      const params = new URLSearchParams(window.location.search);
      params.set('tab', id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

  const activeMeta = useMemo(() => SECTIONS.find((s) => s.id === section) ?? SECTIONS[0], [section]);

  return (
    <PageFullscreenFrame>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{email}</p>
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          <nav className="hidden shrink-0 md:block md:w-52">
            <Tabs items={SECTIONS} activeId={section} onChange={setSection} orientation="vertical" idPrefix="xv-settings" />
          </nav>

          <div className="xv-settings-sections md:hidden" role="group" aria-label="Section">
            <Tabs
              items={SECTIONS}
              activeId={section}
              onChange={setSection}
              orientation="horizontal"
              idPrefix="xv-settings-m"
              panelPrefix="xv-settings"
            />
          </div>

          <div
            role="tabpanel"
            id={`xv-settings-panel-${section}`}
            aria-labelledby={`xv-settings-${section}`}
            className="min-w-0 flex-1 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-subtle sm:p-6"
          >
            <h2 className="sr-only">{activeMeta.label} settings</h2>
            {section === 'general' && <GeneralSettingsPanel email={email} />}
            {section === 'personalization' && (
              <div className="space-y-10">
                <ThemeSettingsPanel />
                <div className="border-t border-[var(--border-subtle)] pt-8">
                  <CompanionCustomizer />
                </div>
              </div>
            )}
            {section === 'privacy' && <PrivacySettingsPanel />}
            {section === 'data-ai' && <DataAiSettingsPanel email={email} />}
            {section === 'plan' && <PlanUsageSettingsPanel />}
            {section === 'integrations' && <PluginsSettingsSummary />}
            {section === 'security' && <SecuritySettingsPanel />}
            {section === 'notifications' && <NotificationsSettingsPanel />}
          </div>
        </div>
      </div>
    </PageFullscreenFrame>
  );
}
