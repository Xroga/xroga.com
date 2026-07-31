'use client';

import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DevicePreview } from './DevicePreview';
import { ShowcaseGrid } from './ShowcaseGrid';
import { SHOWCASE_TEMPLATES, type ShowcaseTemplate } from '@/lib/showcase/registry';

export function ShowcaseDetail({
  template,
  previewRoute,
}: {
  template: ShowcaseTemplate;
  previewRoute: string | null;
}) {
  const related = SHOWCASE_TEMPLATES.filter((item) => item.id !== template.id).slice(0, 3);

  return (
    <div className="space-y-12">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{template.category}</Badge>
          <Badge tone="accent" dot>
            <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
            Built with Xroga AI
          </Badge>
          <Badge tone="neutral">v{template.templateVersion}</Badge>
          {template.status === 'building' && <Badge tone="warning">In development</Badge>}
        </div>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          {template.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
          {template.longDescription}
        </p>

        {template.demoDataNotice && (
          <p className="mt-3 rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            {template.demoDataNotice}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => document.getElementById('showcase-start')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          >
            Customize for me
          </Button>
          {previewRoute && (
            <Button variant="secondary" onClick={() => window.open(previewRoute, '_blank', 'noopener,noreferrer')}>
              Open full preview
            </Button>
          )}
        </div>
      </header>

      <section aria-labelledby="showcase-capabilities">
        <h2 id="showcase-capabilities" className="text-lg font-semibold text-[var(--text-primary)]">
          What it includes
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {template.capabilities.map((capability) => (
            <li key={capability} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              {capability}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {template.technologies.map((tech) => (
            <Badge key={tech} tone="neutral">
              {tech}
            </Badge>
          ))}
        </div>
      </section>

      <section aria-labelledby="showcase-preview">
        <h2 id="showcase-preview" className="text-lg font-semibold text-[var(--text-primary)]">
          Interactive preview
        </h2>
        {previewRoute ? (
          <div className="mt-3">
            <DevicePreview src={previewRoute} title={`${template.name} interactive preview`} />
          </div>
        ) : (
          <p className="mt-3 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-6 text-sm text-[var(--text-secondary)]">
            This product is still being prepared for the template workflow, so there is no interactive preview yet. The
            capabilities above describe what it will ship with.
          </p>
        )}
      </section>

      <section aria-labelledby="showcase-start">
        <h2 id="showcase-start" className="text-lg font-semibold text-[var(--text-primary)]">
          Start from this build
        </h2>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
          Customize it with Xroga AI, or copy it into a repository you own.
        </p>
        <div className="mt-4 max-w-sm">
          <ShowcaseGrid templates={[template]} columnsClassName="grid-cols-1" />
        </div>
      </section>

      {related.length > 0 && (
        <section aria-labelledby="showcase-related">
          <h2 id="showcase-related" className="text-lg font-semibold text-[var(--text-primary)]">
            More Xroga builds
          </h2>
          <div className="mt-4">
            <ShowcaseGrid templates={related} compact />
          </div>
        </section>
      )}
    </div>
  );
}
