/**
 * S04 · Release Studio (V10): copy, the three release scenarios and their timelines.
 *
 * Each destination is one scenario played as a list of beats. A beat belongs to a phase:
 *   idle → use → inspect → finding → produce → compose → ready
 * use      the product does its own thing (Arcset logs a set, Ridgeline flies through a ring, MerchantLens reads a page);
 * inspect  Xroga locks onto the control that was used and the state it changed;
 * finding  a platform-specific release finding (screenshot sizes, a feature graphic, a permission that is too broad);
 * produce  store assets are rendered from the product itself;
 * compose  the listing and package assemble around those assets;
 * ready    the owner's decisions are laid out; nothing is submitted for them.
 *
 * Truth: the scenes are illustrative and every product is fictional. The owner steps mirror what the backend really
 * does (backend/src/services/publish/*): Chrome Web Store submission through the owner's own Google connection
 * (Google still reviews); Expo builds on the owner's own account for iOS and Android; store accounts, fees, signing
 * and final submission stay with the owner. No coding-tool brand appears as a source.
 */
import type { StoreId } from './storeMarks';

export type Dest = 'ios' | 'android' | 'chrome';
export const DESTS: Dest[] = ['ios', 'android', 'chrome'];

export type Phase = 'idle' | 'use' | 'inspect' | 'finding' | 'produce' | 'compose' | 'ready';
export const PHASES: Phase[] = ['idle', 'use', 'inspect', 'finding', 'produce', 'compose', 'ready'];
export const phaseReached = (now: Phase, p: Phase) => PHASES.indexOf(now) >= PHASES.indexOf(p);
export const isPhase = (v: unknown): v is Phase => typeof v === 'string' && (PHASES as string[]).includes(v);

export interface Beat {
  id: string;
  phase: Phase;
  at: number;
}

/** each scenario's beats, in order; `end` is when it settles */
export const SCENES: Record<Dest, { beats: Beat[]; end: number }> = {
  // a quick tap, then the long part of an App Store release: three screens captured and art-directed
  ios: {
    beats: [
      { id: 'idle', phase: 'idle', at: 0 },
      { id: 'tap', phase: 'use', at: 700 },
      { id: 'inspect', phase: 'inspect', at: 2100 },
      { id: 'finding', phase: 'finding', at: 3200 },
      { id: 'shot1', phase: 'produce', at: 4300 },
      { id: 'shot2', phase: 'produce', at: 5150 },
      { id: 'shot3', phase: 'produce', at: 6000 },
      { id: 'compose', phase: 'compose', at: 6950 },
      { id: 'ready', phase: 'ready', at: 8400 },
    ],
    end: 9800,
  },
  // gameplay carries the scene; the feature graphic is cropped, rendered and then art-directed
  android: {
    beats: [
      { id: 'idle', phase: 'idle', at: 0 },
      { id: 'lift', phase: 'use', at: 900 },
      { id: 'inspect', phase: 'inspect', at: 2500 },
      { id: 'finding', phase: 'finding', at: 3500 },
      { id: 'crop', phase: 'produce', at: 4500 },
      { id: 'render', phase: 'produce', at: 5300 },
      { id: 'grade', phase: 'produce', at: 6200 },
      { id: 'compose', phase: 'compose', at: 7100 },
      { id: 'ready', phase: 'ready', at: 8500 },
    ],
    end: 10000,
  },
  // the panel opens and reads the page; the permission finding is the heart of an extension review
  chrome: {
    beats: [
      { id: 'idle', phase: 'idle', at: 0 },
      { id: 'open', phase: 'use', at: 700 },
      { id: 'inspect', phase: 'inspect', at: 2600 },
      { id: 'finding', phase: 'finding', at: 3600 },
      { id: 'narrow', phase: 'finding', at: 4400 },
      { id: 'screenshot', phase: 'produce', at: 5300 },
      { id: 'tile', phase: 'produce', at: 6100 },
      { id: 'compose', phase: 'compose', at: 7000 },
      { id: 'ready', phase: 'ready', at: 8500 },
    ],
    end: 10000,
  },
};
export const RENDER_MS = 760;
export const beatIndex = (d: Dest, id: string) => SCENES[d].beats.findIndex((b) => b.id === id);
export const beatOf = (d: Dest, id: string) => SCENES[d].beats[Math.max(0, beatIndex(d, id))];
export const lastBeat = (d: Dest) => SCENES[d].beats[SCENES[d].beats.length - 1].id;

