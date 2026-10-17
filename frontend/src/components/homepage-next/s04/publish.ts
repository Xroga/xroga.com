/**
 * S04 · Publish with Xroga: copy, the three release stories and their timelines.
 *
 * One scene state machine drives everything (S04Publish.tsx):
 *   idle → use → inspect → verified → extract → compose → package → ready
 * Each destination has its own beat times because each product does something different: Arcset logs a set,
 * Ridgeline jumps a gate, MerchantLens opens its panel and fills it, so the acts take different lengths.
 * Every value is illustrative: no store, account, payment or build is connected and nothing is shown as
 * submitted, approved, paid or live. No coding-tool brand appears as a source.
 */
import type { StoreId } from './storeMarks';

export type Dest = 'ios' | 'android' | 'chrome';
export type Origin = 'existing' | 'xroga';
export const DESTS: Dest[] = ['ios', 'android', 'chrome'];

/* ------------------------------------------------------------------ product geometry (natural pixels) */
export const NATURAL: Record<Dest, { w: number; h: number }> = {
  ios: { w: 214, h: 432 },
  android: { w: 520, h: 244 },
  chrome: { w: 548, h: 318 },
};

/** the region that becomes the store asset, in the product's own pixels, at the store's aspect ratio */
export const CROP: Record<Dest, { x: number; y: number; w: number; h: number }> = {
  ios: { x: 7, y: 0, w: 200, h: 432 }, // portrait screenshot, 1320 × 2868 (≈ 0.46)
  android: { x: 10, y: 0, w: 500, h: 244 }, // feature graphic, 1024 × 500 (≈ 2.05)
  chrome: { x: 0, y: 0, w: 548, h: 318 }, // the browser window, set on a 1280 × 800 (1.6) backdrop in the listing
};
/** MerchantLens's second asset: its own side panel, lifted into the promo tile */
export const PANEL = { x: 352, y: 66, w: 196, h: 252 };

/** the scene's phases, in order; a phase shows everything up to and including itself */
export type Phase = 'idle' | 'use' | 'inspect' | 'verified' | 'extract' | 'compose' | 'package' | 'ready';
export const PHASES: Phase[] = ['idle', 'use', 'inspect', 'verified', 'extract', 'compose', 'package', 'ready'];
export const reached = (now: Phase, p: Phase) => PHASES.indexOf(now) >= PHASES.indexOf(p);
export const isPhase = (v: unknown): v is Phase => typeof v === 'string' && (PHASES as string[]).includes(v);

/** when each phase begins (ms from the start of the scene); `end` is when the scene settles */
export type Beats = Record<Exclude<Phase, 'idle'>, number> & { end: number };
export const BEATS: Record<Dest, Beats> = {
  // the set is logged quickly; inspection and the portrait capture carry the scene
  ios: { use: 700, inspect: 2300, verified: 3300, extract: 4300, compose: 6000, package: 7300, ready: 8600, end: 10000 },
  // the glide over the gate takes a moment, so inspection waits for the landing
  android: { use: 600, inspect: 2500, verified: 3400, extract: 4300, compose: 6000, package: 7200, ready: 8400, end: 9800 },
  // the panel opens and fills field by field; two captures (viewport, then the panel itself)
  chrome: { use: 600, inspect: 2600, verified: 3500, extract: 4400, compose: 6400, package: 7500, ready: 8700, end: 10100 },
};
/** MerchantLens lifts a second asset (its own panel → the promo tile) this long after the first capture */
export const SECOND_CAPTURE_DELAY = 700;
export const CAPTURE_MS = 1150;

/** the process map under the theater: six positions, each pointing at the phase it seeks to */
export const STEPS: { key: string; label: string; phase: Phase }[] = [
  { key: 'use', label: 'Use', phase: 'use' },
  { key: 'test', label: 'Test', phase: 'inspect' },
  { key: 'verify', label: 'Verify', phase: 'verified' },
  { key: 'capture', label: 'Capture', phase: 'extract' },
  { key: 'package', label: 'Package', phase: 'package' },
  { key: 'review', label: 'Review', phase: 'ready' },
];
export const stepIndex = (p: Phase) => {
  let i = -1;
  STEPS.forEach((s, k) => {
    if (reached(p, s.phase)) i = k;
  });
  return i;
};

