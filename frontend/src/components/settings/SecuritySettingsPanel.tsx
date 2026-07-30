'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Shield, Eye, EyeOff, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SettingsCard, SettingsPanelHeader, SettingsStack } from '@/components/settings/SettingsPrimitives';

export function SecuritySettingsPanel() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaSecretRevealed, setMfaSecretRevealed] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [signingOut, setSigningOut] = useState(false);

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

  async function handlePasswordUpdate(e: FormEvent) {
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
      setMfaSecretRevealed(false);
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

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/');
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <SettingsStack>
      <SettingsPanelHeader
        icon={<Shield className="h-4 w-4" aria-hidden="true" />}
        title="Security"
        description="Change your password and protect the account with authenticator 2FA (TOTP)."
      />

      <SettingsCard>
        <form onSubmit={handlePasswordUpdate} className="space-y-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">New password</p>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 pr-10 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
          <Button type="submit" variant="primary" size="sm" loading={passwordBusy}>
            {passwordBusy ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </SettingsCard>

      <SettingsCard>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Two-factor authentication (TOTP)</p>
            <Badge tone={mfaEnabled ? 'success' : 'neutral'} dot>
              {mfaEnabled ? 'Enabled' : 'Off'}
            </Badge>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Use Google Authenticator, 1Password, or Authy to generate 6-digit codes.
          </p>
          {!mfaEnabled && !mfaQr ? (
            <Button variant="secondary" size="sm" loading={mfaBusy} onClick={() => void startMfaEnroll()}>
              {mfaBusy ? 'Starting…' : 'Enable 2FA'}
            </Button>
          ) : null}
          {mfaQr ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mfaQr} alt="2FA QR code" className="h-40 w-40 rounded-token-sm bg-white p-2" />
              {mfaSecret ? (
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                  <span className="font-mono">
                    Secret: {mfaSecretRevealed ? mfaSecret : '•'.repeat(16)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMfaSecretRevealed((v) => !v)}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {mfaSecretRevealed ? 'Hide' : 'Reveal'}
                  </button>
                </div>
              ) : null}
              <input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="6-digit code"
                inputMode="numeric"
                className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              />
              <Button variant="primary" size="sm" loading={mfaBusy} onClick={() => void verifyMfaEnroll()}>
                {mfaBusy ? 'Verifying…' : 'Verify & enable'}
              </Button>
            </div>
          ) : null}
          {mfaEnabled ? (
            <Button variant="danger" size="sm" loading={mfaBusy} onClick={() => void disableMfa()}>
              Disable 2FA
            </Button>
          ) : null}
        </div>
      </SettingsCard>

      <div>
        <Button variant="secondary" loading={signingOut} onClick={() => void handleSignOut()}>
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Sign out
        </Button>
      </div>
    </SettingsStack>
  );
}
