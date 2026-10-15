/**
 * S04 · Publish with Xroga — copy, the three release stories and the walkthrough timeline.
 * Origin (where the project comes from), destination (which store) and the example product are kept apart; only the
 * destination switches the example. Every value is illustrative: no store, account, payment or build is connected and
 * nothing is shown as submitted, approved, paid or live. No coding-tool brand appears as a source.
 */
import type { StoreId } from './storeMarks';

export type Dest = 'ios' | 'android' | 'chrome';
export type Origin = 'existing' | 'xroga';
export const DESTS: Dest[] = ['ios', 'android', 'chrome'];

/** the release steps, in order; a scene shows everything up to and including its step */
export type Step = 'ready' | 'action' | 'inspect' | 'capture' | 'listing' | 'package' | 'approval';
export const STEPS: Step[] = ['ready', 'action', 'inspect', 'capture', 'listing', 'package', 'approval'];
export const reached = (step: Step, s: Step) => STEPS.indexOf(step) >= STEPS.indexOf(s);
export const isStep = (v: unknown): v is Step => typeof v === 'string' && (STEPS as string[]).includes(v);

/** the App Store intro (once, when S04 is first in view) and the shorter branch played when a store is chosen */
export const INTRO: { step: Step; at: number }[] = [
  { step: 'ready', at: 0 },
  { step: 'action', at: 1200 },
  { step: 'inspect', at: 2700 },
  { step: 'capture', at: 4100 },
  { step: 'listing', at: 5700 },
  { step: 'package', at: 7200 },
  { step: 'approval', at: 8800 },
];
export const BRANCH: { step: Step; at: number }[] = [
  { step: 'ready', at: 0 },
  { step: 'action', at: 500 },
  { step: 'inspect', at: 1400 },
  { step: 'capture', at: 2400 },
  { step: 'listing', at: 3500 },
  { step: 'package', at: 4400 },
  { step: 'approval', at: 5400 },
];
export const CAPTURE_MS = 720;

export const COPY = {
  eyebrow: 'Publish & release',
  title: 'Build anywhere. Publish with Xroga.',
  lede: 'Bring an app or website. Xroga prepares its release for iOS, Android and Chrome.',
  navLabel: 'Publishing to',
  origin: { existing: 'Bring an existing project', xroga: 'Built with Xroga' } as Record<Origin, string>,
  cta: 'Prepare a release in Xroga',
  note: 'Product walkthrough. No store accounts are connected and nothing is submitted or charged.',
};

/** the evidence line: each item appears only once its own event has happened */
export const EVIDENCE: { step: Step; label: string; owner?: boolean }[] = [
  { step: 'inspect', label: 'Interaction tested' },
  { step: 'listing', label: 'Screen captured' },
  { step: 'package', label: 'Listing prepared' },
  { step: 'approval', label: 'Your review next', owner: true },
];

export const STORY: Record<
  Dest,
  {
    store: StoreId;
    storeName: string;
    purpose: string;
    product: string;
    tagline: string;
    ask: string;
    originNote: Record<Origin, string>;
    check: string;
    checkDetail: string;
    pkg: { name: string; type: string; state: string; tech: string };
    approval: { service: string; account: string; accountStep: string; pending: string };
  }
> = {
  ios: {
    store: 'appstore',
    storeName: 'App Store',
    purpose: 'iPhone app',
    product: 'Arcset',
    tagline: 'Strength training, set by set',
    ask: 'Publish my workout app.',
    originNote: { existing: 'Existing project', xroga: 'Built with Xroga' },
    check: 'Tap target checked',
    checkDetail: '“Complete set” · 48 pt · clear of the home indicator',
    pkg: { name: 'Arcset 1.0 (12)', type: 'iOS build', state: 'Prepared for signing', tech: 'IPA' },
    approval: {
      service: 'Release preparation and store coordination',
      account: 'Apple Developer account',
      accountStep: 'Connect it, or enrol · you control this',
      pending: 'App privacy answers and signing · your review',
    },
  },
  android: {
    store: 'googleplay',
    storeName: 'Google Play',
    purpose: 'Android app or game',
    product: 'Ridgeline',
    tagline: 'Glide the ridges at dusk',
    ask: 'Get my game on Google Play.',
    originNote: { existing: 'Existing project', xroga: 'Built with Xroga' },
    check: 'Touch control checked',
    checkDetail: '“Jump” · clear of the gesture bar · responds in one frame',
    pkg: { name: 'Ridgeline 1.0 (7)', type: 'Android App Bundle', state: 'Ready for a testing track', tech: 'AAB' },
    approval: {
      service: 'Release preparation and store coordination',
      account: 'Google Play Console account',
      accountStep: 'Connect it, or register · you upload the bundle',
      pending: 'Data safety answers · your review',
    },
  },
  chrome: {
    store: 'chromewebstore',
    storeName: 'Chrome Web Store',
    purpose: 'Browser extension',
    product: 'MerchantLens',
    tagline: 'Research products as you browse',
    ask: 'Launch my extension.',
    originNote: { existing: 'Existing project', xroga: 'Built with Xroga' },
    check: 'Permission scope checked',
    checkDetail: 'activeTab · reads this tab only, on click',
    pkg: { name: 'MerchantLens 1.0', type: 'Extension package', state: 'Manifest V3 · permissions justified', tech: 'ZIP' },
    approval: {
      service: 'Release preparation and store coordination',
      account: 'Chrome Web Store developer account',
      accountStep: 'Connect it, or register · you publish from your dashboard',
      pending: 'Permission justification · your review',
    },
  },
};

export const APPROVAL = {
  title: 'Review before submission',
  price: 'Price shown before payment',
  action: 'Review in Xroga',
  illustrative: 'Illustrative',
};
