'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ArrowUpRight, Eye, GitBranch, X } from 'lucide-react';
import { ShowcaseResumeBridge } from '@/components/showcase/ShowcaseResumeBridge';
import {
  SHOWCASE_TEMPLATES,
  THUMBNAIL_SIZES,
  previewRouteFor,
  thumbnailFor,
  type ShowcaseTemplate,
} from '@/lib/showcase/registry';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';

function TemplateCatalog({
  onSelect,
}: {
  onSelect: (template: ShowcaseTemplate) => void;
}) {
  return (
    <div className="xv-workspace-template-catalog">
      {SHOWCASE_TEMPLATES.map((template, index) => (
        <button
          key={template.id}
          type="button"
          className="xv-workspace-template-card"
          style={{ '--template-accent': template.accent } as React.CSSProperties}
          onClick={() => onSelect(template)}
          aria-label={`Explore ${template.name} template`}
        >
          <span className="xv-workspace-template-visual">
            <Image
              src={thumbnailFor(template)}
              alt=""
              width={THUMBNAIL_SIZES.desktop.width}
              height={THUMBNAIL_SIZES.desktop.height}
              sizes="(max-width: 640px) 76vw, 280px"
            />
            <span>{template.category}</span>
          </span>
          <span className="xv-workspace-template-copy">
            <span className="xv-workspace-template-title-row">
              <strong>{template.name}</strong>
              <i>Live</i>
            </span>
            <small>By Xroga templates</small>
            <span className="xv-workspace-template-meta">
              <span>{String(index + 1).padStart(2, '0')} · {template.category}</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function TemplateDecisionDialog({
  template,
  onClose,
  onUse,
}: {
  template: ShowcaseTemplate;
  onClose: () => void;
  onUse: () => void;
}) {
  const previewRoute = previewRouteFor(template);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    closeRef.current?.focus();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="xv-template-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="xv-template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="xv-template-dialog-title"
        style={{ '--template-accent': template.accent } as React.CSSProperties}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="xv-template-dialog-close" onClick={onClose} aria-label="Close template preview">
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="xv-template-dialog-preview">
          <Image
            src={thumbnailFor(template)}
            alt={`${template.name} desktop preview`}
            width={THUMBNAIL_SIZES.desktop.width}
            height={THUMBNAIL_SIZES.desktop.height}
            sizes="(max-width: 640px) 92vw, 720px"
          />
          <span>{template.category} · {template.status === 'live' ? 'Live' : 'In development'}</span>
        </div>

        <div className="xv-template-dialog-copy">
          <div>
            <p>Proven Xroga build</p>
            <h2 id="xv-template-dialog-title">{template.name}</h2>
          </div>
          <p>{template.longDescription}</p>
          <ul aria-label="Template capabilities">
            {template.capabilities.slice(0, 3).map((capability) => <li key={capability}>{capability}</li>)}
          </ul>
          <div className="xv-template-dialog-tech" aria-label="Technologies">
            {template.technologies.map((technology) => <span key={technology}>{technology}</span>)}
          </div>
        </div>

        <div className="xv-template-dialog-actions">
          {previewRoute ? (
            <a href={previewRoute} target="_blank" rel="noreferrer" className="xv-template-dialog-secondary">
              <Eye className="h-4 w-4" aria-hidden />
              Full preview
            </a>
          ) : null}
          <button type="button" className="xv-template-dialog-primary" onClick={onUse}>
            <GitBranch className="h-4 w-4" aria-hidden />
            Use prompt &amp; ship
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

/** Always-visible template rail for an empty workspace. */
export function WorkspaceShowcaseStarts({ className }: { className?: string }) {
  const { setPrompt } = useTerminalChat();
  const [selectedTemplate, setSelectedTemplate] = useState<ShowcaseTemplate | null>(null);

  const useTemplate = () => {
    if (!selectedTemplate) return;
    const prompt = `${selectedTemplate.defaultBuildPrompt}\n\nBuild this as my own responsive product, preserve the strongest interaction patterns, push the finished code to my selected GitHub repository, and verify the result before reporting completion.`;
    setPrompt(prompt);
    setSelectedTemplate(null);
    window.setTimeout(() => {
      const composer = document.querySelector<HTMLTextAreaElement>('textarea[data-terminal-composer]');
      composer?.focus();
      composer?.setSelectionRange(prompt.length, prompt.length);
    }, 20);
  };

  return (
    <>
      <section className={cn('xv-workspace-templates', className)} aria-labelledby="workspace-showcase-heading">
      <Suspense fallback={null}>
        <ShowcaseResumeBridge />
      </Suspense>

      <div className="xv-workspace-template-head">
        <nav aria-label="Template collections">
          <span>Recent builds</span>
          <i aria-hidden />
          <span>Community templates</span>
          <i aria-hidden />
          <strong id="workspace-showcase-heading">Xroga templates</strong>
        </nav>
        <Link href="/showcase">Browse all <ArrowUpRight className="h-3 w-3" aria-hidden /></Link>
      </div>

      <div className="xv-workspace-template-viewport">
        <TemplateCatalog onSelect={setSelectedTemplate} />
      </div>
      </section>
      {selectedTemplate ? (
        <TemplateDecisionDialog
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onUse={useTemplate}
        />
      ) : null}
    </>
  );
}
