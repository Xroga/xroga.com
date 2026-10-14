/**
 * S03 sample data: one fictional shop, Morrow Supply, used by every world in the Growth Studio. All domains are
 * reserved `.example` names and every figure is illustrative. Nothing here is read from or sent to a real account.
 */

export type World = 'discover' | 'campaigns' | 'outcomes';
export type Intent = 'Informational' | 'Commercial' | 'Transactional';
export type Tone = 'gap' | 'weak' | 'strong';
export type Lens = 'organic' | 'ai';
export type Channel = 'search' | 'social' | 'email';
export type ToolId = 'gsc' | 'ahrefs' | 'semrush' | 'ga' | 'gtm' | 'gads' | 'meta' | 'hubspot';

export const BRAND = {
  name: 'Morrow Supply',
  domain: 'morrow-supply.example',
  sells: 'Travel bags',
  window: 'US · 28 days to 12 Oct 2026',
};

export const COMPETITORS: Record<string, { name: string; domain: string }> = {
  packwell: { name: 'Packwell', domain: 'packwell.example' },
  arcline: { name: 'Arcline Gear', domain: 'arcline.example' },
  tern: { name: 'Tern & Co.', domain: 'tern.example' },
  trail: { name: 'Trailtalk', domain: 'trailtalk.example' },
};

/* ------------------------------------------------------------------------------------------- search demand */
export interface Result {
  pos: number;
  by: string; // competitor id or 'you'
  title: string;
  note: string; // one short descriptor
}

export interface Query {
  id: string;
  query: string;
  volume: number; // monthly searches, US, sample
  intent: Intent;
  difficulty: number; // 0–100, sample
  yours: number; // your best organic position (sample snapshot)
  tone: Tone;
  status: string; // 2–4 words
  /** Where the peak sits on the terrain: x along the intent axis (0–1), and which ridge (0 = back). */
  x: number;
  ridge: number;
  results: Result[]; // the top three
  you: { title: string; note: string } | null; // your page when it is outside the top three
  ai: { question: string; cited: string[] }; // sampled AI_SAMPLES times
  headline: string; // 4–10 words
  gsc: { impressions: number; clicks: number; position: number };
  evidence: [string, string, string][]; // source, detail, date
  rival: string;
  compare: { label: string; you: string; them: string }[];
  move: string; // the prepared next step
}

export const AI_SAMPLES = 4;
export const GSC_WINDOW = '15 Sep – 12 Oct';

