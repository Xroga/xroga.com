'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { api, type Profile } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import toast from 'react-hot-toast';
import { Save, Trash2, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { useThemeStore } from '@/store/useThemeStore';
import { THEME_OPTIONS } from '@/lib/theme';
import { IntegrationsPanel } from '@/components/integrations/IntegrationsPanel';

const TABS = ['General', 'Plan & Billing', 'Integrations', 'Security', 'Notifications', 'Theme'] as const;
type Tab = (typeof TABS)[number];

export function SettingsView({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>('General');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [prefs, setPrefs] = useState({
    emailNotif: true,
    inAppNotif: true,
    dailyBrief: false,
    soundEffects: true,
  });
  const setStoreProfile = useAppStore((s) => s.setProfile);
  const actions = useAppStore((s) => s.actions);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setCustomDesktopBg = useThemeStore((s) => s.setCustomDesktopBg);
  const setCustomMobileBg = useThemeStore((s) => s.setCustomMobileBg);
  const customDesktopBg = useThemeStore((s) => s.customDesktopBg);
  const customMobileBg = useThemeStore((s) => s.customMobileBg);

  useEffect(() => {
    api.profile.get()
      .then((p) => {
        setProfile(p);
        setStoreProfile(p);
      })
      .catch(() => setProfile({ display_name: '', avatar_url: '', timezone: 'UTC', language: 'en' }))
      .finally(() => setLoading(false));
  }, [setStoreProfile]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await api.profile.update(profile);
      setProfile(updated);
      setStoreProfile(updated);
      toast.success('Profile saved');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const supabase = createClient();
    const path = `avatars/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file);
    if (error) {
      toast.error('Avatar upload failed — configure Supabase Storage bucket');
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    setProfile({ ...profile, avatar_url: publicUrl });
    toast.success('Avatar uploaded — save to apply');
  }

  if (loading) {
    return <Skeleton height={400} baseColor="#1a1a2e" highlightColor="#2a2a3e" />;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-48 shrink-0">
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm text-left whitespace-nowrap transition-colors',
                  tab === t ? 'bg-[var(--primary)]/20 text-[var(--accent)]' : 'text-[var(--muted)] hover:bg-white/5'
                )}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
          {tab === 'General' && profile && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <h2 className="font-semibold mb-4">General</h2>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-[var(--primary)]/20 overflow-hidden flex items-center justify-center">
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">👤</span>
                  )}
                </div>
                <label className="text-sm text-[var(--accent)] hover:underline cursor-pointer">
                  Upload avatar
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </label>
              </div>
              <div>
                <label className="block text-sm text-[var(--muted)] mb-1">Display Name</label>
                <input
                  value={profile.display_name ?? ''}
                  onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--muted)] mb-1">Email</label>
                <input value={email} readOnly className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm opacity-60" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[var(--muted)] mb-1">Timezone</label>
                  <select
                    value={profile.timezone}
                    onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern (US)</option>
                    <option value="America/Los_Angeles">Pacific (US)</option>
                    <option value="Asia/Karachi">Karachi</option>
                    <option value="Asia/Kolkata">India</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[var(--muted)] mb-1">Language</label>
                  <select
                    value={profile.language}
                    onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
                  >
                    <option value="en">English</option>
                    <option value="ur">Urdu</option>
                    <option value="hi">Hindi</option>
                    <option value="ar">Arabic</option>
                  </select>
                </div>
              </div>
              <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] hover:opacity-90 text-sm disabled:opacity-50">
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          )}

          {tab === 'Plan & Billing' && (
            <div className="space-y-4">
              <h2 className="font-semibold">Plan & Billing</h2>
              <div className="p-4 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10">
                <p className="font-medium capitalize">{actions?.planTier ?? 'unpaid'} Plan</p>
                <p className="text-sm text-[var(--muted)] mt-1">
                  {actions?.remaining.toLocaleString()} / {actions?.total.toLocaleString()} Actions remaining
                </p>
                {actions?.concurrencyLimit != null && (
                  <p className="text-sm text-[var(--muted)] mt-1">
                    {actions.concurrencyLimit} concurrent task{actions.concurrencyLimit === 1 ? '' : 's'}
                  </p>
                )}
                <a href="/pricing" className="inline-block mt-3 px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-sm font-semibold">
                  Upgrade Plan
                </a>
              </div>
              <p className="text-sm text-[var(--muted)]">Invoice history available after Paddle integration (Phase 5).</p>
            </div>
          )}

          {tab === 'Integrations' && <IntegrationsPanel />}

          {tab === 'Security' && (
            <div className="space-y-4">
              <h2 className="font-semibold">Security</h2>
              <div>
                <label className="block text-sm text-[var(--muted)] mb-1">New Password</label>
                <input type="password" placeholder="••••••••" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded" />
                Enable Two-Factor Authentication (TOTP)
              </label>
              <button type="button" className="flex items-center gap-2 text-sm text-amber-400 hover:underline">
                <LogOut className="w-4 h-4" />
                Log Out All Devices
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-2 text-sm text-red-400 hover:underline"
              >
                <Trash2 className="w-4 h-4" />
                Delete Account
              </button>
              {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                  <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] p-6 max-w-sm w-full">
                    <h3 className="font-semibold text-red-400">Delete Account?</h3>
                    <p className="text-sm text-[var(--muted)] mt-2">This permanently deletes all projects and data. This cannot be undone.</p>
                    <div className="flex gap-2 mt-4">
                      <button type="button" onClick={() => setShowDeleteModal(false)} className="flex-1 py-2 rounded-lg border border-[var(--card-border)] text-sm">
                        Cancel
                      </button>
                      <button type="button" onClick={() => toast.error('Contact support to delete account')} className="flex-1 py-2 rounded-lg bg-red-600 text-sm">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'Notifications' && (
            <div className="space-y-4">
              <h2 className="font-semibold">Notifications</h2>
              {[
                { key: 'emailNotif' as const, label: 'Email Notifications' },
                { key: 'inAppNotif' as const, label: 'In-App Notifications' },
                { key: 'dailyBrief' as const, label: 'Daily Strategy Brief' },
                { key: 'soundEffects' as const, label: 'Sound Effects' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between py-2 border-b border-[var(--card-border)]">
                  <span className="text-sm">{label}</span>
                  <input
                    type="checkbox"
                    checked={prefs[key]}
                    onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
                    className="rounded"
                  />
                </label>
              ))}
            </div>
          )}

          {tab === 'Theme' && (
            <div className="space-y-4">
              <h2 className="font-semibold">Theme</h2>
              <p className="text-sm text-[var(--muted)]">
                Choose your workspace background. Image mode uses galactic wallpapers — or upload your own.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTheme(opt.id)}
                    className={cn(
                      'text-left p-4 rounded-xl border transition-colors universe-float',
                      theme === opt.id
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                        : 'border-[var(--card-border)] hover:border-[var(--primary)]/40'
                    )}
                  >
                    <p className="font-medium">{opt.label}</p>
                    <p className="text-xs text-[var(--muted)] mt-1">{opt.description}</p>
                  </button>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-[var(--card-border)]">
                <div>
                  <label className="block text-sm font-medium mb-2">Custom desktop wallpaper</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="text-xs w-full"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setCustomDesktopBg(reader.result as string);
                        setTheme('image');
                        toast.success('Desktop wallpaper updated');
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  {customDesktopBg && (
                    <button
                      type="button"
                      className="text-xs text-red-400 mt-2 hover:underline"
                      onClick={() => setCustomDesktopBg(null)}
                    >
                      Remove custom desktop
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Custom mobile wallpaper</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="text-xs w-full"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setCustomMobileBg(reader.result as string);
                        setTheme('image');
                        toast.success('Mobile wallpaper updated');
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  {customMobileBg && (
                    <button
                      type="button"
                      className="text-xs text-red-400 mt-2 hover:underline"
                      onClick={() => setCustomMobileBg(null)}
                    >
                      Remove custom mobile
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
