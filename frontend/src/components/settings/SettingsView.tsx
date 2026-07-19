'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { api, type Profile } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import toast from 'react-hot-toast';
import { Save, Bell, Shield } from 'lucide-react';
import { LogoutButton, DeleteExpandButton, SettingsTab } from '@/components/ui/Uiverse';
import { cn } from '@/lib/utils';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { useThemeStore } from '@/store/useThemeStore';
import { THEME_OPTIONS, normalizeTheme, skinForTheme, type CoreThemeId } from '@/lib/theme';
import { IntegrationsPanel } from '@/components/integrations/IntegrationsPanel';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { useT } from '@/components/providers/LanguageProvider';
import { AvatarPickerModal } from '@/components/profile/AvatarPickerModal';
import { useAvatarUpdate } from '@/hooks/useAvatarUpdate';
import { PrivacySettingsPanel } from '@/components/settings/PrivacySettingsPanel';
import { DataAiSettingsPanel } from '@/components/settings/DataAiSettingsPanel';
import { PlanUsageSettingsPanel } from '@/components/settings/PlanUsageSettingsPanel';
import {
  BROWSER_NOTIFY_PROJECT_READY_KEY,
  requestBuildNotificationPermission,
  showBuildBrowserNotification,
} from '@/lib/buildBrowserNotify';

const TABS = ['General', 'Privacy', 'Data & AI', 'Plan & Usage', 'Integrations', 'Security', 'Notifications', 'Theme'] as const;
type Tab = (typeof TABS)[number];

function tabFromQuery(raw: string | null): Tab | null {
  if (!raw) return null;
  const q = raw.toLowerCase().replace(/[_-]/g, ' ');
  if (q.includes('plan')) return 'Plan & Usage';
  if (q.includes('security')) return 'Security';
  if (q.includes('notif')) return 'Notifications';
  if (q.includes('integrat')) return 'Integrations';
  if (q.includes('theme')) return 'Theme';
  if (q.includes('privacy')) return 'Privacy';
  if (q.includes('data')) return 'Data & AI';
  if (q.includes('general')) return 'General';
  return null;
}