export const QUERIES: Query[] = [
  {
    id: 'weekend',
    query: 'lightweight weekend backpack',
    volume: 12100,
    intent: 'Commercial',
    difficulty: 34,
    yours: 31,
    tone: 'gap',
    status: 'Open gap',
    x: 0.56,
    ridge: 3,
    results: [
      { pos: 1, by: 'packwell', title: 'Weekend Backpacks: Lightweight 20–30L', note: 'Category page · 9 bags' },
      { pos: 2, by: 'arcline', title: 'The 8 Best Weekend Backpacks', note: 'Tested guide' },
      { pos: 3, by: 'tern', title: 'Weekender Pack 26L', note: 'Product page' },
    ],
    you: { title: 'Weekender 28L Backpack', note: 'Product page · page 4' },
    ai: { question: 'What’s the best lightweight backpack for a weekend trip?', cited: ['packwell', 'arcline', 'trail'] },
    headline: '12,100 searches a month. None land on you.',
    gsc: { impressions: 2340, clicks: 18, position: 31.4 },
    evidence: [
      ['Search Console', '2,340 impressions · 18 clicks · avg. position 31.4', GSC_WINDOW],
      ['Results snapshot', 'Top 3: a category page, a tested guide, a product page', '12 Oct'],
      ['AI answers', 'Asked 4 times · you were named 0 times', '11–12 Oct'],
      ['Packwell page', '9 products, size guide, FAQ markup', '12 Oct'],
    ],
    rival: 'packwell',
    compare: [
      { label: 'Page type', you: 'Product page', them: 'Category + guide' },
      { label: 'Bags shown', you: '1', them: '9' },
      { label: 'Size guide', you: 'No', them: 'Yes' },
      { label: 'AI mentions', you: '0 of 4', them: '3 of 4' },
    ],
    move: 'Weekend backpack buying guide',
  },
  {
    id: 'tips',
    query: 'carry on packing tips',
    volume: 14800,
    intent: 'Informational',
    difficulty: 18,
    yours: 6,
    tone: 'weak',
    status: 'Missing in AI',
    x: 0.15,
    ridge: 1,
    results: [
      { pos: 1, by: 'arcline', title: 'Carry-On Packing: The 2-Night Checklist', note: 'Checklist with weights' },
      { pos: 2, by: 'trail', title: 'Carry-on only for a week? Here’s how', note: 'Forum thread' },
      { pos: 3, by: 'packwell', title: 'Packing for 48 Hours', note: 'Short guide' },
    ],
    you: { title: 'How We Pack a Weekender', note: 'Journal post · position 6' },
    ai: { question: 'How do I pack a carry-on for a weekend?', cited: ['arcline', 'trail'] },
    headline: 'You rank sixth. AI answers quote everyone else.',
    gsc: { impressions: 6900, clicks: 240, position: 6.1 },
    evidence: [
      ['AI answers', 'Asked 4 times · Arcline named 4 times, you 0', '11–12 Oct'],
      ['Search Console', '6,900 impressions · 240 clicks · avg. position 6.1', GSC_WINDOW],
      ['Results snapshot', 'All top 3 use a checklist format', '12 Oct'],
    ],
    rival: 'arcline',
    compare: [
      { label: 'Checklist', you: 'No', them: 'Yes' },
      { label: 'Measured weights', you: 'No', them: 'Yes' },
      { label: 'Position', you: '6', them: '1' },
      { label: 'AI mentions', you: '0 of 4', them: '4 of 4' },
    ],
    move: 'Carry-on checklist update',
  },
  {
    id: 'cubes',
    query: 'best packing cubes',
    volume: 9900,
    intent: 'Commercial',
    difficulty: 41,
    yours: 3,
    tone: 'strong',
    status: 'Working',
    x: 0.4,
    ridge: 1,
    results: [
      { pos: 1, by: 'packwell', title: 'Packing Cubes: Compression Set of 4', note: 'Product page' },
      { pos: 2, by: 'arcline', title: 'Best Packing Cubes, Tested on 20 Trips', note: 'Tested guide' },
      { pos: 3, by: 'you', title: 'Compression Packing Cubes, Set of 3', note: '4.8 ★ · 1,240 reviews' },
    ],
    you: null,
    ai: { question: 'What are the best packing cubes for carry-on travel?', cited: ['you', 'packwell'] },
    headline: 'Ranked third. Prices still from last year.',
    gsc: { impressions: 4400, clicks: 610, position: 3.2 },
    evidence: [
      ['Search Console', '4,400 impressions · 610 clicks · avg. position 3.2', GSC_WINDOW],
      ['AI answers', 'Asked 4 times · you were named 2 times', '11–12 Oct'],
      ['Site crawl', 'Price block last updated 14 Nov 2025', '12 Oct'],
    ],
    rival: 'packwell',
    compare: [
      { label: 'Position', you: '3', them: '1' },
      { label: 'Prices updated', you: 'Nov 2025', them: 'Oct 2026' },
      { label: 'Reviews shown', you: '1,240', them: '860' },
      { label: 'AI mentions', you: '2 of 4', them: '3 of 4' },
    ],
    move: 'Packing cubes page refresh',
  },
  {
    id: 'personal',
    query: 'personal item travel bag',
    volume: 6600,
    intent: 'Transactional',
    difficulty: 22,
    yours: 27,
    tone: 'weak',
    status: 'Duplicate title',
    x: 0.84,
    ridge: 4,
    results: [
      { pos: 1, by: 'tern', title: 'Under-Seat Personal Item Bag, 40×30×20 cm', note: 'Fits 14 airlines' },
      { pos: 2, by: 'packwell', title: 'Personal Item Bags That Actually Fit', note: 'Size checker' },
      { pos: 3, by: 'arcline', title: 'Does a 40L Bag Count as a Personal Item?', note: 'Measured review' },
    ],
    you: { title: 'Carry-On Backpack', note: 'Shares a title with another bag' },
    ai: { question: 'Which bag fits as a personal item on budget airlines?', cited: ['tern', 'packwell'] },
    headline: 'Ready buyers land on a confusing page.',
    gsc: { impressions: 1120, clicks: 21, position: 27.2 },
    evidence: [
      ['Site crawl', '2 pages share the title “Carry-On Backpack | Morrow Supply”', '12 Oct'],
      ['Site crawl', '4 colour variants have no canonical tag', '12 Oct'],
      ['Search Console', '1,120 impressions · 21 clicks · avg. position 27.2', GSC_WINDOW],
    ],
    rival: 'tern',
    compare: [
      { label: 'Size up front', you: 'No', them: 'Yes' },
      { label: 'Unique title', you: 'No', them: 'Yes' },
      { label: 'Airline table', you: 'No', them: '14 airlines' },
      { label: 'AI mentions', you: '0 of 4', them: '3 of 4' },
    ],
    move: 'Personal item page fix',
  },
];

