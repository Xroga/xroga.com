/**
 * The artwork behind each `/software` section, in the order the sections appear.
 *
 * These are the owner-supplied images, served from their host. `i.postimg.cc` is already
 * an allowed remote pattern in next.config.mjs, so `next/image` optimises them through
 * `/_next/image` rather than the browser fetching the host directly.
 *
 * This lives in its own module because the page is a server component and the bento is a
 * client one. Importing the map from the page would pull the whole server module into the
 * client bundle, and writing the URL twice would let the two drift apart silently — which
 * is the failure this file exists to prevent.
 *
 * Two things to know before changing it:
 *
 * 1. The mapping is positional. The eight URLs were supplied as an ordered list with no
 *    per-section labels, so they are assigned in page order — hero first, footer last.
 *    Reordering is a matter of moving lines here and nothing else.
 * 2. A remote host is a dependency. If one of these stops resolving, that section renders
 *    its scrim over an empty frame rather than falling back to anything. Copying the files
 *    into `public/software/` would remove that dependency; this keeps the images live
 *    without waiting for that.
 */
export const SOFTWARE_ART = {
  hero: 'https://i.postimg.cc/hjzNNC0Y/image.png',
  problem: 'https://i.postimg.cc/wxNSVGML/image.png',
  aiField: 'https://i.postimg.cc/vHLCRxWv/image.png',
  build: 'https://i.postimg.cc/8zZ3c8Xr/image.png',
  core: 'https://i.postimg.cc/0QwHVzkK/image.png',
  repository: 'https://i.postimg.cc/SRL1pHzS/image.png',
  cta: 'https://i.postimg.cc/HsHPtWfJ/image.png',
  footer: 'https://i.postimg.cc/jS3gKHC5/image.png',
} as const;

export type SoftwareArtSlot = keyof typeof SOFTWARE_ART;
