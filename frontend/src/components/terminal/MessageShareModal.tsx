'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Link2, LoaderCircle, X } from 'lucide-react';
import { siFacebook, siReddit, siWhatsapp, siX } from 'simple-icons';
import { api, type MessageShareRecord } from '@/lib/api';
import {
  cleanShareText,
  messageShareUrl,
  socialShareUrl,
  type MessageSharePlatform,
  type MessageShareScope,
  type MessageShareVisibility,
} from '@/lib/messageShare';
import { cn } from '@/lib/utils';
import { ShareIcon } from '@/components/icons/animated/ShareIcon';
import { GlobeLockIcon } from '@/components/icons/animated/GlobeLockIcon';
import { EarthIcon } from '@/components/icons/animated/EarthIcon';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import toast from 'react-hot-toast';

type BrandDefinition = { title: string; path: string; hex?: string };

const LINKEDIN: BrandDefinition = {
  title: 'LinkedIn',
  hex: '0A66C2',
  path: 'M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.86-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V8.99h3.41v1.57h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.26 2.37 4.26 5.46v6.28zM5.33 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.11 20.45H3.55V8.99h3.56v11.46zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0z',
};

const SOCIALS: Array<{ id: MessageSharePlatform; icon: BrandDefinition }> = [
  { id: 'x', icon: siX },
  { id: 'linkedin', icon: LINKEDIN },
  { id: 'facebook', icon: siFacebook },
  { id: 'whatsapp', icon: siWhatsapp },
  { id: 'reddit', icon: siReddit },
];

function BrandIcon({ icon }: { icon: BrandDefinition }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="currentColor">
      <path d={icon.path} />
    </svg>
  );
}

interface MessageShareModalProps {
  open: boolean;
  onClose: () => void;
  prompt?: string;
  response: string;
}

