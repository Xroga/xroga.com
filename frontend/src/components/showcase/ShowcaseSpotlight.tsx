'use client';

/**
 * The featured preview at the top of the showcase.
 *
 * This is the real product, running, and interactive — you can click through it here
 * without leaving the page. The device switcher changes the actual viewport width the
 * product renders at, so its own media queries and touch targets apply rather than a
 * scaled-down desktop layout being passed off as a phone view.
 */

import { useMemo, useState } from 'react';
import { ArrowUpRight, Laptop, Smartphone, Tablet } from 'lucide-react';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { LivePreviewFrame } from './LivePreviewFrame';
import { isLive, previewRouteFor, type ShowcaseTemplate } from '@/lib/showcase/registry';
import { cn } from '@/lib/utils';

const DEVICES = [
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900, icon: Laptop },
  { id: 'tablet', label: 'Tablet', width: 834, height: 1000, icon: Tablet },
  { id: 'mobile', label: 'Mobile', width: 414, height: 760, icon: Smartphone },
] as const;

type DeviceId = (typeof DEVICES)[number]['id'];

export function ShowcaseSpotlight({
  templates,
  onCustomize,
  onGithub,
}: {
  templates: readonly ShowcaseTemplate[];
  /** Cards are clean tiles now, so the spotlight is where you act on a product. */
  onCustomize?: (template: ShowcaseTemplate) => void;
  onGithub?: (template: ShowcaseTemplate) => void;
}) {
  const playable = useMemo(() => templates.filter(isLive), [templates]);
  const [activeId, setActiveId] = useState(playable[0]?.id ?? '');
  const [deviceId, setDeviceId] = useState<DeviceId>('desktop');

  const active = playable.find((template) => template.id === activeId) ?? playable[0];
  const device = DEVICES.find((item) => item.id === deviceId) ?? DEVICES[0];
  const route = active ? previewRouteFor(active) : null;

  if (!active || !route) return null;

  return (
    <section
      aria-labelledby="showcase-spotlight-heading"
      className="overflow-hidden rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="min-w-0">
          <h2 id="showcase-spotlight-heading" className="text-sm font-semibold text-[var(--text-primary)]">
            Try it right here
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            The real product, running and clickable. Not a screenshot or a video.
          </p>
        </div>

        {/* Device switcher */}
        <div
          role="radiogroup"
          aria-label="Preview width"
          className="ml-auto flex items-center gap-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-0.5"
        >
          {DEVICES.map((item) => {
            const Icon = item.icon;
            const selected = item.id === deviceId;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                title={`${item.label} — ${item.width}px`}
                onClick={() => setDeviceId(item.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  selected
                    ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-subtle'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Product switcher */}
      <div
        role="tablist"
        aria-label="Choose a product to preview"
        className="flex gap-1.5 overflow-x-auto border-b border-[var(--border-subtle)] px-4 py-2.5 scrollbar-hide"
      >
        {playable.map((template) => {
          const selected = template.id === active.id;
          return (
            <button
              key={template.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveId(template.id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                selected
                  ? 'border-transparent text-white'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
              )}
              style={selected ? { background: template.accent } : undefined}
            >
              {template.name}
            </button>
          );
        })}
      </div>

      {/* The running product */}
      <div className="bg-[var(--surface-inset)] p-3 sm:p-5">
        <div
          className="mx-auto overflow-hidden rounded-token-md border border-[var(--border-subtle)] bg-white shadow-elevated"
          style={{ maxWidth: device.width }}
        >
          <LivePreviewFrame
            // Remounting on device or product change guarantees the product boots at
            // the new width instead of reflowing an already-loaded document.
            key={`${active.id}-${device.id}`}
            src={route}
            title={`${active.name} interactive preview`}
            designWidth={device.width}
            designHeight={device.height}
            scaleMode="actual"
            interactive
          />
        </div>

        <div className="mx-auto mt-4 flex max-w-3xl flex-col items-center gap-3 text-center">
          <p className="text-[11px] text-[var(--text-secondary)]">
            {active.name} at {device.width}px — {active.shortDescription}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {onCustomize && (
              <button
                type="button"
                onClick={() => onCustomize(active)}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                Customize for me
              </button>
            )}
            {onGithub && (
              <button
                type="button"
                onClick={() => onGithub(active)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <GitHubIcon className="h-3.5 w-3.5" />
                Use in GitHub
              </button>
            )}
            <a
              href={route}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 text-[11px] font-semibold text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              Open in a new tab
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
