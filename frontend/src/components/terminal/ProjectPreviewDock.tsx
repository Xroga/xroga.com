'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { buildInlinePreviewDocument } from '@/lib/landingPreview';
import { api } from '@/lib/api';

/** Single bottom/side preview — uses user's Vercel domain when live, else sandbox srcDoc. */
export function ProjectPreviewDock() {
  const open = useProjectWorkspaceStore((s) => s.previewOpen);
  const setPreviewOpen = useProjectWorkspaceStore((s) => s.setPreviewOpen);
  const html = useProjectWorkspaceStore((s) => s.html);
  const css = useProjectWorkspaceStore((s) => s.css);
  const js = useProjectWorkspaceStore((s) => s.js);
  const repo = useProjectWorkspaceStore((s) => s.repo);
  const branch = useProjectWorkspaceStore((s) => s.branch);
  const deployUrl = useProjectWorkspaceStore((s) => s.deployUrl);
  const lastUpdateAt = useProjectWorkspaceStore((s) => s.lastUpdateAt);
  const hydratePreviewFromDisk = useProjectWorkspaceStore((s) => s.hydratePreviewFromDisk);
  const applyBuild = useProjectWorkspaceStore((s) => s.applyBuild);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    void (async () => {
      await hydratePreviewFromDisk();
      const state = useProjectWorkspaceStore.getState();
      if (state.html?.trim()) {
        if (!state.previewOpen) setPreviewOpen(true);
        return;
      }
      // Fallback: reload preview files from GitHub when metadata survived refresh
      if (state.repo?.includes('/')) {
        try {
          const files = await api.github.getBuildFiles(state.repo);
          if (files.html?.trim()) {
            applyBuild({
              repo: state.repo,
              branch: state.branch || branch || 'main',
              html: files.html,
              css: files.css || '',
              js: files.js || '',
              openPreview: true,
              status: state.deployUrl ? 'live' : 'pushed',
            });
          }
        } catch {
          /* ignore */
        }
      }
    })();
  }, [hydratePreviewFromDisk, applyBuild, setPreviewOpen, branch]);

  const sandboxDoc = useMemo(
    () => (html?.trim() ? buildInlinePreviewDocument(html, css, js) : ''),
    [html, css, js]
  );

  const useLiveDomain = Boolean(
    deployUrl &&
      (/vercel\.app/i.test(deployUrl) || /netlify\.app/i.test(deployUrl) || /^https?:\/\//i.test(deployUrl))
  );

  if (!open || (!sandboxDoc && !useLiveDomain)) return null;

  const label = useLiveDomain
    ? `Live · ${deployUrl!.replace(/^https?:\/\//, '').slice(0, 48)}`
    : `Sandbox${repo ? ` · ${repo.split('/')[1]}` : ''}`;

  return (
    <div className="rounded-xl border border-[var(--card-border)]/55 bg-[var(--card)]/70 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--card-border)]/40">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] truncate">
          Preview · {label}
          {lastUpdateAt ? ` · ${new Date(lastUpdateAt).toLocaleTimeString()}` : ''}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {useLiveDomain ? (
            <a
              href={deployUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-[#006aff] hover:bg-[#006aff]/10"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setPreviewOpen(false)}
            className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5"
            aria-label="Close preview"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {useLiveDomain ? (
        <iframe
          key={`live-${deployUrl}-${lastUpdateAt ?? 0}`}
          title="Vercel live preview"
          src={deployUrl!}
          className="w-full h-[min(420px,50vh)] bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      ) : (
        <iframe
          key={lastUpdateAt ?? 'preview'}
          title="Xroga project preview"
          srcDoc={sandboxDoc}
          className="w-full h-[min(420px,50vh)] bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      )}
    </div>
  );
}
