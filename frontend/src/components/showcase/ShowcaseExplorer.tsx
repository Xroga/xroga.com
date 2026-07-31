'use client';

/**
 * The /showcase experience: an interactive spotlight over a searchable catalogue,
 * both wired to the same customize and export workflows as everywhere else.
 */

import { ShowcaseSpotlight } from './ShowcaseSpotlight';
import { ShowcaseBrowser } from './ShowcaseBrowser';
import { useShowcaseWorkflows } from './ShowcaseDialogs';
import { SHOWCASE_TEMPLATES } from '@/lib/showcase/registry';

export function ShowcaseExplorer() {
  const { openCustomize, openGithub, dialogs } = useShowcaseWorkflows();

  return (
    <div className="space-y-12">
      {/* Cards are clean tiles that link to a detail page; the spotlight is where a
          product can be customised or exported once you have actually tried it. */}
      <ShowcaseSpotlight templates={SHOWCASE_TEMPLATES} onCustomize={openCustomize} onGithub={openGithub} />
      <ShowcaseBrowser templates={SHOWCASE_TEMPLATES} />
      {dialogs}
    </div>
  );
}
