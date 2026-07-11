'use client';

import { useMemo, useState } from 'react';
import { Maximize2, Monitor, Smartphone, Tablet, RefreshCw } from 'lucide-react';
import { buildInlinePreviewDocument } from '@/lib/landingPreview';
import { normalizeBuildFiles } from '@/lib/normalizeBuildSource';
import { cn } from '@/lib/utils';
import { FullscreenPreviewModal } from './FullscreenPreviewModal';

type SandboxTab = 'preview' | 'html' | 'css' | 'js';
export type PreviewViewport = 'mobile' | 'tablet' | 'desktop';

interface BuildCodeSandboxProps {
  html: string;
  css: string;
  js: string;
  className?: string;
  projectTitle?: string;
  viewport?: PreviewViewport;
  onViewportChange?: (v: PreviewViewport) => void;
  showViewportControls?: boolean;
}

const TABS: Array<{ id: SandboxTab; label: string }> = [
  { id: 'preview', label: 'Preview' },
  { id: 'html', label: 'index.html' },
  { id: 'css', label: 'styles.css' },
  { id: 'js', label: 'script.js' },
];

const VIEWPORT_WIDTH: Record<PreviewViewport, string> = {
  mobile: '375px',
  tablet: '768px',
  desktop: '100%',
};

export function BuildCodeSandbox({
  html,
  css,
  js,
  className,
  projectTitle,
  viewport = 'desktop',
  onViewportChange,
  showViewportControls = false,
}: BuildCodeSandboxProps) {
  const [tab, setTab] = useState<SandboxTab>('preview');
  const [fullscreen, setFullscreen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const normalized = useMemo(() => normalizeBuildFiles(html, css, js), [html, css, js]);
  const mergedPreview = useMemo(
    () => buildInlinePreviewDocument(normalized.html, normalized.css, normalized.js),
    [normalized.html, normalized.css, normalized.js]
  );

  const codeContent =
    tab === 'html'
      ? normalized.html
      : tab === 'css'
        ? normalized.css
        : tab === 'js'
          ? normalized.js
          : '';

  return (
    <>
      <div className={cn('flex flex-col border border-[var(--card-border)] rounded-lg bg-[var(--foreground)]/[0.02]', className)}>
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--card-border)] overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'shrink-0 px-2.5 py-1 rounded-md text-[10px] font-mono transition-colors',
                tab === t.id
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5'
              )}
            >
              {t.label}
            </button>
          ))}
          {tab === 'preview' && showViewportControls && onViewportChange ? (
            <div className="ml-auto flex items-center gap-0.5 shrink-0">
              {(
                [
                  { id: 'mobile' as const, icon: Smartphone, label: 'Mobile' },
                  { id: 'tablet' as const, icon: Tablet, label: 'Tablet' },
                  { id: 'desktop' as const, icon: Monitor, label: 'Desktop' },
                ] as const
              ).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  onClick={() => onViewportChange(id)}
                  className={cn(
                    'p-1 rounded-md transition-colors',
                    viewport === id ? 'text-[var(--accent)] bg-[var(--accent)]/10' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
              <button
                type="button"
                title="Refresh preview"
                onClick={() => setRefreshKey((k) => k + 1)}
                className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : null}
          {tab === 'preview' ? (
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors',
                showViewportControls ? '' : 'ml-auto',
                'bg-[var(--accent)] text-[var(--background)] hover:opacity-90'
              )}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Full Preview
            </button>
          ) : null}
        </div>

        {tab === 'preview' ? (
          <div className="flex justify-center p-2 bg-[var(--foreground)]/[0.03]">
            <iframe
              key={refreshKey}
              srcDoc={mergedPreview}
              title="Merged site preview"
              className="rounded-lg border border-[var(--card-border)] bg-white transition-all duration-300"
              style={{
                width: VIEWPORT_WIDTH[viewport],
                maxWidth: '100%',
                height: viewport === 'mobile' ? 520 : viewport === 'tablet' ? 480 : 360,
              }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        ) : (
          <pre className="p-3 text-[10px] font-mono text-[var(--foreground)]/85 overflow-auto max-h-[min(70vh,720px)] whitespace-pre-wrap break-words">
            {codeContent || '(empty)'}
          </pre>
        )}
      </div>

      <FullscreenPreviewModal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        html={normalized.html}
        css={normalized.css}
        js={normalized.js}
        title={projectTitle ?? 'Preview'}
      />
    </>
  );
}
