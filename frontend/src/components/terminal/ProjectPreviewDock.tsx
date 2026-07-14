'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { buildInlinePreviewDocument } from '@/lib/landingPreview';

/** Single bottom/side preview for the bound repo — refreshed in place on updates. */
export function ProjectPreviewDock() {
  const open = useProjectWorkspaceStore((s) => s.previewOpen);
  const setPreviewOpen = useProjectWorkspaceStore((s) => s.setPreviewOpen);
  const html = useProjectWorkspaceStore((s) => s.html);
  const css = useProjectWorkspaceStore((s) => s.css);
  const js = useProjectWorkspaceStore((s) => s.js);
  const repo = useProjectWorkspaceStore((s) => s.repo);
  const lastUpdateAt = useProjectWorkspaceStore((s) => s.lastUpdateAt);

  const doc = useMemo(
    () => (html?.trim() ? buildInlinePreviewDocument(html, css, js) : ''),
    [html, css, js]
  );

  if (!open || !doc) return null;

  return (
    <div className="rounded-xl border border-[var(--card-border)]/55 bg-[var(--card)]/70 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--card-border)]/40">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] truncate">
          Preview{repo ? ` · ${repo.split('/')[1]}` : ''}
          {lastUpdateAt ? ` · ${new Date(lastUpdateAt).toLocaleTimeString()}` : ''}
        </p>
        <button
          type="button"
          onClick={() => setPreviewOpen(false)}
          className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5"
          aria-label="Close preview"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <iframe
        key={lastUpdateAt ?? 'preview'}
        title="Xroga project preview"
        srcDoc={doc}
        className="w-full h-[min(420px,50vh)] bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}
