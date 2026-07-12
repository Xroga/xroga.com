'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Triangle } from 'lucide-react';
import { api } from '@/lib/api';

interface VercelBuildGateModalProps {
  open: boolean;
  onClose: () => void;
  onConnected: (username?: string) => void;
}

/** Connect Vercel via OAuth popup or personal access token (user's account). */
export function VercelBuildGateModal({ open, onClose, onConnected }: VercelBuildGateModalProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenForm, setShowTokenForm] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopPoll();
      setConnecting(false);
      setError(null);
      setTokenInput('');
      setShowTokenForm(false);
      setOauthConfigured(null);
      return;
    }
    void api.vercel
      .oauthUrl()
      .then((res) => setOauthConfigured(res.oauthConfigured))
      .catch(() => setOauthConfigured(false));

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'xroga-vercel-connected') {
        stopPoll();
        setConnecting(false);
        onConnected(e.data.username as string | undefined);
      }
      if (e.data?.type === 'xroga-vercel-error') {
        stopPoll();
        setConnecting(false);
        setError(typeof e.data.message === 'string' ? e.data.message : 'Vercel connection failed');
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      stopPoll();
      window.removeEventListener('message', onMessage);
    };
  }, [open, stopPoll, onConnected]);

  async function startConnect() {
    setConnecting(true);
    setError(null);
    try {
      const { url, oauthConfigured: configured } = await api.vercel.oauthUrl();
      if (!url || !configured) {
        setShowTokenForm(true);
        setConnecting(false);
        setError(null);
        return;
      }
      const popup = window.open(url, 'xroga-vercel-oauth', 'width=600,height=700,scrollbars=yes');
      if (!popup) {
        setError('Allow popups to connect Vercel, or paste your token below.');
        setShowTokenForm(true);
        setConnecting(false);
        return;
      }

      pollRef.current = setInterval(async () => {
        try {
          if (popup.closed) {
            stopPoll();
            const status = await api.vercel.status();
            setConnecting(false);
            if (status.connected) {
              onConnected(status.username);
            } else {
              setError('Vercel connection was not completed. Paste your token below or try again.');
              setShowTokenForm(true);
            }
            return;
          }
          const status = await api.vercel.status();
          if (status.connected) {
            stopPoll();
            popup.close();
            setConnecting(false);
            onConnected(status.username);
          }
        } catch {
          /* keep polling */
        }
      }, 1500);
    } catch (e) {
      setConnecting(false);
      setShowTokenForm(true);
      setError((e as Error).message);
    }
  }

  async function connectWithToken() {
    const token = tokenInput.trim();
    if (token.length < 12) {
      setError('Paste a valid Vercel token from vercel.com/account/tokens');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const res = await api.vercel.connectToken(token);
      setConnecting(false);
      setTokenInput('');
      onConnected(res.username);
    } catch (e) {
      setConnecting(false);
      setError((e as Error).message);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl modal-glass universe-fade-in overflow-hidden border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Triangle className="w-5 h-5 text-[var(--foreground)]" />
            <h2 className="font-semibold text-sm">Connect your Vercel account</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            Deploys go to <strong>your</strong> Vercel account — not Xroga&apos;s. Connect once and every build
            auto-deploys the exact code from GitHub.
          </p>
          <div className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-3 text-[11px] text-[var(--muted)] space-y-2">
            <p className="font-semibold text-[var(--foreground)]">Vercel OAuth app settings</p>
            <p>
              In your Vercel app settings, add this exact callback URL — <strong>not</strong> just{' '}
              <code className="text-[10px]">https://xroga.com</code>:
            </p>
            <code className="block text-[10px] font-mono text-emerald-400 break-all">
              https://xroga.com/dashboard/integrations/vercel/callback
            </code>
            <p>
              <strong>Client authentication:</strong> use <code className="text-[10px]">client_secret_post</code> (JSON body).
              Xroga sends <code className="text-[10px]">client_id</code> + <code className="text-[10px]">client_secret</code> in the token exchange — not Basic auth or JWT.
            </p>
            <p>
              <strong>Permissions to enable:</strong> Read User, Read/Write Deployment. Optional: Read Project.
              You do <strong>not</strong> need openid, email, profile, offline_access, billing, or env-var scopes.
            </p>
            <p>
              <strong>Fly.io secrets:</strong> <code className="text-[10px]">VERCEL_CLIENT_ID</code>,{' '}
              <code className="text-[10px]">VERCEL_CLIENT_SECRET</code>,{' '}
              <code className="text-[10px]">VERCEL_OAUTH_CALLBACK_URL</code>.{' '}
              <code className="text-[10px]">VERCEL_API_KEY</code> is Xroga server-only — not used for user OAuth.
            </p>
          </div>
          {oauthConfigured === false && !showTokenForm ? (
            <p className="text-xs text-amber-400/90 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5">
              OAuth is not configured on the server. Use a personal access token from{' '}
              <a
                href="https://vercel.com/account/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-[var(--accent)]"
              >
                vercel.com/account/tokens
              </a>{' '}
              (Full Account scope).
            </p>
          ) : null}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {!showTokenForm ? (
            <button
              type="button"
              onClick={startConnect}
              disabled={connecting}
              className="w-full py-3 rounded-xl bg-[var(--foreground)] text-[var(--background)] font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 connect-pulse"
            >
              {connecting ? 'Waiting for Vercel…' : 'Authorize with Vercel'}
            </button>
          ) : null}
          {(showTokenForm || oauthConfigured === false) && (
            <div className="space-y-2 pt-1 border-t border-white/10">
              <p className="text-xs font-semibold text-[var(--foreground)]">Or paste your Vercel token</p>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="vercel_… or personal access token"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm font-mono focus:outline-none focus:border-[var(--accent)]/50"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => void connectWithToken()}
                disabled={connecting}
                className="w-full py-2.5 rounded-xl border border-[var(--accent)]/40 text-[var(--accent)] font-semibold text-sm hover:bg-[var(--accent)]/10 disabled:opacity-60"
              >
                {connecting ? 'Connecting…' : 'Connect with token'}
              </button>
            </div>
          )}
          {oauthConfigured && !showTokenForm ? (
            <button
              type="button"
              onClick={() => setShowTokenForm(true)}
              className="w-full text-xs text-[var(--muted)] hover:text-[var(--accent)] underline"
            >
              Use personal access token instead
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
