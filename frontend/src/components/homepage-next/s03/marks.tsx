/**
 * Provider marks for S03, taken from the `simple-icons` package already used by the homepage (CC0 package licence;
 * the marks remain trademarks of their owners and are shown only to name services, never to imply endorsement).
 * Ahrefs is not in simple-icons (removed at the owner's request) and no official file is in the repository, so it is
 * named in plain type until an official asset is supplied.
 */
import { siGoogleads, siGoogleanalytics, siGooglesearchconsole, siGoogletagmanager, siHubspot, siMeta, siSemrush, type SimpleIcon } from 'simple-icons';
import type { ToolId } from './data';

const ICONS: Partial<Record<ToolId, SimpleIcon>> = {
  semrush: siSemrush,
  gsc: siGooglesearchconsole,
  ga: siGoogleanalytics,
  gtm: siGoogletagmanager,
  gads: siGoogleads,
  meta: siMeta,
  hubspot: siHubspot,
};

export const hasMark = (id: ToolId) => !!ICONS[id];

export function ToolMark({ id, size = 20, className }: { id: ToolId; size?: number; className?: string }) {
  const m = ICONS[id];
  if (!m) return null;
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path fill={`#${m.hex}`} d={m.path} />
    </svg>
  );
}