export function MessageShareModal({ open, onClose, prompt = '', response }: MessageShareModalProps) {
  const hasPrompt = Boolean(cleanShareText(prompt));
  const [scope, setScope] = useState<MessageShareScope>(hasPrompt ? 'exchange' : 'response');
  const [visibility, setVisibility] = useState<MessageShareVisibility>('private');
  const [created, setCreated] = useState<MessageShareRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const cleanPrompt = useMemo(() => cleanShareText(prompt), [prompt]);
  const cleanResponse = useMemo(() => cleanShareText(response), [response]);
  const url = created ? messageShareUrl(created.token) : '';

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    setScope(hasPrompt ? 'exchange' : 'response');
    setVisibility('private');
    setCreated(null);
    setCopied(false);
    setError('');
  }, [hasPrompt, open, response]);

  function chooseScope(next: MessageShareScope) {
    setScope(next);
    setCreated(null);
    setError('');
  }

  function chooseVisibility(next: MessageShareVisibility) {
    setVisibility(next);
    setCreated(null);
    setError('');
  }

  async function createLink() {
    setBusy(true);
    setError('');
    try {
      const result = await api.messageShares.create({
        visibility,
        scope,
        prompt: scope === 'exchange' ? cleanPrompt : undefined,
        response: cleanResponse,
      });
      setCreated(result.share);
      toast.success(visibility === 'private' ? 'Private link created' : 'Public link created');
    } catch (caught) {
      setError((caught as Error).message || 'Could not create the share link.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Link copied');
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function nativeShare() {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title: 'Shared from Xroga', url });
    } catch (caught) {
      if ((caught as Error).name !== 'AbortError') toast.error('Could not open sharing');
    }
  }

  async function revokeLink() {
    if (!created) return;
    setBusy(true);
    try {
      await api.messageShares.revoke(created.token);
      setCreated(null);
      toast.success('Link revoked');
    } catch (caught) {
      setError((caught as Error).message || 'Could not revoke the link.');
    } finally {
      setBusy(false);
    }
  }

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="message-share-title" className="w-full max-w-[560px] overflow-hidden rounded-t-[24px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl sm:rounded-[22px]">
        <header className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-dim)] text-[var(--accent)]">
            <ShareIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="message-share-title" className="text-sm font-semibold text-[var(--text-primary)]">Share this answer</h2>
            <p className="truncate text-[11px] text-[var(--text-muted)]">Create a real link with exactly the content you choose.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close share dialog" className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-inset)] p-1" aria-label="Content to share">
            <button type="button" aria-pressed={scope === 'response'} onClick={() => chooseScope('response')} className={cn('rounded-[9px] px-3 py-2 text-xs font-medium transition', scope === 'response' ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]')}>Response only</button>
            <button type="button" aria-pressed={scope === 'exchange'} disabled={!hasPrompt} onClick={() => chooseScope('exchange')} className={cn('rounded-[9px] px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40', scope === 'exchange' ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]')}>Prompt + response</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={visibility === 'private'} onClick={() => chooseVisibility('private')} className={cn('flex items-center gap-2.5 rounded-xl p-2.5 text-left transition', visibility === 'private' ? 'bg-[var(--accent-dim)] text-[var(--text-primary)] shadow-sm' : 'bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:bg-[var(--surface-base)]')}>
              <AnimatedIcon icon={GlobeLockIcon} size={16} intro={false} />
              <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Private</span><span className="block truncate text-[10px] text-[var(--text-muted)]">Only your account</span></span>
              <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', visibility === 'private' ? 'bg-[var(--accent)]' : 'bg-transparent')} />
            </button>
            <button type="button" aria-pressed={visibility === 'public'} onClick={() => chooseVisibility('public')} className={cn('flex items-center gap-2.5 rounded-xl p-2.5 text-left transition', visibility === 'public' ? 'bg-[var(--accent-dim)] text-[var(--text-primary)] shadow-sm' : 'bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:bg-[var(--surface-base)]')}>
              <AnimatedIcon icon={EarthIcon} size={16} intro={false} />
              <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Public</span><span className="block truncate text-[10px] text-[var(--text-muted)]">Anyone with the link</span></span>
              <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', visibility === 'public' ? 'bg-[var(--accent)]' : 'bg-transparent')} />
            </button>
          </div>

          <div className="max-h-32 overflow-y-auto rounded-xl bg-[var(--surface-inset)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {scope === 'exchange' && <><span className="mb-1 block text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--text-muted)]">Prompt</span><p className="whitespace-pre-wrap">{cleanPrompt}</p><div className="my-2 h-px bg-[var(--border-subtle)]" /></>}
            <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--text-muted)]">Response</span>
            <p className="whitespace-pre-wrap">{cleanResponse}</p>
          </div>

          {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p>}

          {!created ? (
            <button type="button" disabled={busy || !cleanResponse} onClick={() => void createLink()} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {visibility === 'private' ? 'Create owner-only link' : 'Create public link'}
            </button>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 rounded-xl bg-[var(--surface-inset)] p-1.5">
                <span className="min-w-0 flex-1 truncate px-2 text-[11px] text-[var(--text-secondary)]">{url}</span>
                <button type="button" onClick={() => void copyLink()} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)]" aria-label="Copy share link">{copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}</button>
              </div>
              {created.visibility === 'private' ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-inset)] px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                    <AnimatedIcon icon={GlobeLockIcon} size={15} intro={false} />
                    <span className="truncate">Only your signed-in Xroga account can open it.</span>
                  </div>
                  <button type="button" disabled={busy} onClick={() => void revokeLink()} className="h-8 shrink-0 rounded-lg bg-red-500/10 px-2.5 text-[10px] font-semibold text-red-500">Revoke</button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    {SOCIALS.map(({ id, icon }) => (
                      <button key={id} type="button" title={`Share on ${icon.title}`} aria-label={`Share on ${icon.title}`} onClick={() => window.open(socialShareUrl(id, url), '_blank', 'noopener,noreferrer')} className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--surface-inset)] text-[var(--text-secondary)] transition hover:-translate-y-0.5 hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]">
                        <BrandIcon icon={icon} />
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" disabled={busy} onClick={() => void revokeLink()} className="h-9 rounded-xl bg-red-500/10 px-2.5 text-[11px] font-medium text-red-500">Revoke</button>
                    <button type="button" onClick={() => void nativeShare()} className="h-9 rounded-xl bg-[var(--accent)] px-3 text-[11px] font-semibold text-white">Share</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