/** Unlabelled background demand that gives the terrain its shape (relative heights, same intent axis). */
export const TEXTURE: { x: number; v: number; ridge: number }[] = [
  { x: 0.07, v: 0.35, ridge: 0 },
  { x: 0.28, v: 0.5, ridge: 0 },
  { x: 0.47, v: 0.38, ridge: 0 },
  { x: 0.7, v: 0.55, ridge: 0 },
  { x: 0.92, v: 0.3, ridge: 0 },
  { x: 0.33, v: 0.28, ridge: 1 },
  { x: 0.62, v: 0.4, ridge: 1 },
  { x: 0.9, v: 0.32, ridge: 1 },
  { x: 0.12, v: 0.3, ridge: 2 },
  { x: 0.7, v: 0.36, ridge: 2 },
  { x: 0.24, v: 0.26, ridge: 3 },
  { x: 0.8, v: 0.3, ridge: 3 },
  { x: 0.18, v: 0.2, ridge: 4 },
  { x: 0.52, v: 0.24, ridge: 4 },
  // the market continues past the four tracked searches, under the result sheet
  { x: 1.08, v: 0.42, ridge: 0 },
  { x: 1.3, v: 0.5, ridge: 0 },
  { x: 1.18, v: 0.3, ridge: 1 },
  { x: 1.42, v: 0.36, ridge: 2 },
  { x: 1.12, v: 0.26, ridge: 3 },
  { x: 1.36, v: 0.22, ridge: 4 },
];

/* ----------------------------------------------------------------------------------------------- campaigns */
export interface Audience {
  id: string;
  name: string;
  region: string;
  size: string; // estimated reach, sample
  from: string; // the search opportunity this audience grew from (query id)
  art: 'city' | 'flight' | 'gift';
  search: { headline: string; description: string; links: string[] };
  social: { line: string; tag: string };
  email: { subject: string; preview: string; cta: string };
}

