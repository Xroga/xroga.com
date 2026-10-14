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
  // Search & Visibility: observe → identify → propose → ask
  {
    view: 'search',
    stage: 'Noticed',
    caption: 'A service page can’t be reached.',
    dur: 2600,
    steps: [
      { at: 0, actions: [{ type: 'view', view: 'search' }, { type: 'lens', lens: 'health' }, set({ issue: 'broken', repair: false }), { type: 'crawl' }] },
    ],
  },
  { view: 'search', stage: 'Prepared', caption: 'Fix the path customers need.', dur: 1600, steps: [{ at: 0, actions: [set({ repair: true })] }] },
  {
    view: 'search',
    stage: 'Noticed',
    caption: 'People are looking. Your page is missing.',
    dur: 2400,
    steps: [
      { at: 0, actions: [{ type: 'lens', lens: 'content' }, set({ query: 'cost', brief: false })] },
      { at: 1300, actions: [set({ brief: true })] },
    ],
  },
  {
    view: 'search',
    stage: 'Noticed',
    caption: 'AI answers cite other sources.',
    dur: 2400,
    steps: [
      { at: 0, actions: [{ type: 'lens', lens: 'ai' }, set({ sample: 'today', aiFix: false })] },
      { at: 1300, actions: [set({ aiFix: true })] },
    ],
  },
  {
    view: 'search',
    stage: 'Noticed',
    caption: 'Competitors have links you don’t.',
    dur: 2000,
    steps: [{ at: 0, actions: [{ type: 'lens', lens: 'links' }, { type: 'mode', mode: 'gap' }, set({ source: 'guide' })] }],
  },
  {
    view: 'search',
    stage: 'Prepared',
    caption: 'An outreach pitch, ready for your review.',
    dur: 1800,
    steps: [{ at: 0, actions: [set({ mode: 'outreach', outreach: true })] }],
  },
  {
    view: 'search',
    stage: 'For review',
    caption: 'Your local listing needs attention.',
    dur: 2400,
    steps: [
      { at: 0, actions: [{ type: 'lens', lens: 'local' }, set({ localFix: false })] },
      { at: 1200, actions: [set({ localFix: true })] },
    ],
  },
  // Launch & Marketing: offer → campaign → channels → customers
  {
    view: 'growth',
    stage: 'Prepared',
    caption: 'Turn an offer into a launch plan.',
    dur: 2200,
    steps: [
      { at: 0, actions: [{ type: 'view', view: 'growth' }, { type: 'mission', mission: 'launch' }, set({ asset: 'positioning' })] },
      { at: 1100, actions: [set({ asset: 'page' })] },
    ],
  },
  {
    view: 'growth',
    stage: 'Prepared',
    caption: 'Target real buyers. Exclude the wrong searches.',
    dur: 2800,
    steps: [
      { at: 0, actions: [{ type: 'mission', mission: 'search' }, set({ group: 'subscription', excluded: false })] },
      { at: 1300, actions: [set({ excluded: true })] },
    ],
  },
  {
    view: 'growth',
    stage: 'Prepared',
    caption: 'One offer. The right message for each channel.',
    dur: 2600,
    steps: [
      { at: 0, actions: [{ type: 'mission', mission: 'social' }, set({ placement: 'feed', audience: 'new' })] },
      { at: 1300, actions: [set({ placement: 'story' })] },
    ],
  },
  {
    view: 'growth',
    stage: 'For review',
    caption: 'See where interest becomes customers.',
    dur: 2600,
    steps: [
      { at: 0, actions: [{ type: 'mission', mission: 'paths' }, set({ channel: 'search' })] },
      { at: 1300, actions: [set({ channel: 'social' })] },
    ],
  },
];

export const TOUR_MS = BEATS.reduce((t, b) => t + b.dur, 0);