export function SettingsView({ email }: { email: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const [tab, setTab] = useState<Tab>(() => tabFromQuery(searchParams.get('tab')) ?? 'General');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const { setAvatarUrl, uploadAvatarFile } = useAvatarUpdate();
  const [browserNotify, setBrowserNotify] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const setStoreProfile = useAppStore((s) => s.setProfile);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setTerminalSkin = useThemeStore((s) => s.setTerminalSkin);
  const currentTheme = normalizeTheme(theme);

  useEffect(() => {
    const fromQuery = tabFromQuery(searchParams.get('tab'));
    if (fromQuery) setTab(fromQuery);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setBrowserNotify(localStorage.getItem(BROWSER_NOTIFY_PROJECT_READY_KEY) !== '0');
  }, []);

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

  useEffect(() => {
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.mfa.listFactors();
        const verified = (data?.totp ?? []).some((f) => f.status === 'verified');
        setMfaEnabled(verified);
      } catch {
        /* optional */
      }
    })();
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
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
    await uploadAvatarFile(file);
    const p = useAppStore.getState().profile;
    if (p) setProfile({ ...profile, avatar_url: p.avatar_url });
  }

  async function handleAvatarPick(url: string) {
    if (!profile) return;
    await setAvatarUrl(url);
    setProfile({ ...profile, avatar_url: url });
  }

  async function toggleBrowserNotify(next: boolean) {
    if (next) {
      const ok = await requestBuildNotificationPermission();
      if (!ok) {
        toast.error('Browser blocked notifications — allow them in site settings');
        setBrowserNotify(false);
        localStorage.setItem(BROWSER_NOTIFY_PROJECT_READY_KEY, '0');
        return;
      }
      localStorage.setItem(BROWSER_NOTIFY_PROJECT_READY_KEY, '1');
      setBrowserNotify(true);
      showBuildBrowserNotification({
        title: 'Xroga notifications on',
        body: 'We’ll alert you in this browser when a project is ready.',
        tag: 'xroga-notify-test',
      });
      toast.success('Browser notifications enabled');
      return;
    }
    localStorage.setItem(BROWSER_NOTIFY_PROJECT_READY_KEY, '0');
    setBrowserNotify(false);
    toast.success('Browser notifications off');
  }

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setPasswordBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated');
    } catch (err) {
      toast.error((err as Error).message || 'Could not update password');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function startMfaEnroll() {
    setMfaBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Xroga Authenticator',
      });
      if (error) throw error;
      setMfaFactorId(data.id);
      setMfaQr(data.totp.qr_code);
      setMfaSecret(data.totp.secret);
      toast.success('Scan the QR with your authenticator app');
    } catch (err) {
      toast.error((err as Error).message || 'Could not start 2FA');
    } finally {
      setMfaBusy(false);
    }
  }

  async function verifyMfaEnroll() {
    if (!mfaFactorId || mfaCode.trim().length < 6) {
      toast.error('Enter the 6-digit code from your app');
      return;
    }
    setMfaBusy(true);
    try {
      const supabase = createClient();
      const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challenge.error) throw challenge.error;
      const verified = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.data.id,
        code: mfaCode.trim(),
      });
      if (verified.error) throw verified.error;
      setMfaEnabled(true);
      setMfaQr(null);
      setMfaSecret(null);
      setMfaFactorId(null);
      setMfaCode('');
      toast.success('Two-factor authentication enabled');
    } catch (err) {
      toast.error((err as Error).message || 'Invalid code');
    } finally {
      setMfaBusy(false);
    }
  }

  async function disableMfa() {
    setMfaBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const factor = (data?.totp ?? []).find((f) => f.status === 'verified');
      if (!factor) {
        setMfaEnabled(false);
        return;
      }
      const unenrolled = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrolled.error) throw unenrolled.error;
      setMfaEnabled(false);
      toast.success('Two-factor authentication disabled');
    } catch (err) {
      toast.error((err as Error).message || 'Could not disable 2FA');
    } finally {
      setMfaBusy(false);
    }
  }

  if (loading) {
    return <Skeleton height={400} baseColor="#1a1a2e" highlightColor="#2a2a3e" />;
  }

  return (
    <>
      <PageFullscreenFrame>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Settings</h1>

          <div className="flex flex-col md:flex-row gap-6">
            <div className="md:w-48 shrink-0">
              <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                {TABS.map((tabName) => (
                  <SettingsTab key={tabName} active={tab === tabName} onClick={() => setTab(tabName)}>
                    {tabName}
                  </SettingsTab>
                ))}
              </nav>
            </div>

            <div className="flex-1 rounded-2xl border border-[var(--card-border)] bg-[var(--card)]/80 backdrop-blur-sm p-4 sm:p-6 shadow-lg min-w-0">
              {tab === 'General' && profile && (
                <form onSubmit={handleSaveProfile} className="space-y-5">
                  <h2 className="font-semibold text-lg">General</h2>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-2xl bg-gradient-to-br from-[var(--accent)]/10 to-transparent border border-[var(--card-border)]">
                    <button
                      type="button"
                      onClick={() => setAvatarPickerOpen(true)}
                      className="w-16 h-16 rounded-full bg-[var(--primary)]/20 overflow-hidden flex items-center justify-center ring-2 ring-[var(--accent)]/30 hover:ring-[var(--accent)] transition-all shrink-0"
                    >
                      {profile.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">👤</span>
                      )}
                    </button>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setAvatarPickerOpen(true)}
                        className="text-sm text-[var(--accent)] hover:underline font-medium"
                      >
                        Choose avatar
                      </button>
                      <label className="block text-sm text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer">
                        or upload custom
                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                      </label>
                    </div>
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
                    <input
                      value={email}
                      readOnly
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm opacity-60"
                    />
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
                      <label className="block text-sm text-[var(--muted)] mb-1">{t('settings.language')}</label>
                      <select
                        value={profile.language}
                        onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
                      >
                        <option value="en">English</option>
                        <option value="ur">Urdu (اردو)</option>
                        <option value="ar">Arabic (العربية)</option>
                        <option value="es">Spanish (Español)</option>
                        <option value="fr">French (Français)</option>
                        <option value="de">German (Deutsch)</option>
                        <option value="zh">Chinese (中文)</option>
                        <option value="hi">Hindi (हिन्दी)</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] hover:opacity-90 text-sm disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : t('settings.save')}
                  </button>
                </form>
              )}

              {tab === 'Privacy' && <PrivacySettingsPanel />}
              {tab === 'Data & AI' && <DataAiSettingsPanel email={email} />}
              {tab === 'Plan & Usage' && <PlanUsageSettingsPanel />}
              {tab === 'Integrations' && <IntegrationsPanel />}

              {tab === 'Security' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-semibold flex items-center gap-2">
                      <Shield className="w-4 h-4" /> Security
                    </h2>
                    <p className="text-xs text-[var(--muted)] mt-1">
                      Change your password and protect the account with authenticator 2FA (TOTP).
                    </p>
                  </div>

                  <form onSubmit={handlePasswordUpdate} className="space-y-3 rounded-xl border border-[var(--card-border)] p-4">
                    <p className="text-sm font-semibold">New password</p>
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
                    />
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
                    />
                    <button
                      type="submit"
                      disabled={passwordBusy}
                      className="px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--background)] text-xs font-bold disabled:opacity-50"
                    >
                      {passwordBusy ? 'Updating…' : 'Update password'}
                    </button>
                  </form>

                  <div className="space-y-3 rounded-xl border border-[var(--card-border)] p-4">
                    <p className="text-sm font-semibold">Two-factor authentication (TOTP)</p>
                    <p className="text-xs text-[var(--muted)]">
                      Use Google Authenticator, 1Password, or Authy. Status:{' '}
                      <strong>{mfaEnabled ? 'Enabled' : 'Off'}</strong>
                    </p>
                    {!mfaEnabled && !mfaQr ? (
                      <button
                        type="button"
                        disabled={mfaBusy}
                        onClick={() => void startMfaEnroll()}
                        className="px-3 py-2 rounded-lg border border-[var(--card-border)] text-xs font-semibold disabled:opacity-50"
                      >
                        {mfaBusy ? 'Starting…' : 'Enable 2FA'}
                      </button>
                    ) : null}
                    {mfaQr ? (
                      <div className="space-y-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mfaQr} alt="2FA QR code" className="w-40 h-40 rounded-lg bg-white p-2" />
                        {mfaSecret ? (
                          <p className="text-[11px] font-mono text-[var(--muted)] break-all">
                            Secret: {mfaSecret}
                          </p>
                        ) : null}
                        <input
                          value={mfaCode}
                          onChange={(e) => setMfaCode(e.target.value)}
                          placeholder="6-digit code"
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm font-mono"
                        />
                        <button
                          type="button"
                          disabled={mfaBusy}
                          onClick={() => void verifyMfaEnroll()}
                          className="px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--background)] text-xs font-bold disabled:opacity-50"
                        >
                          {mfaBusy ? 'Verifying…' : 'Verify & enable'}
                        </button>
                      </div>
                    ) : null}
                    {mfaEnabled ? (
                      <button
                        type="button"
                        disabled={mfaBusy}
                        onClick={() => void disableMfa()}
                        className="px-3 py-2 rounded-lg border border-red-500/40 text-red-400 text-xs font-semibold disabled:opacity-50"
                      >
                        Disable 2FA
                      </button>
                    ) : null}
                  </div>

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
                        <p className="text-sm text-[var(--muted)] mt-2">
                          For full account deletion, use the Data &amp; AI tab. This only signs you out.
                        </p>
                        <div className="flex gap-2 mt-4">
                          <button
                            type="button"
                            onClick={() => setShowDeleteModal(false)}
                            className="flex-1 py-2 rounded-lg border border-[var(--card-border)] text-sm"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const supabase = createClient();
                              await supabase.auth.signOut();
                              router.push('/');
                              router.refresh();
                            }}
                            className="flex-1 py-2 rounded-lg bg-red-600 text-sm"
                          >
                            Sign out
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'Notifications' && (
                <div className="space-y-4">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Bell className="w-4 h-4" /> Notifications
                  </h2>
                  <p className="text-sm text-[var(--muted)]">
                    Only browser device alerts when a project is ready. No email or daily brief spam.
                  </p>
                  <label className="flex items-center justify-between gap-3 py-3 px-3 rounded-xl border border-[var(--card-border)]">
                    <span className="text-sm">
                      Browser notification when project is ready
                      <span className="block text-xs text-[var(--muted)] mt-0.5">
                        Uses this device’s notification permission
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={browserNotify}
                      onChange={(e) => void toggleBrowserNotify(e.target.checked)}
                      className="rounded"
                    />
                  </label>
                </div>
              )}

              {tab === 'Theme' && (
                <div className="space-y-4">
                  <h2 className="font-semibold font-claude">Theme</h2>
                  <p className="text-sm text-[var(--muted)] font-coding">
                    White, Gray, or Black — applies across workspace, sidebar, chat, and buttons.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          const id = opt.id as CoreThemeId;
                          setTheme(id);
                          setTerminalSkin(skinForTheme(id));
                        }}
                        className={cn(
                          'text-left p-4 rounded-xl border transition-colors',
                          currentTheme === opt.id
                            ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--foreground)]'
                            : 'border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--primary)]/40 hover:text-[var(--foreground)]'
                        )}
                      >
                        <p className="font-medium font-claude">{opt.label}</p>
                        <p className="text-xs mt-1 opacity-70 font-coding">{opt.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </PageFullscreenFrame>

      <AvatarPickerModal
        open={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        currentUrl={profile?.avatar_url}
        onSelect={handleAvatarPick}
        onUpload={async (file) => {
          await uploadAvatarFile(file);
          const p = useAppStore.getState().profile;
          if (p && profile) setProfile({ ...profile, avatar_url: p.avatar_url });
          setAvatarPickerOpen(false);
        }}
      />
    </>
  );
}