export const AUDIENCES: Audience[] = [
  {
    id: 'city',
    name: 'City-breakers',
    region: 'Northeast US',
    size: '~180k',
    from: 'weekend',
    art: 'city',
    search: {
      headline: 'Lightweight Weekend Backpacks | 28L, Under 1 kg',
      description: 'Opens like a suitcase. Fits two nights. Free 60-day returns.',
      links: ['Weekender 28L', 'Size guide', 'Compare bags'],
    },
    social: { line: 'Two nights. One bag. Under 1 kg.', tag: 'Weekender 28L' },
    email: { subject: 'Your weekend, packed in 28 litres', preview: 'The bag that opens like a suitcase.', cta: 'See the Weekender' },
  },
  {
    id: 'flyers',
    name: 'Carry-on flyers',
    region: 'US budget routes',
    size: '~240k',
    from: 'personal',
    art: 'flight',
    search: {
      headline: 'Under-Seat Travel Bag | Fits 40×30×20 cm',
      description: 'Skip the bag fee. Fits personal-item limits on most budget airlines.',
      links: ['Airline fit table', 'Under-seat 40L', 'Returns'],
    },
    social: { line: 'Fits under the seat. Holds the trip.', tag: 'Under-seat 40L' },
    email: { subject: 'Never pay a bag fee again', preview: '40 litres that slide under the seat.', cta: 'Check your airline' },
  },
  {
    id: 'gift',
    name: 'Gift shoppers',
    region: 'US · Nov–Dec',
    size: '~95k',
    from: 'cubes',
    art: 'gift',
    search: {
      headline: 'Travel Gifts They’ll Use | Packing Cube Sets',
      description: '4.8 stars from 1,240 reviews. Gift wrap and December delivery.',
      links: ['Cube sets', 'Gift guide', 'Delivery dates'],
    },
    social: { line: 'A gift for every trip they take.', tag: 'Cube set of 3' },
    email: { subject: 'The gift that goes everywhere', preview: 'Cube sets, wrapped and delivered in time.', cta: 'Shop gift sets' },
  },
];

export interface ChannelPlan {
  id: Channel;
  name: string;
  provider: ToolId;
  cap: string; // the limit that would apply once approved
}

export const CHANNELS: ChannelPlan[] = [
  { id: 'search', name: 'Search ad', provider: 'gads', cap: '$40/day cap' },
  { id: 'social', name: 'Social post', provider: 'meta', cap: '$25/day cap' },
  { id: 'email', name: 'Email', provider: 'hubspot', cap: '3,200 opted in' },
];

/* ------------------------------------------------------------------------------------------------ outcomes */
export interface Source {
  id: string;
  name: string;
  short: string;
  /** visitors → product views → checkout starts → purchases (30 days, sample). */
  funnel: [number, number, number, number];
}

export const STAGES = ['Visitors', 'Product views', 'Checkouts', 'Purchases'] as const;

export const SOURCES: Source[] = [
  { id: 'organic', name: 'Organic search', short: 'Organic', funnel: [6480, 3110, 410, 119] },
  { id: 'social', name: 'Social', short: 'Social', funnel: [3140, 1020, 122, 26] },
  { id: 'ads', name: 'Search ads', short: 'Ads', funnel: [2310, 1290, 168, 41] },
  { id: 'email', name: 'Email', short: 'Email', funnel: [1180, 860, 141, 52] },
  { id: 'ai', name: 'AI answers', short: 'AI', funnel: [520, 340, 46, 14] },
];

export const OUTCOMES = {
  window: '30 days · sample',
  friction: 'Mobile shoppers leave at the shipping step',
  move: 'Show delivery cost on product pages',
  forecast: 'If mobile matched desktop: ~9–14 more purchases a month. A forecast, not a result.',
  method: 'Each visit is credited to its last non-direct source. Sample data; real attribution needs connected analytics.',
};

/* --------------------------------------------------------------------------------------------------- stack */
export interface Tool {
  id: ToolId;
  name: string;
  group: 'Research' | 'Reach' | 'Measure';
  role: string; // 2–4 words
  could: string[]; // 2–3 verb-led capabilities
  needs: string;
  /** Exact entry in Xroga's integrations directory (frontend/src/lib/integrations-catalog.ts), or null. */
  catalog: string | null;
}

