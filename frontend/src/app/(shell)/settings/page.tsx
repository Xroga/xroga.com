import { SettingsView } from '@/components/settings/SettingsView';
import { PAGE_SEO } from '@/lib/dashboard-metadata';
import { sectionFromQuery } from '@/lib/settingsSections';

export const metadata = PAGE_SEO.settings;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const tab = (await searchParams).tab;
  const initialSection = sectionFromQuery(Array.isArray(tab) ? tab[0] : tab) ?? 'general';

  return <SettingsView initialSection={initialSection} />;
}
