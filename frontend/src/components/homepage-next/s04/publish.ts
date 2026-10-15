/**
 * S04 · Publish with Xroga — copy and the three release stories.
 * Origin (where the project comes from), destination (which store) and the example product are kept apart; only the
 * destination switches the example. Every value is illustrative: no store, account, payment or build is connected and
 * nothing is shown as submitted, approved or live. No coding-tool brand appears as a source.
 */
import type { StoreId } from './storeMarks';

export type Dest = 'ios' | 'android' | 'chrome';
export type Origin = 'existing' | 'xroga';
export const DESTS: Dest[] = ['ios', 'android', 'chrome'];

export const COPY = {
  eyebrow: 'Publish & release',
  title: 'Build anywhere. Publish with Xroga.',
  lede: 'Bring an app or website. Xroga prepares its release for iOS, Android and Chrome.',
  origin: { existing: 'Bring an existing project', xroga: 'Built with Xroga' } as Record<Origin, string>,
  cta: 'Prepare a release in Xroga',
  note: 'Illustrative release · no store accounts connected, nothing submitted or charged.',
};

export const STORY: Record<
  Dest,
  {
    store: StoreId;
    storeName: string;
    kind: string;
    product: string;
    tagline: string;
    ask: string;
    /** what Xroga checked, captured and still needs from the owner; three short lines */
    work: { tested: string; captured: string; prepared: string };
    lensLabel: string;
    pkg: { name: string; type: string };
    next: string;
    owner: string;
  }
> = {
  ios: {
    store: 'appstore',
    storeName: 'App Store',
    kind: 'iPhone app',
    product: 'Arcset',
    tagline: 'Strength training, set by set',
    ask: 'Publish my workout app.',
    work: { tested: 'Tap tested', captured: 'Screen captured', prepared: 'Listing prepared' },
    lensLabel: '“Complete set” · 48 pt target',
    pkg: { name: 'Arcset 1.0 (12)', type: 'iOS build' },
    next: 'Connect your Apple account',
    owner: 'App privacy answers · review before submission',
  },
  android: {
    store: 'googleplay',
    storeName: 'Google Play',
    kind: 'Android game',
    product: 'Ridgeline',
    tagline: 'Glide the ridges at dusk',
    ask: 'Get my game on Google Play.',
    work: { tested: 'Jump tested', captured: 'Gameplay captured', prepared: 'Feature graphic prepared' },
    lensLabel: '“Jump” · clear of the gesture bar',
    pkg: { name: 'Ridgeline 1.0 (7)', type: 'Android App Bundle' },
    next: 'Upload in Play Console',
    owner: 'Data safety answers · review before submission',
  },
  chrome: {
    store: 'chromewebstore',
    storeName: 'Chrome Web Store',
    kind: 'Chrome extension',
    product: 'MerchantLens',
    tagline: 'Research products as you browse',
    ask: 'Launch my extension.',
    work: { tested: 'Click tested', captured: 'Panel captured', prepared: 'Store images prepared' },
    lensLabel: 'Reads this tab only, on click',
    pkg: { name: 'MerchantLens 1.0', type: 'Extension package' },
    next: 'Open Chrome Developer Dashboard',
    owner: 'Permission justification · review before submission',
  },
};