export const TOOLS: Tool[] = [
  {
    id: 'gsc',
    name: 'Google Search Console',
    group: 'Research',
    role: 'Your real clicks',
    could: ['Read clicks and positions for your site', 'Spot pages losing visibility', 'Check indexing after launch'],
    needs: 'Owner access to your Search Console property',
    catalog: null,
  },
  {
    id: 'ahrefs',
    name: 'Ahrefs',
    group: 'Research',
    role: 'Competitors and links',
    could: ['Compare competitors’ top pages', 'Check difficulty before writing', 'Find sites linking to rivals'],
    needs: 'Your own Ahrefs account and API access',
    catalog: 'Ahrefs',
  },
  {
    id: 'semrush',
    name: 'Semrush',
    group: 'Research',
    role: 'Keywords and audits',
    could: ['Pull volume and intent for a topic', 'Track positions for new pages', 'Turn audit issues into fixes'],
    needs: 'Your own Semrush account and API units',
    catalog: 'SEMrush',
  },
  {
    id: 'gads',
    name: 'Google Ads',
    group: 'Reach',
    role: 'Search campaigns',
    could: ['Prepare campaigns as drafts', 'Report spend and purchases', 'Never publish or spend without approval'],
    needs: 'Your Google Ads account, connected by you',
    catalog: 'Google Ads API',
  },
  {
    id: 'meta',
    name: 'Meta Ads',
    group: 'Reach',
    role: 'Social campaigns',
    could: ['Prepare audiences and creatives', 'Compare reach with purchases', 'Never publish or spend without approval'],
    needs: 'Your Meta business account, connected by you',
    catalog: 'Meta Business Suite',
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    group: 'Reach',
    role: 'Email and contacts',
    could: ['Draft emails to opted-in segments', 'Record which campaign brought a customer', 'Never send without approval'],
    needs: 'Your HubSpot portal, connected by you',
    catalog: 'HubSpot',
  },
  {
    id: 'ga',
    name: 'Google Analytics',
    group: 'Measure',
    role: 'Visitors and sales',
    could: ['Show which sources bring purchases', 'Find where checkout drops', 'Measure a change after it ships'],
    needs: 'Viewer access to your GA4 property',
    catalog: 'Google Analytics',
  },
  {
    id: 'gtm',
    name: 'Google Tag Manager',
    group: 'Measure',
    role: 'Conversion tags',
    could: ['Check purchase events fire', 'Prepare tag changes for review'],
    needs: 'Access to your GTM container',
    catalog: null,
  },
];

export const GROUPS = ['Research', 'Reach', 'Measure'] as const;

/* ------------------------------------------------------------------------------------------------- helpers */
export const queryOf = (id: string) => QUERIES.find((q) => q.id === id) ?? QUERIES[0];
export const audienceOf = (id: string) => AUDIENCES.find((a) => a.id === id) ?? AUDIENCES[0];
export const sourceOf = (id: string) => SOURCES.find((s) => s.id === id) ?? SOURCES[0];
export const toolOf = (id: ToolId) => TOOLS.find((t) => t.id === id)!;
export const fmt = (n: number) => n.toLocaleString('en-US');
export const kfmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${n}`);
export const pct = (a: number, b: number, digits = 1) => `${((a / b) * 100).toFixed(digits)}%`;
export const totalFunnel = () =>
  SOURCES.reduce((t, s) => t.map((v, i) => v + s.funnel[i]) as [number, number, number, number], [0, 0, 0, 0] as [number, number, number, number]);
/** Share of all visitors and of all purchases for one source (0–1). */
export const shares = (s: Source) => {
  const t = totalFunnel();
  return { visitors: s.funnel[0] / t[0], purchases: s.funnel[3] / t[3] };
};

export const COPY = {
  eyebrow: 'Xroga Growth Studio',
  title: 'Your next customer is already searching.',
  lede: 'Find the demand, launch the campaign and see which channels bring real customers.',
  cta: 'Start with Xroga',
  explore: 'Explore opportunities',
  worlds: { discover: 'Search demand', campaigns: 'Campaigns', outcomes: 'Outcomes' } as Record<World, string>,
  disclosure: 'Illustrative example · sample data',
  stackTitle: 'Your growth stack',
  stackLede: 'Connect a service when the work needs it. Nothing is connected here.',
  stackLink: 'Explore integrations',
};
