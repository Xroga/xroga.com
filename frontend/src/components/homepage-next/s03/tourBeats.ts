/**
 * The guided demonstration: a fixed list of beats that drive the same state the visitor drives. Each beat names the
 * stage of the work (noticed → prepared → for review), carries one short caption, and runs a few state steps at set
 * offsets. Nothing here publishes or connects anything; the tour only selects local states.
 */
import type { Chapter, Action } from './state';

export type Stage = 'Noticed' | 'Prepared' | 'For review';
export interface Beat {
  view: Chapter;
  stage: Stage;
  caption: string;
  dur: number; // ms the beat is held
  steps: { at: number; actions: Action[] }[];
}

const set = (patch: Record<string, unknown>): Action => ({ type: 'set', patch });

export const BEATS: Beat[] = [
  // Search & Visibility (PeakForm Nutrition): check → find a gap → prepare the work → ask before anything goes live
  {
    view: 'search',
    stage: 'Noticed',
    caption: 'Found a page customers can’t open.',
    dur: 2300,
    steps: [
      { at: 0, actions: [{ type: 'view', view: 'search' }, { type: 'lens', lens: 'health' }, set({ issue: 'broken', repair: false }), { type: 'crawl' }] },
    ],
  },
  {
    view: 'search',
    stage: 'Noticed',
    caption: 'Found a search your site doesn’t answer.',
    dur: 2500,
    steps: [
      { at: 0, actions: [{ type: 'lens', lens: 'content' }, set({ query: 'which', brief: false })] },
      { at: 1300, actions: [set({ brief: true })] },
    ],
  },
  {
    // the AI lens plays its own short sequence on entry: question, sources, then PeakForm's unconnected product page
    view: 'search',
    stage: 'Noticed',
    caption: 'Checking how AI answers find product information.',
    dur: 3000,
    steps: [{ at: 0, actions: [{ type: 'lens', lens: 'ai' }, set({ sample: 'buy', aiFix: false, aiCheck: false, aiPick: null })] }],
  },
  {
    view: 'search',
    stage: 'Prepared',
    caption: 'Better product facts, ready for review and a recheck.',
    dur: 2800,
    steps: [
      { at: 0, actions: [set({ aiFix: true })] },
      { at: 1600, actions: [set({ aiCheck: true })] },
    ],
  },
  {
    view: 'search',
    stage: 'Noticed',
    caption: 'Found a relevant site linking to a competitor.',
    dur: 2200,
    steps: [{ at: 0, actions: [{ type: 'lens', lens: 'links' }, { type: 'mode', mode: 'gap' }, set({ source: 'liftmag', outreach: false })] }],
  },
  {
    view: 'search',
    stage: 'Prepared',
    caption: 'An outreach angle, drafted for your review.',
    dur: 1600,
    steps: [{ at: 0, actions: [set({ mode: 'outreach', outreach: true })] }],
  },
  {
    view: 'search',
    stage: 'For review',
    caption: 'Prepared a local listing correction.',
    dur: 1900,
    steps: [
      { at: 0, actions: [{ type: 'lens', lens: 'local' }, set({ localFix: false })] },
      { at: 800, actions: [set({ localFix: true })] },
    ],
  },
  // Launch & Marketing: offer → campaign → channels → customers
  {
    view: 'growth',
    stage: 'Prepared',
    caption: 'Turn an offer into a launch plan.',
    dur: 2000,
    steps: [
      { at: 0, actions: [{ type: 'view', view: 'growth' }, { type: 'mission', mission: 'launch' }, set({ asset: 'positioning' })] },
      { at: 1000, actions: [set({ asset: 'page' })] },
    ],
  },
  {
    view: 'growth',
    stage: 'Prepared',
    caption: 'Target real buyers. Exclude the wrong searches.',
    dur: 2600,
    steps: [
      { at: 0, actions: [{ type: 'mission', mission: 'search' }, set({ group: 'subscription', excluded: false })] },
      { at: 1300, actions: [set({ excluded: true })] },
    ],
  },
  {
    view: 'growth',
    stage: 'Prepared',
    caption: 'One offer. The right message for each channel.',
    dur: 2400,
    steps: [
      { at: 0, actions: [{ type: 'mission', mission: 'social' }, set({ placement: 'feed', audience: 'new' })] },
      { at: 1200, actions: [set({ placement: 'story' })] },
    ],
  },
  {
    view: 'growth',
    stage: 'For review',
    caption: 'See where interest becomes customers.',
    dur: 2400,
    steps: [
      { at: 0, actions: [{ type: 'mission', mission: 'paths' }, set({ channel: 'search' })] },
      { at: 1200, actions: [set({ channel: 'social' })] },
    ],
  },
];

export const TOUR_MS = BEATS.reduce((t, b) => t + b.dur, 0);