export const COPY = {
  eyebrow: 'Publish & distribute',
  title: 'Build anywhere. Publish with Xroga.',
  lede: 'From a working product to a release ready for review, in one workspace. App Store, Google Play and Chrome Web Store.',
  navLabel: 'Publishing to',
  origin: { existing: 'Bring an existing project', xroga: 'Built with Xroga' } as Record<Origin, string>,
  cta: 'Prepare a release in Xroga',
  replay: 'Replay',
  note: 'Product walkthrough. No store accounts are connected and nothing is submitted or charged.',
};

export interface Story {
  store: StoreId;
  storeName: string;
  purpose: string;
  product: string;
  maker: string;
  tagline: string;
  ask: string;
  originNote: Record<Origin, string>;
  /** what the visitor sees the product do, and the button that does it */
  action: string;
  /** the evidence Xroga writes once it has watched the action */
  evidence: { title: string; line: string; meta: string };
  /** what the captured region becomes in the store */
  capture: { label: string; spec: string };
  pkg: { name: string; type: string; state: string };
  owner: { title: string; step: string; pending: string };
}

export const STORY: Record<Dest, Story> = {
  ios: {
    store: 'appstore',
    storeName: 'App Store',
    purpose: 'iPhone app',
    product: 'Arcset',
    maker: 'Arcset Labs',
    tagline: 'Strength training, set by set',
    ask: 'Publish my workout app.',
    originNote: { existing: 'Existing project', xroga: 'Built with Xroga' },
    action: 'Complete set',
    evidence: { title: 'Action confirmed', line: 'Complete set logged set 3 and closed the ring at 3/3.', meta: 'tap target 48 pt · clear of home indicator' },
    capture: { label: 'Screenshot 1', spec: '6.9" display · 1320 × 2868' },
    pkg: { name: 'Arcset 1.0 (12)', type: 'iOS build', state: 'Prepared for signing' },
    owner: { title: 'Connect your Apple Developer account', step: 'Signing, privacy answers and submission stay with you.', pending: 'App privacy answers drafted · you confirm' },
  },
  android: {
    store: 'googleplay',
    storeName: 'Google Play',
    purpose: 'Android game',
    product: 'Ridgeline',
    maker: 'Ridgeline Studio',
    tagline: 'Glide the ridges at dusk',
    ask: 'Get my game on Google Play.',
    originNote: { existing: 'Existing project', xroga: 'Built with Xroga' },
    action: 'Jump',
    evidence: { title: 'Control responds', line: 'Jump lifted the glider over the gate on the next frame.', meta: 'touch 64 dp · clear of gesture bar' },
    capture: { label: 'Feature graphic', spec: '1024 × 500 · from the tested gameplay' },
    pkg: { name: 'Ridgeline 1.0 (7)', type: 'Android App Bundle', state: 'Ready for a testing track' },
    owner: { title: 'Open your Play Console', step: 'You upload the bundle and choose the track.', pending: 'Data safety answers drafted · you confirm' },
  },
  chrome: {
    store: 'chromewebstore',
    storeName: 'Chrome Web Store',
    purpose: 'Browser extension',
    product: 'MerchantLens',
    maker: 'MerchantLens',
    tagline: 'Research products as you browse',
    ask: 'Launch my extension.',
    originNote: { existing: 'Existing project', xroga: 'Built with Xroga' },
    action: 'Open MerchantLens',
    evidence: { title: 'Panel populated', line: 'Read this product page and compared three prices, from this tab only.', meta: 'activeTab · no host permissions' },
    capture: { label: 'Screenshot 1', spec: '1280 × 800 · plus promo tile 440 × 280' },
    pkg: { name: 'MerchantLens 1.0', type: 'Extension package', state: 'Manifest V3 · permissions justified' },
    owner: { title: 'Open your developer dashboard', step: 'You submit the package for Chrome Web Store review.', pending: 'Permission justification drafted · you confirm' },
  },
};

export const RELEASE = {
  xroga: 'Xroga',
  service: 'Release preparation and store coordination',
  price: 'Price shown before payment',
  action: 'Review in Xroga',
  owner: 'Owner action required',
  illustrative: 'Illustrative',
  evidenceChecked: 'Evidence checked',
  prepared: 'Package prepared',
};
