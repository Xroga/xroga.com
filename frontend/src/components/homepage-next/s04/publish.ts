/**
 * S04 · Release Studio (V10): copy, the three release scenarios and their timelines.
 *
 * Each destination is one scenario played as a list of beats. A beat belongs to a phase:
 *   idle → use → inspect → finding → produce → compose → ready
 * use      the product does its own thing (Arcset logs a set, Fernway saves a trail map offline, MerchantLens reads a page);
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
  // timed by what the visitor must take in: the tap and its result, then each captured screen, then the page
  ios: {
    beats: [
      { id: 'idle', phase: 'idle', at: 0 },
      { id: 'tap', phase: 'use', at: 900 },
      { id: 'inspect', phase: 'inspect', at: 2600 },
      { id: 'finding', phase: 'finding', at: 3900 },
      { id: 'shot1', phase: 'produce', at: 5100 },
      { id: 'shot2', phase: 'produce', at: 6300 },
      { id: 'shot3', phase: 'produce', at: 7500 },
      { id: 'compose', phase: 'compose', at: 8800 },
      { id: 'ready', phase: 'ready', at: 10600 },
    ],
    end: 12000,
  },
  // the app's own reaction needs time (progress, badge, snackbar); the graphic composes over two seconds
  android: {
    beats: [
      { id: 'idle', phase: 'idle', at: 0 },
      { id: 'save', phase: 'use', at: 1000 },
      { id: 'inspect', phase: 'inspect', at: 3700 },
      { id: 'finding', phase: 'finding', at: 5100 },
      { id: 'visuals', phase: 'produce', at: 6400 },
      { id: 'shots', phase: 'produce', at: 8700 },
      { id: 'listing', phase: 'compose', at: 10100 },
      { id: 'ready', phase: 'ready', at: 12200 },
    ],
    end: 13800,
  },
  // the panel opens and fills; the access check is read, then narrowed; the listing gets its own entrance
  chrome: {
    beats: [
      { id: 'idle', phase: 'idle', at: 0 },
      { id: 'open', phase: 'use', at: 1000 },
      { id: 'inspect', phase: 'inspect', at: 3900 },
      { id: 'finding', phase: 'finding', at: 5200 },
      { id: 'narrow', phase: 'finding', at: 6700 },
      { id: 'screenshot', phase: 'produce', at: 8000 },
      { id: 'tile', phase: 'produce', at: 9200 },
      { id: 'compose', phase: 'compose', at: 10400 },
      { id: 'ready', phase: 'ready', at: 12400 },
    ],
    end: 13900,
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
    { key: 'behavior', label: 'App tested', starts: 'inspect', settles: 'finding', doneNote: 'In preview' },
    { key: 'shots', label: 'Screenshots', starts: 'shot1', settles: 'compose', doneNote: '3 art-directed' },
    { key: 'meta', label: 'Listing text', starts: 'compose', settles: 'ready', doneNote: 'Drafted' },
    { key: 'build', label: 'iOS build', starts: 'compose', settles: 'ready', doneNote: 'On your Expo account' },
    { key: 'privacy', label: 'App Privacy', starts: 'ready', settles: 'ready', owner: true, doneNote: 'You confirm' },
    { key: 'submit', label: 'Submit for review', starts: 'ready', settles: 'ready', owner: true, doneNote: 'In App Store Connect' },
  ],
  android: [
    { key: 'play', label: 'App tested', starts: 'inspect', settles: 'finding', doneNote: 'In preview' },
    { key: 'graphic', label: 'Store visuals', starts: 'visuals', settles: 'listing', doneNote: 'Graphic + screenshots' },
    { key: 'listing', label: 'Listing text', starts: 'listing', settles: 'ready', doneNote: 'Drafted' },
    { key: 'bundle', label: 'Android build', starts: 'listing', settles: 'ready', doneNote: 'On your Expo account' },
    { key: 'safety', label: 'Data safety', starts: 'ready', settles: 'ready', owner: true, doneNote: 'You confirm' },
    { key: 'track', label: 'Testing & release', starts: 'ready', settles: 'ready', owner: true, doneNote: 'In Play Console' },
  ],
  chrome: [
    { key: 'behavior', label: 'Extension tested', starts: 'inspect', settles: 'finding', doneNote: 'In preview' },
    { key: 'perms', label: 'Access reviewed', starts: 'finding', settles: 'screenshot', doneNote: 'Only the open tab' },
    { key: 'assets', label: 'Store images', starts: 'screenshot', settles: 'compose', doneNote: 'Screenshot + tile' },
    { key: 'package', label: 'Package', starts: 'compose', settles: 'ready', doneNote: 'Checked' },
    { key: 'privacy', label: 'Privacy', starts: 'ready', settles: 'ready', owner: true, doneNote: 'You certify' },
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
  lede: 'Bring your app, game or Chrome extension, built in Xroga or brought from an existing project. Xroga helps prepare it for the App Store, Google Play or Chrome Web Store. You approve what ships.',
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
  /** the work panel during preparation: the accomplishment, its tasks (each settles at a beat) and the spec, quietly */
  work: { title: string; tasks: { label: string; from: string; to: string }[]; spec: string };
  owner: { title: string; steps: string[] };
  /** the scene's opening statement, in plain language */
  intro: { title: string; line: string; example: string };
  /** the handoff: what Xroga prepared, what the owner does, and where it goes next */
  handoff: { title: string; headline: string; prepared: string[]; yours: string[]; next: string; cta: string };
}

