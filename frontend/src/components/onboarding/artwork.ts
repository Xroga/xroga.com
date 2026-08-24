import type { OnboardingArtwork } from './OnboardingCard';

/**
 * The four supplied photographs.
 *
 * Hosted rather than vendored, and already allowed by `images.remotePatterns` in
 * next.config.mjs. Each carries its own `object-position` because the card crops
 * hard and these four put their subject in different places — a shared `center`
 * would behead the castle and cut the lake out of the last one.
 */
export const ONBOARDING_ARTWORK: Record<'build' | 'github' | 'vercel' | 'preparing', OnboardingArtwork> = {
  build: {
    src: 'https://i.postimg.cc/0Q2nnWyY/image.png',
    alt: 'A wide landscape at golden hour',
    // The focal subject sits below the midline; centring it crops the ground away.
    position: '50% 58%',
    positionMobile: '50% 52%',
  },
  github: {
    src: 'https://i.postimg.cc/Dybgxbnz/image.png',
    alt: 'A calm scene lit from above',
    // Weighted upward: the composition's interest is in the upper half.
    position: '50% 38%',
    positionMobile: '50% 34%',
  },
  vercel: {
    src: 'https://i.postimg.cc/KYQr1PrH/image.png',
    alt: 'A castle set into its landscape',
    // The keep is the subject and stands above centre.
    position: '50% 42%',
    positionMobile: '50% 38%',
  },
  preparing: {
    src: 'https://i.postimg.cc/1R82ZXyQ/image.png',
    alt: 'A house beside a still lake, surrounded by trees',
    // Holds the waterline: centring drops the lake below the crop on a tall card.
    position: '50% 55%',
    positionMobile: '50% 50%',
  },
};
