'use client';

/**
 * Workspace starting point: the six showcase products instead of bare prompt chips.
 *
 * "Customize for me" here loads the composer rather than creating a project and
 * navigating — the user is already in the workspace. Collapsed to a single row of
 * three on small screens so it never dominates the composer.
 */

import { Suspense, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ShowcaseGrid } from '@/components/showcase/ShowcaseGrid';
import { ShowcaseResumeBridge } from '@/components/showcase/ShowcaseResumeBridge';
import { SHOWCASE_TEMPLATES } from '@/lib/showcase/registry';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';

export function WorkspaceShowcaseStarts({ className }: { className?: string }) {
  const { setPrompt } = useTerminalChat();
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? SHOWCASE_TEMPLATES : SHOWCASE_TEMPLATES.slice(0, 3);
  const remaining = SHOWCASE_TEMPLATES.length - visible.length;

  return (
    <section className={cn('', className)} aria-labelledby="workspace-showcase-heading">
      {/* useSearchParams needs a boundary; the bridge renders nothing either way. */}
      <Suspense fallback={null}>
        <ShowcaseResumeBridge />
      </Suspense>

      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="workspace-showcase-heading" className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Start from a Xroga build
        </h2>
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            Show {remaining} more
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      <ShowcaseGrid
        templates={visible}
        compact
        selectable
        columnsClassName="grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
        onPromptReady={(prompt) => {
          setPrompt(prompt);
          document.querySelector<HTMLTextAreaElement>('textarea[data-terminal-composer]')?.focus();
        }}
      />
    </section>
  );
}