export const STORY: Record<Dest, Story> = {
  ios: {
    store: 'appstore',
    storeName: 'App Store',
    kind: 'iPhone apps & games',
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
    work: {
      title: 'Preparing your App Store presentation',
      tasks: [
        { label: 'Capturing the app’s real screens', from: 'shot1', to: 'shot3' },
        { label: 'Composing the screenshots', from: 'shot2', to: 'compose' },
        { label: 'Preparing the listing', from: 'compose', to: 'ready' },
      ],
      spec: 'Screenshots sized for 6.9″ iPhone · 1320 × 2868',
    },
    intro: { title: 'Launch your iPhone app.', line: 'Xroga tests it, prepares screenshots and the listing, and gets it ready for App Store review.', example: 'Example: Arcset, a fitness app' },
    handoff: {
      title: 'App Store release prepared',
      headline: 'Arcset is ready for your App Store review',
      prepared: ['App tested', 'Screenshots', 'Listing', 'iOS build'],
      yours: ['Connect your Apple Developer account', 'Confirm App Privacy', 'Submit for App Review'],
      next: 'Next: you submit in App Store Connect, then Apple reviews it.',
      cta: 'Review App Store release',
    },
  },
  android: {
    store: 'googleplay',
    storeName: 'Google Play',
    kind: 'Android apps & games',
    product: 'Fernway',
    maker: 'Fernway Labs',
    version: '1.0 (4)',
    say: {
      idle: 'Ready to test Fernway',
      use: 'Saving a trail map for offline use',
      inspect: 'Checking the offline map works',
      finding: 'Preparing your Google Play release',
      produce: 'Building the store visuals',
      compose: 'Your Google Play listing',
      ready: 'Waiting for your review',
    },
    finding: {
      kicker: 'Google Play release',
      title: 'Preparing your Google Play release',
      detail: 'Store visuals and listing text come from your own app screens. The build runs on your Expo account.',
    },
    owner: {
      title: 'Ready for your review',
      steps: ['Confirm the Data safety answers', 'Upload the build in Play Console', 'Choose a testing or production track'],
    },
    work: {
      title: 'Preparing your Google Play release',
      tasks: [
        { label: 'Composing the feature graphic from your app', from: 'visuals', to: 'shots' },
        { label: 'Rendering phone screenshots', from: 'shots', to: 'listing' },
        { label: 'Drafting the listing', from: 'listing', to: 'ready' },
      ],
      spec: 'Feature graphic 1024 × 500 · Android build on your Expo account',
    },
    intro: { title: 'Launch your Android app or game.', line: 'Xroga helps prepare your app, store visuals, listing and release steps for Google Play.', example: 'Example: Fernway, a trail-map app' },
    handoff: {
      title: 'Google Play release prepared',
      headline: 'Fernway is ready for your Google Play review',
      prepared: ['App tested', 'Feature graphic', 'Screenshots', 'Listing', 'Android build'],
      yours: ['Confirm Data safety', 'Review the build in Play Console', 'Choose a testing or release track'],
      next: 'Next: you release it in Play Console, then Google reviews it.',
      cta: 'Review Google Play release',
    },
  },
  chrome: {
    store: 'chromewebstore',
    storeName: 'Chrome Web Store',
    kind: 'Browser extensions',
    product: 'MerchantLens',
    maker: 'MerchantLens',
    version: '1.0.0',
    say: {
      idle: 'Ready to test MerchantLens',
      use: 'Opening MerchantLens on a product page',
      inspect: 'Checking what your extension can access',
      finding: 'Access narrowed to what it needs',
      produce: 'Rendering the store images',
      compose: 'Your Chrome Web Store listing',
      ready: 'Waiting for your approval',
    },
    finding: {
      kicker: 'Release check',
      title: 'It asked to read every website',
      detail: 'MerchantLens only needs the tab you click on. Asking for less keeps review simpler and makes people more comfortable installing it.',
    },
    owner: {
      title: 'Ready for your approval',
      steps: ['Certify the privacy practices', 'Approve the submission', 'Google reviews it before it goes live'],
    },
    work: {
      title: 'Preparing your Chrome Web Store release',
      tasks: [
        { label: 'Narrowing the extension’s access', from: 'finding', to: 'screenshot' },
        { label: 'Rendering the store images', from: 'screenshot', to: 'compose' },
        { label: 'Writing the listing', from: 'compose', to: 'ready' },
      ],
      spec: 'Screenshot 1280 × 800 · promo tile 440 × 280 · Manifest V3',
    },
    intro: { title: 'Launch your Chrome extension.', line: 'Xroga helps prepare the extension package, store listing, permissions and review steps.', example: 'Example: MerchantLens, a shopping extension' },
    handoff: {
      title: 'Chrome Web Store release prepared',
      headline: 'MerchantLens is ready for your Chrome Web Store review',
      prepared: ['Extension tested', 'Access narrowed', 'Store images', 'Listing', 'Package'],
      yours: ['Complete the listing and privacy tabs once', 'Certify the privacy practices', 'Approve the submission'],
      next: 'Next: Google reviews it before anyone can install it.',
      cta: 'Review Chrome Web Store release',
    },
  },
};

/** product geometry, in the products' own pixels */
export const NATURAL: Record<Dest, { w: number; h: number }> = {
  ios: { w: 280, h: 600 },
  android: { w: 300, h: 640 },
  chrome: { w: 900, h: 552 },
};
