export const SETTINGS_SECTION_IDS = [
  'general',
  'personalization',
  'privacy',
  'data-ai',
  'plan',
  'integrations',
  'security',
  'notifications',
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

/** Fuzzy-matches a `?tab=` query value (e.g. from an external deep link) to a settings section. */
export function sectionFromQuery(raw: string | null | undefined): SettingsSectionId | null {
  if (!raw) return null;
  const q = raw.toLowerCase().replace(/[_-]/g, ' ');
  if (q.includes('plan')) return 'plan';
  if (q.includes('security')) return 'security';
  if (q.includes('notif')) return 'notifications';
  if (q.includes('integrat')) return 'integrations';
  if (q.includes('personal')) return 'personalization';
  if (q.includes('theme')) return 'personalization';
  if (q.includes('companion')) return 'personalization';
  if (q.includes('privacy')) return 'privacy';
  if (q.includes('data')) return 'data-ai';
  if (q.includes('general')) return 'general';
  return null;
}
