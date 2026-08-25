'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Triangle } from 'lucide-react';
import { api } from '@/lib/api';

interface VercelBuildGateModalProps {
  open: boolean;
  onClose: () => void;
  onConnected: (username?: string) => void;
}

/** Connect the user's Vercel account through Xroga's permissioned OAuth App. */
export function VercelBuildGateModal({ open, onClose, onConnected }: VercelBuildGateModalProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopPoll();
      setConnecting(false);
      setError(null);
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
      const { openVercelOAuthPopup, goToVercelIntegrations } = await import('@/lib/vercelConnect');
      const result = await openVercelOAuthPopup();
      if (result.goToIntegrations && !result.opened) {
        setConnecting(false);
        onClose();
        goToVercelIntegrations({ error: result.error });
        return;
      }
      if (!result.oauthConfigured) {
        setConnecting(false);
        setError(result.error || 'Vercel connection is temporarily unavailable.');
        return;
      }
      if (!result.opened) {
        setError(result.error || 'Could not start Vercel authorization. Please try again.');
        setConnecting(false);
        return;
      }
      if (!result.popup) {
        return;
      }

      pollRef.current = setInterval(async () => {
        try {
          const status = await api.vercel.status();
          if (status.connected && status.canDeploy === true) {
            stopPoll();
            setConnecting(false);
            onConnected(status.username);
            return;
          }
        } catch {
          /* keep polling */
        }
      }, 1500);
      timeoutRef.current = setTimeout(() => {
        stopPoll();
        setConnecting(false);
        setError('Vercel authorization timed out. Click Authorize with Vercel to try again.');
      }, 120_000);
    } catch (err) {
      setError((err as Error).message || 'Could not start Vercel connect');
      setConnecting(false);
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
            can publish to the project you choose. New GitHub repositories are linked automatically when Vercel permits it.
          </p>
          <div className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-3 text-xs text-[var(--muted)]">
            Xroga requests only the Vercel access needed to list projects, create deployments, and sync project environment variables. You can disconnect at any time.
          </div>
          {oauthConfigured === false ? (
            <p className="text-xs text-amber-400/90 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5">
              Vercel authorization is temporarily unavailable. No personal token is required or accepted here.
            </p>
          ) : null}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="button"
            onClick={startConnect}
            disabled={connecting || oauthConfigured === false}
            className="w-full py-3 rounded-xl bg-[var(--foreground)] text-[var(--background)] font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 connect-pulse"
          >
            {connecting ? 'Waiting for Vercel…' : 'Authorize with Vercel'}
          </button>
        </div>
      </div>
    </div>
  );
}
