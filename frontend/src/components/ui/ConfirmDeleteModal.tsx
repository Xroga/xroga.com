'use client';

import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ConfirmDeleteModal({
  open,
  title,
  message,
  confirmLabel = 'Delete permanently',
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Cancel"
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-2xl">
        <h3 className="text-base font-semibold text-red-400">{title}</h3>
        <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">{message}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-[var(--card-border)] py-2.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              'flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white',
              busy && 'opacity-60',
            )}
          >
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ModalCloseButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--card-border)] text-[var(--foreground)] hover:bg-white/5',
        className,
      )}
      aria-label="Close menu"
    >
      <X className="h-5 w-5" />
    </button>
  );
}
