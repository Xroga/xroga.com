'use client';

import { cn } from '@/lib/utils';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { GithubGlyphIcon } from '@/components/icons/animated/GithubGlyphIcon';

/**
 * The GitHub mark, as a filled disc.
 *
 * One component rather than eleven edits: this is imported by both auth forms, the
 * marketing footer, three landing pages, the homepage ship stack, the about visual
 * and two showcase surfaces, so the disc and the animation arrive everywhere by
 * changing what it renders rather than by touching each call site.
 *
 * The disc takes `--foreground` and the glyph `--background`, which is what makes it
 * invert with the theme on its own: dark disc with a light mark on the White and
 * Beige pages, light disc with a dark mark on Black and Gray. Hardcoding either
 * colour would have left the mark invisible on half the themes.
 *
 * `intro={false}`: these sit in footers and forms rather than in navigation, and a
 * mark that waves at the reader the moment a signup page loads is noise. It plays on
 * hover, like every other icon.
 */
export function GitHubIcon({ className }: { className?: string }) {
  return (
    <span className={cn('xv-github-mark', className)} aria-hidden="true">
      <AnimatedIcon icon={GithubGlyphIcon} size={14} intro={false} />
    </span>
  );
}
