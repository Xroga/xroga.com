'use client';

import Image from 'next/image';
import { Suspense } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { ShowcaseResumeBridge } from '@/components/showcase/ShowcaseResumeBridge';
import {
  SHOWCASE_TEMPLATES,
  THUMBNAIL_SIZES,
  thumbnailFor,
  type ShowcaseTemplate,
} from '@/lib/showcase/registry';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';

function TemplateRailGroup({ duplicate = false }: { duplicate?: boolean }) {
  const { setPrompt } = useTerminalChat();

  const chooseTemplate = (template: ShowcaseTemplate) => {
    setPrompt(template.defaultBuildPrompt);
    window.setTimeout(() => {
      const composer = document.querySelector<HTMLTextAreaElement>('textarea[data-terminal-composer]');
      composer?.focus();
      composer?.setSelectionRange(template.defaultBuildPrompt.length, template.defaultBuildPrompt.length);
    }, 20);
  };

  return (
    <div className="xv-workspace-template-group" aria-hidden={duplicate || undefined}>
      {SHOWCASE_TEMPLATES.map((template) => (
        <button
          key={`${duplicate ? 'duplicate-' : ''}${template.id}`}
          type="button"
          tabIndex={duplicate ? -1 : 0}
          className="xv-workspace-template-card"
          style={{ '--template-accent': template.accent } as React.CSSProperties}
          onClick={() => chooseTemplate(template)}
          aria-label={`Use ${template.name} template`}
        >
          <span className="xv-workspace-template-visual">
            <Image
              src={thumbnailFor(template)}
              alt=""
              width={THUMBNAIL_SIZES.desktop.width}
              height={THUMBNAIL_SIZES.desktop.height}
              sizes="220px"
            />
            <span>{template.category}</span>
          </span>
          <span className="xv-workspace-template-copy">
            <strong>{template.name}</strong>
            <small>{template.shortDescription}</small>
          </span>
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}

/** Always-visible template rail for an empty workspace. */
export function WorkspaceShowcaseStarts({ className }: { className?: string }) {
  return (
    <section className={cn('xv-workspace-templates', className)} aria-labelledby="workspace-showcase-heading">
      <Suspense fallback={null}>
        <ShowcaseResumeBridge />
      </Suspense>

      <div className="xv-workspace-template-head">
        <div>
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          <h2 id="workspace-showcase-heading">Start with a proven Xroga build</h2>
        </div>
        <span>Live templates · select to prefill</span>
      </div>

      <div className="xv-workspace-template-viewport">
        <div className="xv-workspace-template-track">
          <TemplateRailGroup />
          <TemplateRailGroup duplicate />
        </div>
      </div>
    </section>
  );
}