/** readiness: what a release to this store actually needs, and when the scene settles each item */
export type ItemState = 'pending' | 'working' | 'done' | 'owner';
export interface Item {
  key: string;
  label: string;
  /** the beat at which Xroga starts on it, and the beat at which it is done (or handed to the owner) */
  starts: string;
  settles: string;
  owner?: boolean;
  doneNote: string;
}
export const READINESS: Record<Dest, Item[]> = {
  ios: [
    { key: 'behavior', label: 'App behavior', starts: 'inspect', settles: 'finding', doneNote: 'Checked in preview' },
    { key: 'shots', label: 'Screenshots', starts: 'shot1', settles: 'compose', doneNote: '3 art-directed, 6.9″' },
    { key: 'meta', label: 'Listing text', starts: 'compose', settles: 'ready', doneNote: 'Drafted' },
    { key: 'build', label: 'Build', starts: 'compose', settles: 'ready', doneNote: 'On your Expo account' },
    { key: 'privacy', label: 'App Privacy', starts: 'ready', settles: 'ready', owner: true, doneNote: 'Your answers' },
    { key: 'submit', label: 'Signing & submission', starts: 'ready', settles: 'ready', owner: true, doneNote: 'You submit' },
  ],
  android: [
    { key: 'play', label: 'Gameplay check', starts: 'inspect', settles: 'finding', doneNote: 'Checked in preview' },
    { key: 'graphic', label: 'Feature graphic', starts: 'crop', settles: 'compose', doneNote: '1024 × 500 composed' },
    { key: 'listing', label: 'Store listing', starts: 'compose', settles: 'ready', doneNote: 'Drafted' },
    { key: 'bundle', label: 'App bundle', starts: 'compose', settles: 'ready', doneNote: 'On your Expo account' },
    { key: 'safety', label: 'Data safety', starts: 'ready', settles: 'ready', owner: true, doneNote: 'Your answers' },
    { key: 'track', label: 'Testing track', starts: 'ready', settles: 'ready', owner: true, doneNote: 'You roll out' },
  ],
  chrome: [
    { key: 'behavior', label: 'Extension behavior', starts: 'inspect', settles: 'finding', doneNote: 'Checked in preview' },
    { key: 'perms', label: 'Permissions', starts: 'finding', settles: 'screenshot', doneNote: 'Narrowed to activeTab' },
    { key: 'assets', label: 'Store images', starts: 'screenshot', settles: 'compose', doneNote: 'Screenshot + promo tile' },
    { key: 'package', label: 'Package', starts: 'compose', settles: 'ready', doneNote: 'MV3 .zip checked' },
    { key: 'privacy', label: 'Privacy practices', starts: 'ready', settles: 'ready', owner: true, doneNote: 'You certify' },
    { key: 'submit', label: 'Submit for review', starts: 'ready', settles: 'ready', owner: true, doneNote: 'With your approval' },
  ],
};
export function itemState(d: Dest, item: Item, beatId: string): ItemState {
  const now = beatIndex(d, beatId);
  if (now < beatIndex(d, item.starts)) return 'pending';
  if (now < beatIndex(d, item.settles)) return 'working';
  return item.owner ? 'owner' : 'done';
}

export const COPY = {
  eyebrow: 'Publish & distribute',
  titleA: 'Build anywhere.',
  titleB: 'Publish with Xroga.',
  lede: 'Xroga tests your app, produces the store assets, drafts the listing and prepares the package for each store. You approve what ships.',
  cta: 'Prepare a release',
  studio: 'Release Studio',
  preview: 'Illustrative preview',
  replay: 'Replay',
  note: 'Illustrative walkthrough with fictional products. No store account is connected here and nothing is submitted.',
};

export interface Story {
  store: StoreId;
  storeName: string;
  kind: string;
  product: string;
  maker: string;
  version: string;
  /** the studio's single line of narration, phase by phase */
  say: Record<Phase, string>;
  finding: { kicker: string; title: string; detail: string };
  owner: { title: string; steps: string[] };
}

export const STORY: Record<Dest, Story> = {
  ios: {
    store: 'appstore',
    storeName: 'App Store',
    kind: 'iPhone app',
    product: 'Arcset',
    maker: 'Arcset Labs',
    version: '1.0 (12)',
    say: {
      idle: 'Ready to test Arcset',
      use: 'Logging set 3 in Arcset',
      inspect: 'Checking what changed',
      finding: 'App Store needs 6.9″ screenshots',
      produce: 'Capturing and art-directing screens',
      compose: 'Composing the App Store page',
      ready: 'Waiting for your review',
    },
    finding: {
      kicker: 'App Store requirement',
      title: 'Screenshots for the 6.9″ display',
      detail: '1320 × 2868 px. Captured from real app screens, captions set to match.',
    },
    owner: {
      title: 'Ready for your review',
      steps: ['Connect your Apple Developer account', 'Confirm the App Privacy answers', 'Sign and submit in App Store Connect'],
    },
  },
  android: {
    store: 'googleplay',
    storeName: 'Google Play',
    kind: 'Android game',
    product: 'Ridgeline',
    maker: 'Ridgeline Studio',
    version: '1.0 (7)',
    say: {
      idle: 'Ready to test Ridgeline',
      use: 'Playing: lift through the ring',
      inspect: 'Checking the control response',
      finding: 'Google Play needs a feature graphic',
      produce: 'Composing the feature graphic',
      compose: 'Drafting the Google Play listing',
      ready: 'Waiting for your review',
    },
    finding: {
      kicker: 'Google Play requirement',
      title: 'A 1024 × 500 feature graphic',
      detail: 'Key art clear of the edges. Composed from your own gameplay, not a screen grab.',
    },
    owner: {
      title: 'Ready for your review',
      steps: ['Answer the Data safety form', 'Upload the bundle in Play Console', 'Choose the testing track'],
    },
  },
  chrome: {
    store: 'chromewebstore',
    storeName: 'Chrome Web Store',
    kind: 'Browser extension',
    product: 'MerchantLens',
    maker: 'MerchantLens',
    version: '1.0.0',
    say: {
      idle: 'Ready to test MerchantLens',
      use: 'Opening MerchantLens on a product page',
      inspect: 'Checking what the extension reads',
      finding: 'Host access is broader than needed',
      produce: 'Rendering the store images',
      compose: 'Assembling the submission package',
      ready: 'Waiting for your approval',
    },
    finding: {
      kicker: 'Chrome Web Store review',
      title: 'Broad host access slows review',
      detail: 'MerchantLens reads only the open tab after a click, so <all_urls> becomes activeTab.',
    },
    owner: {
      title: 'Ready for your approval',
      steps: ['Certify the privacy practices', 'Approve the submission', 'Google reviews it before it goes live'],
    },
  },
};

/** product geometry, in the products' own pixels */
export const NATURAL: Record<Dest, { w: number; h: number }> = {
  ios: { w: 280, h: 600 },
  android: { w: 880, h: 406 },
  chrome: { w: 900, h: 552 },
};
