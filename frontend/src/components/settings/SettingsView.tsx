'use client';

import { PanelLoader } from '@/components/ui/PanelLoader';
import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, usePathname } from 'next/navigation';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { IntegrationsPanel } from '@/components/integrations/IntegrationsPanel';
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
import { CatIcon } from '@/components/icons/animated/CatIcon';
import { UserRoundPenIcon } from '@/components/icons/animated/UserRoundPenIcon';
import { ShieldCheckIcon } from '@/components/icons/animated/ShieldCheckIcon';
import { DatabaseBackupIcon } from '@/components/icons/animated/DatabaseBackupIcon';
import { WalletIcon } from '@/components/icons/animated/WalletIcon';
import { ConnectIcon } from '@/components/icons/animated/ConnectIcon';
import { UserLockIcon } from '@/components/icons/animated/UserLockIcon';
import { BellElectricIcon } from '@/components/icons/animated/BellElectricIcon';
import { PaletteIcon } from '@/components/icons/animated/PaletteIcon';

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
  { id: 'companion', label: 'Companion', icon: <AnimatedIcon icon={CatIcon} size={16} intro={false} /> },
  { id: 'privacy', label: 'Privacy', icon: <AnimatedIcon icon={ShieldCheckIcon} size={16} intro={false} /> },
  { id: 'data-ai', label: 'Data & AI', icon: <AnimatedIcon icon={DatabaseBackupIcon} size={16} intro={false} /> },
  { id: 'plan', label: 'Plan & Usage', icon: <AnimatedIcon icon={WalletIcon} size={16} intro={false} /> },
  { id: 'integrations', label: 'Integrations', icon: <AnimatedIcon icon={ConnectIcon} size={16} intro={false} /> },
  { id: 'security', label: 'Security', icon: <AnimatedIcon icon={UserLockIcon} size={16} intro={false} /> },
  { id: 'notifications', label: 'Notifications', icon: <AnimatedIcon icon={BellElectricIcon} size={16} intro={false} /> },
  { id: 'theme', label: 'Theme', icon: <AnimatedIcon icon={PaletteIcon} size={16} intro={false} /> },
] as const satisfies readonly TabItem[];

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
          {/* Desktop: persistent left rail */}
          <nav className="hidden shrink-0 md:block md:w-52">
            <Tabs items={SECTIONS} activeId={section} onChange={setSection} orientation="vertical" idPrefix="xv-settings" />
          </nav>

          {/*
            Mobile/tablet: the same tabs as the desktop rail, laid out as one row that
            scrolls under the finger.

            This was a native select, chosen because a wrapping pill row turned nine
            sections into three stacked rows. The row does not wrap now — it scrolls —
            so the sections are all visible as sections rather than hidden behind a
            control that has to be opened to find out what is in it.
          */}
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
            {section === 'companion' && <CompanionCustomizer />}
            {section === 'privacy' && <PrivacySettingsPanel />}
            {section === 'data-ai' && <DataAiSettingsPanel email={email} />}
            {section === 'plan' && <PlanUsageSettingsPanel />}
            {section === 'integrations' && <IntegrationsPanel />}
            {section === 'security' && <SecuritySettingsPanel />}
            {section === 'notifications' && <NotificationsSettingsPanel />}
            {section === 'theme' && <ThemeSettingsPanel />}
          </div>
        </div>
      </div>
    </PageFullscreenFrame>
  );
}
