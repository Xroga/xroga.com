'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2 } from 'lucide-react';
import { buildInlinePreviewDocument } from '@/lib/landingPreview';

interface FullscreenPreviewModalProps {
  open: boolean;
  onClose: () => void;
  html: string;
  css: string;
  js: string;
  title?: string;
  /** When true, hides sidebar, chatbar, and site chrome via body class */
  hideAppChrome?: boolean;
}

/**
 * Full-site preview overlay.
 * Must portal to document.body — nesting under .xv-main-column is broken because
 * body.xv-preview-active sets visibility:hidden on that column, which also hides
 * position:fixed children (users then only see the Earth wallpaper).
 */
export function FullscreenPreviewModal({
  open,
  onClose,
  html,
  css,
  js,
  title = 'Full site preview',
  hideAppChrome = false,
}: FullscreenPreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  const srcDoc = buildInlinePreviewDocument(html, css, js);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    if (hideAppChrome) {
      document.body.classList.add('xv-preview-active');
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      if (hideAppChrome) {
        document.body.classList.remove('xv-preview-active');
      }
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, hideAppChrome]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="xv-fullscreen-preview-root fixed inset-0 z-[300] flex flex-col bg-[#0b0d12]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/15 bg-black shrink-0 relative z-[2]">
        <div className="flex items-center gap-2 text-sm font-semibold text-white min-w-0">
          <Maximize2 className="w-4 h-4 text-[#006aff] shrink-0" />
          <span className="truncate">{title}</span>
          <span className="hidden sm:inline text-[11px] font-normal text-white/50">Press Esc to exit</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-bold hover:bg-white/90 transition-colors shrink-0 shadow-lg"
        >
          <X className="w-4 h-4" />
          Exit preview
        </button>
      </div>
      <iframe
        srcDoc={srcDoc}
        title={title}
        className="flex-1 w-full border-0 bg-white relative z-[1]"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>,
    document.body
  );
}
