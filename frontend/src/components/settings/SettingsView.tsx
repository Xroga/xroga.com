'use client';

import { PanelLoader } from '@/components/ui/PanelLoader';
import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, usePathname } from 'next/navigation';
import {
  User,
  Sparkles,
  Lock,
  Database,
  Gauge,
  Plug,
  Shield,
  Bell,
  Palette,
} from 'lucide-react';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { IntegrationsPanel } from '@/components/integrations/IntegrationsPanel';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { Select } from '@/components/ui/Select';
import { GeneralSettingsPanel } from '@/components/settings/GeneralSettingsPanel';
import { PrivacySettingsPanel } from '@/components/settings/PrivacySettingsPanel';
import { DataAiSettingsPanel } from '@/components/settings/DataAiSettingsPanel';
import { PlanUsageSettingsPanel } from '@/components/settings/PlanUsageSettingsPanel';
import { SecuritySettingsPanel } from '@/components/settings/SecuritySettingsPanel';
import { NotificationsSettingsPanel } from '@/components/settings/NotificationsSettingsPanel';
import { ThemeSettingsPanel } from '@/components/settings/ThemeSettingsPanel';
import type { SettingsSectionId } from '@/lib/settingsSections';
import { useShellIdentity } from '@/components/layout/ShellIdentityContext';

const CompanionCustomizer = dynamic(
  () => import('@/components/companion/CompanionCustomizer').then((module) => module.CompanionCustomizer),
  { loading: () => <PanelLoader height={280} /> },
);

const SECTIONS = [
  { id: 'general', label: 'General', icon: <User className="h-4 w-4" aria-hidden="true" /> },
  { id: 'companion', label: 'Companion', icon: <Sparkles className="h-4 w-4" aria-hidden="true" /> },
  { id: 'privacy', label: 'Privacy', icon: <Lock className="h-4 w-4" aria-hidden="true" /> },
  { id: 'data-ai', label: 'Data & AI', icon: <Database className="h-4 w-4" aria-hidden="true" /> },
  { id: 'plan', label: 'Plan & Usage', icon: <Gauge className="h-4 w-4" aria-hidden="true" /> },
  { id: 'integrations', label: 'Integrations', icon: <Plug className="h-4 w-4" aria-hidden="true" /> },
  { id: 'security', label: 'Security', icon: <Shield className="h-4 w-4" aria-hidden="true" /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" aria-hidden="true" /> },
  { id: 'theme', label: 'Theme', icon: <Palette className="h-4 w-4" aria-hidden="true" /> },
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

          {/* Mobile/tablet: compact section selector, no clipped horizontal pills */}
          <div className="md:hidden">
            <Select label="Section" value={section} onChange={(e) => setSection(e.target.value)}>
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
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
