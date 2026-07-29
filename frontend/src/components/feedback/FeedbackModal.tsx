'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Send, X } from 'lucide-react';
import { communityApi, communityCategoryLabel, type CommunityCategory } from '@/lib/community';

const DRAFT_KEY = 'xroga-community-draft';
const categories = Object.entries(communityCategoryLabel) as Array<[CommunityCategory, string]>;

interface Draft {
  category: CommunityCategory;
  title: string;
  body: string;
}

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>({ category: 'feedback', title: '', body: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [publishedId, setPublishedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const stored = window.sessionStorage.getItem(DRAFT_KEY);
    if (stored) {
      try {
        const value = JSON.parse(stored) as Partial<Draft>;
        setDraft({
          category: categories.some(([key]) => key === value.category) ? value.category as CommunityCategory : 'feedback',
          title: typeof value.title === 'string' ? value.title : '',
          body: typeof value.body === 'string' ? value.body : '',
        });
      } catch {
        window.sessionStorage.removeItem(DRAFT_KEY);
      }
    }
    window.setTimeout(() => titleRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, a[href]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open, submitting]);

  if (!open || typeof document === 'undefined') return null;

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (draft.title.trim().length < 5 || draft.title.trim().length > 150) {
      setError('Title must be between 5 and 150 characters.');
      return;
    }
    if (draft.body.trim().length < 10 || draft.body.trim().length > 5000) {
      setError('Message must be between 10 and 5,000 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const { post } = await communityApi.createPost({ ...draft, title: draft.title.trim(), body: draft.body.trim() });
      window.sessionStorage.removeItem(DRAFT_KEY);
      setPublishedId(post.id);
    } catch (reason) {
      const status = typeof reason === 'object' && reason && 'status' in reason ? Number(reason.status) : 0;
      if (status === 401) {
        window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        window.location.assign('/auth/login?next=%2Fcommunity%3Fcompose%3D1');
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Your post could not be published.');
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[500] grid place-items-center bg-slate-950/70 p-3 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !submitting && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="community-modal-title" className="w-full max-w-xl overflow-hidden rounded-3xl border border-cyan-400/20 bg-[var(--card)] text-[var(--foreground)] shadow-[0_32px_100px_rgba(0,0,0,.45)]">
        <div className="h-1 bg-gradient-to-r from-[#006aff] via-cyan-400 to-violet-500" />
        <div className="p-5 sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="community-modal-title" className="text-xl font-black tracking-tight">Post to Xroga Community</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Your post will be publicly visible in the Xroga Community.</p>
            </div>
            <button type="button" onClick={onClose} disabled={submitting} aria-label="Close community post dialog" className="rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"><X className="h-5 w-5" /></button>
          </div>

          {publishedId ? (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-5" role="status">
              <CheckCircle2 className="mb-3 h-7 w-7 text-emerald-500" />
              <p className="font-bold">Published successfully</p>
              <Link href={`/community/${publishedId}`} onClick={onClose} className="mt-3 inline-flex font-semibold text-[#006aff] hover:underline">View your post →</Link>
            </div>
          ) : (
            <form onSubmit={publish} className="space-y-4">
              <label className="block text-sm font-semibold">Category
                <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as CommunityCategory }))} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 font-normal" disabled={submitting}>
                  {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold">Title
                <input ref={titleRef} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} minLength={5} maxLength={150} required disabled={submitting} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 font-normal" placeholder="What should the community know?" />
                <span className="mt-1 block text-right text-[11px] text-[var(--muted)]">{draft.title.length}/150</span>
              </label>
              <label className="block text-sm font-semibold">Message
                <textarea value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} minLength={10} maxLength={5000} required disabled={submitting} rows={7} className="mt-1.5 w-full resize-y rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 font-normal" placeholder="Describe your idea, question, feedback, or bug." />
                <span className="mt-1 block text-right text-[11px] text-[var(--muted)]">{draft.body.length}/5,000</span>
              </label>
              {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600" role="alert">{error}</p>}
              <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#006aff] px-4 py-3 font-bold text-white transition hover:bg-[#0055cc] disabled:cursor-wait disabled:opacity-60">
                <Send className="h-4 w-4" /> {submitting ? 'Publishing…' : 'Post to Community'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
