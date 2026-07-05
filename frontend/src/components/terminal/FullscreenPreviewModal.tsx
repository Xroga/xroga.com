'use client';

import { useEffect } from 'react';
import { X, Maximize2 } from 'lucide-react';
import { buildInlinePreviewDocument } from '@/lib/landingPreview';

interface FullscreenPreviewModalProps {
  open: boolean;
  onClose: () => void;
  html: string;
  css: string;
  js: string;
  title?: string;
}

export function FullscreenPreviewModal({
  open,
  onClose,
  html,
  css,
  js,
  title = 'Full site preview',
}: FullscreenPreviewModalProps) {
  const srcDoc = buildInlinePreviewDocument(html, css, js);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-black/60 shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Maximize2 className="w-4 h-4 text-[#006aff]" />
          {title}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" />
          Close
        </button>
      </div>
      <iframe
        srcDoc={srcDoc}
        title={title}
        className="flex-1 w-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}
