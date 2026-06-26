'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { api, type Profile } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import { LogoutButton, UpgradeProButton, DeleteExpandButton, SettingsTab } from '@/components/ui/Uiverse';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { useThemeStore } from '@/store/useThemeStore';
import { THEME_OPTIONS } from '@/lib/theme';
import { ALL_ACTION_COSTS, tasksForActionBudget, budgetTaskLine } from '@/lib/actionCosts';
import { IntegrationsPanel } from '@/components/integrations/IntegrationsPanel';

const TABS = ['General', 'Plan & Billing', 'Integrations', 'Security', 'Notifications', 'Theme'] as const;
type Tab = (typeof TABS)[number];

export function SettingsView({ email }: { email: string }) {
  const router = useRouter();
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
  const [calcBudget, setCalcBudget] = useState('50');
  const calcAffordable = tasksForActionBudget(Math.max(0, parseInt(calcBudget, 10) || 0));
  const usedActions = actions ? actions.total - actions.remaining : 0;
  const usedPct = actions?.total ? Math.round((usedActions / actions.total) * 100) : 0;

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
              <SettingsTab key={t} active={tab === t} onClick={() => setTab(t)}>
                {t}
              </SettingsTab>
            ))}
          </nav>
        </div>

        <div className="flex-1 rounded-2xl border border-[var(--card-border)] bg-[var(--card)]/80 backdrop-blur-sm p-6 shadow-lg">
          {tab === 'General' && profile && (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <h2 className="font-semibold text-lg">General</h2>
              <div className="flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-br from-[var(--accent)]/10 to-transparent border border-[var(--card-border)] xv-fuel-card">
                <div className="w-16 h-16 rounded-full bg-[var(--primary)]/20 overflow-hidden flex items-center justify-center ring-2 ring-[var(--accent)]/30">
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
            <div className="space-y-5">
              <h2 className="font-semibold text-lg">Plan & Billing</h2>
              <div className="p-5 rounded-xl border border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent)]/10 to-transparent">
                <p className="font-medium capitalize text-lg">{actions?.planTier ?? 'unpaid'} Plan</p>
                <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full transition-all"
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
                <p className="text-sm text-[var(--muted)] mt-2">
                  <span className="text-[var(--accent)] font-semibold">{actions?.remaining.toLocaleString() ?? 50}</span>
                  {' / '}
                  {actions?.total.toLocaleString() ?? 50} Actions remaining ({usedPct}% used)
                </p>
                {actions?.concurrencyLimit != null && (
                  <p className="text-sm text-[var(--muted)] mt-1">
                    {actions.concurrencyLimit} concurrent task{actions.concurrencyLimit === 1 ? '' : 's'}
                  </p>
                )}
                <div className="mt-4 max-w-xs">
                  <UpgradeProButton onClick={() => router.push('/pricing')} />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--card-border)] bg-white/[0.02] space-y-3">
                <h3 className="font-medium text-sm">Action calculator</h3>
                <p className="text-xs text-[var(--muted)]">
                  Enter actions to see what you can do — including 1-action chat and tasks you cannot afford yet.
                </p>
                <input
                  type="number"
                  min={0}
                  value={calcBudget}
                  onChange={(e) => setCalcBudget(e.target.value)}
                  className="w-28 px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm font-mono"
                />
                <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
                  {calcAffordable.map((c) => {
                    const budget = parseInt(calcBudget, 10) || 0;
                    const canDo = budget >= c.cost;
                    return (
                      <li
                        key={c.id}
                        className={`flex justify-between py-0.5 gap-2 ${!canDo ? 'opacity-50' : ''}`}
                      >
                        <span className="text-[var(--muted)] truncate">{c.task}</span>
                        <span className={`font-mono shrink-0 ${canDo ? '' : 'text-red-400/80'}`}>
                          {budgetTaskLine(c, budget)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="text-xs text-[var(--muted)] space-y-1 max-h-48 overflow-y-auto">
                {ALL_ACTION_COSTS.map((c) => (
                  <div key={c.id} className="flex justify-between py-1 border-b border-[var(--card-border)]/40">
                    <span>{c.task}</span>
                    <span className="font-mono">{c.cost}</span>
                  </div>
                ))}
              </div>
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
              <LogoutButton
                onClick={async () => {
                  const supabase = createClient();
                  await supabase.auth.signOut();
                  router.push('/');
                  router.refresh();
                }}
              />
              <DeleteExpandButton onClick={() => setShowDeleteModal(true)} />
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
                  <p className="text-xs text-[var(--muted)] mb-2">PNG, JPG, WebP · recommended 1920×1080 or higher · keep file under 5MB</p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
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
                  <p className="text-xs text-[var(--muted)] mb-2">PNG, JPG, WebP · recommended 1080×1920 portrait · light images work best</p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
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
