'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, GitBranch } from 'lucide-react';
import { api } from '@/lib/api';

interface GitHubBuildGateModalProps {
  open: boolean;
  onClose: () => void;
  onConnected: (username?: string) => void;
}

/** Blocks build until GitHub OAuth completes — opens popup then resumes engine */
export function GitHubBuildGateModal({ open, onClose, onConnected }: GitHubBuildGateModalProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      return;
    }
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'xroga-github-connected') {
        stopPoll();
        setConnecting(false);
        onConnected(e.data.username as string | undefined);
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      stopPoll();
      window.removeEventListener('message', onMessage);
    };
  }, [open, stopPoll, onConnected, onClose]);

  async function startConnect() {
    setConnecting(true);
    setError(null);
    try {
      const { url } = await api.github.oauthUrl();
      const popup = window.open(url, 'xroga-github-oauth', 'width=600,height=700,scrollbars=yes');
      if (!popup) {
        setError('Allow popups to connect GitHub, or use Integrations in Settings.');
        setConnecting(false);
        return;
      }

      pollRef.current = setInterval(async () => {
        try {
          if (popup.closed) {
            stopPoll();
            const status = await api.github.status();
            setConnecting(false);
            if (status.connected) {
              onConnected(status.username);
            } else {
              setError('GitHub connection was not completed. Try again.');
            }
            return;
          }
          const status = await api.github.status();
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
            <GitBranch className="w-5 h-5 text-[var(--foreground)]" />
            <h2 className="font-semibold text-sm">Connect GitHub to start building</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            🔗 XROGA needs GitHub before it builds any code. Once connected, your project is auto-pushed to a
            repository and deployed to a live preview — no errors, just your project live.
          </p>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="button"
            onClick={startConnect}
            disabled={connecting}
            className="w-full py-3 rounded-xl bg-[var(--foreground)] text-[var(--background)] font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 connect-pulse"
          >
            {connecting ? 'Waiting for GitHub…' : 'Connect GitHub'}
          </button>
        </div>
      </div>
    </div>
  );
}
