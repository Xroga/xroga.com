'use client';

import { PanelLoader } from '@/components/ui/PanelLoader';
import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Save, Upload } from 'lucide-react';
import { api, type Profile } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { useAvatarUpdate } from '@/hooks/useAvatarUpdate';
import { useT } from '@/components/providers/LanguageProvider';
import { AvatarPickerModal } from '@/components/profile/AvatarPickerModal';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { SettingsPanelHeader, SettingsStack } from '@/components/settings/SettingsPrimitives';

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific (US)' },
  { value: 'Asia/Karachi', label: 'Karachi' },
  { value: 'Asia/Kolkata', label: 'India' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ur', label: 'Urdu (اردو)' },
  { value: 'ar', label: 'Arabic (العربية)' },
  { value: 'es', label: 'Spanish (Español)' },
  { value: 'fr', label: 'French (Français)' },
  { value: 'de', label: 'German (Deutsch)' },
  { value: 'zh', label: 'Chinese (中文)' },
  { value: 'hi', label: 'Hindi (हिन्दी)' },
];

export function GeneralSettingsPanel({ email }: { email: string }) {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const { setAvatarUrl, uploadAvatarFile } = useAvatarUpdate();
  const setStoreProfile = useAppStore((s) => s.setProfile);

  useEffect(() => {
    api.profile
      .get()
      .then((p) => {
        setProfile(p);
        setStoreProfile(p);
      })
      .catch(() => setProfile({ display_name: '', avatar_url: '', timezone: 'UTC', language: 'en' }))
      .finally(() => setLoading(false));
  }, [setStoreProfile]);

  function update(patch: Partial<Profile>) {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile || saving) return;
    setSaving(true);
    try {
      const updated = await api.profile.update({
        display_name: profile.display_name ?? '',
        timezone: profile.timezone || 'UTC',
        language: profile.language || 'en',
        ...(profile.avatar_url ? { avatar_url: profile.avatar_url } : {}),
      });
      setProfile(updated);
      setStoreProfile(updated);
      setDirty(false);
      toast.success('Profile saved');
    } catch (err) {
      toast.error((err as Error).message || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(file: File) {
    await uploadAvatarFile(file);
    const p = useAppStore.getState().profile;
    if (p) update({ avatar_url: p.avatar_url });
  }

  async function handleAvatarPick(url: string) {
    await setAvatarUrl(url);
    update({ avatar_url: url });
  }

  if (loading || !profile) {
    return <PanelLoader height={320} />;
  }

  return (
    <SettingsStack>
      <SettingsPanelHeader title="General" description="Your account identity and regional preferences." />

      <form onSubmit={handleSaveProfile} className="space-y-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Avatar src={profile.avatar_url} name={profile.display_name} size="lg" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setAvatarPickerOpen(true)}>
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Choose avatar
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Display name</span>
            <input
              value={profile.display_name ?? ''}
              onChange={(e) => update({ display_name: e.target.value })}
              className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Email</span>
            <input
              value={email}
              readOnly
              aria-readonly="true"
              className="w-full cursor-not-allowed rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-muted)]"
            />
          </label>
          <Select
            label="Timezone"
            value={profile.timezone}
            onChange={(e) => update({ timezone: e.target.value })}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </Select>
          <Select
            label={t('settings.language')}
            value={profile.language}
            onChange={(e) => update({ language: e.target.value })}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" loading={saving}>
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {saving ? 'Saving…' : t('settings.save')}
          </Button>
          {dirty && !saving && <span className="text-xs text-[var(--text-muted)]">Unsaved changes</span>}
        </div>
      </form>

      <AvatarPickerModal
        open={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        currentUrl={profile.avatar_url}
        onSelect={handleAvatarPick}
        onUpload={handleAvatarUpload}
      />
    </SettingsStack>
  );
}
