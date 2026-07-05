'use client';

import { useMemo, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { buildInlinePreviewDocument } from '@/lib/landingPreview';
import { normalizeBuildFiles } from '@/lib/normalizeBuildSource';
import { cn } from '@/lib/utils';
import { FullscreenPreviewModal } from './FullscreenPreviewModal';

type SandboxTab = 'preview' | 'html' | 'css' | 'js';

interface BuildCodeSandboxProps {
  html: string;
  css: string;
  js: string;
  className?: string;
  projectTitle?: string;
}

const TABS: Array<{ id: SandboxTab; label: string }> = [
  { id: 'preview', label: 'Preview' },
  { id: 'html', label: 'index.html' },
  { id: 'css', label: 'styles.css' },
  { id: 'js', label: 'script.js' },
];

export function BuildCodeSandbox({ html, css, js, className, projectTitle }: BuildCodeSandboxProps) {
  const [tab, setTab] = useState<SandboxTab>('preview');
  const [fullscreen, setFullscreen] = useState(false);

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
      <div className={cn('flex flex-col border-t border-white/10 bg-black/20', className)}>
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/10 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'shrink-0 px-2.5 py-1 rounded-md text-[10px] font-mono transition-colors',
                tab === t.id
                  ? 'bg-[#006aff]/20 text-[#93c5fd] border border-[#006aff]/40'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5'
              )}
            >
              {t.label}
            </button>
          ))}
          {tab === 'preview' ? (
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-[#006aff] text-white hover:bg-[#0056d6] transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Full Preview
            </button>
          ) : null}
        </div>

        {tab === 'preview' ? (
          <iframe
            srcDoc={mergedPreview}
            title="Merged site preview"
            className="w-full h-[min(360px,50vh)] border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <pre className="w-full h-[min(360px,50vh)] overflow-auto p-3 text-[10px] sm:text-[11px] font-mono leading-relaxed text-[var(--foreground)]/90 bg-black/30">
            {codeContent || '/* empty */'}
          </pre>
        )}
      </div>

      <FullscreenPreviewModal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        html={normalized.html}
        css={normalized.css}
        js={normalized.js}
        title={projectTitle ? `Full preview — ${projectTitle}` : 'Full site preview'}
      />
    </>
  );
}
