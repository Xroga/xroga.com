/**
 * The guided demonstration: fixed beats that drive the same state the visitor drives. Each beat names the stage of the
 * work in everyday words (Found, Compared, Prepared, Needs approval), carries one short caption that describes what is
 * on screen by the end of the beat, and runs a few state steps at set offsets. Nothing here publishes or connects
 * anything; the tour only selects local states. Wider screens get the full story (about 20 s); phones get a shorter one.
 */
import type { Chapter, Action } from './state';

export type Stage = 'Found' | 'Compared' | 'Prepared' | 'Needs approval';
export interface Beat {
  view: Chapter;
  stage: Stage;
  caption: string;
  dur: number; // ms the beat is held
  steps: { at: number; actions: Action[] }[];
}

const set = (patch: Record<string, unknown>): Action => ({ type: 'set', patch });

const CRAWL: Beat = {
  view: 'search',
  stage: 'Found',
  caption: 'Found a broken product page; prepared the repair.',
  dur: 2200,
  steps: [
    { at: 0, actions: [{ type: 'view', view: 'search' }, { type: 'lens', lens: 'health' }, set({ issue: 'broken', repair: false }), { type: 'crawl' }] },
    { at: 1300, actions: [set({ repair: true })] },
  ],
};
const KEYWORDS: Beat = {
  view: 'search',
  stage: 'Compared',
  caption: 'Compared buyer searches; drafted the missing page.',
  dur: 2600,
  steps: [
    { at: 0, actions: [{ type: 'lens', lens: 'content' }, set({ query: 'which', brief: false })] },
    { at: 1400, actions: [set({ brief: true })] },
  ],
};
// the AI lens reveals its own sequence on entry: question, cited sources, then PeakForm's unconnected product page
const AI_CHECK: Beat = {
  view: 'search',
  stage: 'Found',
  caption: 'Checked which sources an AI answer cites.',
  dur: 2600,
  steps: [{ at: 0, actions: [{ type: 'lens', lens: 'ai' }, set({ sample: 'buy', aiFix: false, aiCheck: false, aiPick: null })] }],
};
const AI_FIX: Beat = {
  view: 'search',
  stage: 'Prepared',
  caption: 'Prepared clearer product facts for your review.',
  dur: 1900,
  steps: [
    { at: 0, actions: [set({ aiFix: true })] },
    { at: 1000, actions: [set({ aiCheck: true })] },
  ],
};
const LINK_GAP: Beat = {
  view: 'search',
  stage: 'Found',
  caption: 'Found a site linking only to a competitor.',
  dur: 2000,
  steps: [{ at: 0, actions: [{ type: 'lens', lens: 'links' }, { type: 'mode', mode: 'gap' }, set({ source: 'liftmag', outreach: false })] }],
};
const OUTREACH: Beat = {
  view: 'search',
  stage: 'Prepared',
  caption: 'Drafted an outreach note for your review.',
  dur: 1500,
  steps: [{ at: 0, actions: [set({ mode: 'outreach', outreach: true })] }],
};
const LOCAL: Beat = {
  view: 'search',
  stage: 'Needs approval',
  caption: 'Drafted a listing fix that needs your approval.',
  dur: 1700,
  steps: [
    { at: 0, actions: [{ type: 'lens', lens: 'local' }, set({ localFix: false })] },
    { at: 600, actions: [set({ localFix: true })] },
  ],
};
const ADS: Beat = {
  view: 'growth',
  stage: 'Prepared',
  caption: 'Matched ads to buyers; excluded the wrong searches.',
  dur: 2200,
  steps: [
    { at: 0, actions: [{ type: 'view', view: 'growth' }, { type: 'mission', mission: 'search' }, set({ group: 'subscription', excluded: false })] },
    { at: 900, actions: [set({ excluded: true })] },
  ],
};
const SOCIAL: Beat = {
  view: 'growth',
  stage: 'Prepared',
  caption: 'Reshaped one offer for each placement.',
  dur: 1800,
  steps: [
    { at: 0, actions: [{ type: 'mission', mission: 'social' }, set({ placement: 'feed', audience: 'new' })] },
    { at: 800, actions: [set({ placement: 'story' })] },
  ],
};
const RESULTS: Beat = {
  view: 'growth',
  stage: 'Found',
  caption: 'Traced visits to subscribers; found the drop-off.',
  dur: 2000,
  steps: [
    { at: 0, actions: [{ type: 'mission', mission: 'paths' }, set({ channel: 'search' })] },
    { at: 800, actions: [set({ channel: 'social' })] },
  ],
};

/** wider screens: both modes, every search lens, three marketing jobs */
export const BEATS: Beat[] = [CRAWL, KEYWORDS, AI_CHECK, AI_FIX, LINK_GAP, OUTREACH, LOCAL, ADS, SOCIAL, RESULTS];
/** phones: the same story, shorter: fewer beats, no draft overlay on the small graph */
export const MOBILE_BEATS: Beat[] = [
  { ...CRAWL, dur: 1700, steps: [CRAWL.steps[0], { at: 1000, actions: [set({ repair: true })] }] },
  { ...KEYWORDS, dur: 2100, steps: [KEYWORDS.steps[0], { at: 1100, actions: [set({ brief: true })] }] },
  AI_CHECK,
  { ...AI_FIX, dur: 1400, steps: [AI_FIX.steps[0]] },
  { ...LINK_GAP, dur: 1800 },
  { ...ADS, dur: 1900, steps: [ADS.steps[0], { at: 800, actions: [set({ excluded: true })] }] },
  { ...RESULTS, dur: 1700, steps: [RESULTS.steps[0], { at: 700, actions: [set({ channel: 'social' })] }] },
];

export const TOUR_MS = BEATS.reduce((t, b) => t + b.dur, 0);
export const MOBILE_TOUR_MS = MOBILE_BEATS.reduce((t, b) => t + b.dur, 0);
