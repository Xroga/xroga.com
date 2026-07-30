'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Upload, Check, Camera, Loader2 } from 'lucide-react';
import { XROGA_PROFILE_AVATARS } from '@/lib/profileAvatars';
import { cn } from '@/lib/utils';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface AvatarPickerModalProps {
  open: boolean;
  onClose: () => void;
  currentUrl?: string | null;
  onSelect: (url: string) => void | Promise<void>;
  onUpload?: (file: File) => void | Promise<void>;
}

export function AvatarPickerModal({
  open,
  onClose,
  currentUrl,
  onSelect,
  onUpload,
}: AvatarPickerModalProps) {
  const [picking, setPicking] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = originalOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  async function pick(url: string) {
    setPicking(url);
    try {
      await onSelect(url);
      onClose();
    } finally {
      setPicking(null);
    }
  }

  async function handleFile(file: File) {
    if (!onUpload) return;
    setUploading(true);
    try {
      await onUpload(file);
      onClose();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-picker-title"
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-elevated focus:outline-none sm:max-w-md sm:rounded-token-lg"
      >
        <div className="shrink-0 border-b border-[var(--border-subtle)] px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-dim)]">
                  <Camera className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Profile
                </span>
              </div>
              <h2 id="avatar-picker-title" className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                Choose your avatar
              </h2>
              <p className="mt-1 max-w-sm text-xs text-[var(--text-secondary)]">
                Pick a profile photo or upload your own
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          <section>
            <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Profile photos
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
              {XROGA_PROFILE_AVATARS.map((avatar, i) => {
                const selected = currentUrl === avatar.url;
                const loading = picking === avatar.url;
                return (
                  <button
                    key={avatar.url}
                    type="button"
                    disabled={!!picking || uploading}
                    onClick={() => void pick(avatar.url)}
                    aria-pressed={selected}
                    className="flex flex-col items-center gap-1 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] rounded-token-sm"
                  >
                    <span
                      className={cn(
                        'relative block aspect-square w-full max-w-[88px] overflow-hidden rounded-token-md border-2 transition-all hover:scale-105',
                        selected
                          ? 'border-[var(--accent)] ring-2 ring-[var(--accent-dim)]'
                          : 'border-[var(--border-subtle)] hover:border-[var(--accent)]/60',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatar.url}
                        alt={avatar.label}
                        className="w-full h-full object-cover"
                        loading={i < 5 ? 'eager' : 'lazy'}
                      />
                      {selected && (
                        <span className="absolute inset-0 flex items-center justify-center bg-[var(--accent)]/30">
                          <Check className="h-5 w-5 text-white" aria-hidden="true" />
                        </span>
                      )}
                      {loading && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className="text-[9px] font-semibold text-[var(--text-muted)]">{avatar.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-inset)] px-4 py-4 sm:px-5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={uploading || !!picking}
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-token-md bg-[var(--accent)] py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
            {uploading ? 'Uploading…' : 'Upload custom photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
