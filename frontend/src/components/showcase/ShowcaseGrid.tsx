'use client';

/**
 * A plain grid of showcase cards.
 *
 * Cards are clean tiles. By default they link to their detail page, where a product
 * can be seen, previewed, and customised. Pass `selectable` and the whole card opens
 * the customisation flow instead — which is what the workspace wants, since picking a
 * template to build from is the reason a user is looking at this grid there.
 */

import { ShowcaseCard } from './ShowcaseCard';
import { useShowcaseWorkflows } from './ShowcaseDialogs';
import { SHOWCASE_TEMPLATES, type ShowcaseTemplate } from '@/lib/showcase/registry';
import { cn } from '@/lib/utils';

export function ShowcaseGrid({
  templates = SHOWCASE_TEMPLATES,
  compact = false,
  columnsClassName,
  selectable = false,
  onPromptReady,
}: {
  templates?: readonly ShowcaseTemplate[];
  compact?: boolean;
  columnsClassName?: string;
  /** Make the whole card open the customisation flow rather than navigate. */
  selectable?: boolean;
  /** See useShowcaseWorkflows — hands the built prompt to a host composer. */
  onPromptReady?: (prompt: string, template: ShowcaseTemplate) => void;
}) {
  const { openCustomize, dialogs } = useShowcaseWorkflows({ onPromptReady });

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
            onSelect={selectable ? openCustomize : undefined}
          />
        ))}
      </div>

      {selectable && dialogs}
    </>
  );
}
