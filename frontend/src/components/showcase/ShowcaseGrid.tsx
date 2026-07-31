'use client';

/**
 * A plain grid of showcase cards wired to the shared workflows.
 *
 * Used by the workspace starter strip and the "start from this build" section on a
 * detail page. /showcase uses ShowcaseBrowser instead, which adds search and
 * filtering on top of the same cards and the same workflows.
 */

import { ShowcaseCard } from './ShowcaseCard';
import { useShowcaseWorkflows } from './ShowcaseDialogs';
import { SHOWCASE_TEMPLATES, type ShowcaseTemplate } from '@/lib/showcase/registry';
import { cn } from '@/lib/utils';

export function ShowcaseGrid({
  templates = SHOWCASE_TEMPLATES,
  compact = false,
  columnsClassName,
  onPromptReady,
}: {
  templates?: readonly ShowcaseTemplate[];
  compact?: boolean;
  columnsClassName?: string;
  /** See useShowcaseWorkflows — hands the built prompt to a host composer. */
  onPromptReady?: (prompt: string, template: ShowcaseTemplate) => void;
}) {
  const { openCustomize, openGithub, dialogs } = useShowcaseWorkflows({ onPromptReady });

  return (
    <>
      <div
        className={cn(
          'grid gap-4',
          columnsClassName ?? (compact ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'),
        )}
      >
        {templates.map((template) => (
          <ShowcaseCard
            key={template.id}
            template={template}
            compact={compact}
            onCustomize={openCustomize}
            onGithub={openGithub}
          />
        ))}
      </div>

      {dialogs}
    </>
  );
}
