/**
 * S03 Search & Growth — one internally consistent sample market (fixtures only, no UI).
 *
 * Morrow Supply (`morrow-supply.example`) is an invented online shop for everyday travel bags. Every query, volume,
 * position, competitor, answer, plan and result below is illustrative sample data for a homepage preview: nothing
 * is fetched, connected, published, sent or spent. Competitors use `.example` domains.
 */

export type View = 'market' | 'plan' | 'conversions';
export type Intent = 'Informational' | 'Commercial' | 'Transactional';
export type Tone = 'gap' | 'weak' | 'strong';
export type PaperMode = 'organic' | 'ai' | 'compare' | 'outline';
export type ToolId = 'gsc' | 'ahrefs' | 'semrush' | 'ga' | 'gtm' | 'gads' | 'meta' | 'hubspot';

export const BRAND = {
  name: 'Morrow Supply',
  domain: 'morrow-supply.example',
  sells: 'travel bags and packing gear',
  window: 'US · 28 days to 12 Oct 2026',
};

export const COMPETITORS: Record<string, { name: string; domain: string }> = {
  packwell: { name: 'Packwell', domain: 'packwell.example' },
  arcline: { name: 'Arcline Gear', domain: 'arcline.example' },
  tern: { name: 'Tern & Co.', domain: 'tern.example' },
  trail: { name: 'Trailtalk', domain: 'trailtalk.example' },
};

export interface Result {
  pos: number;
  by: string; // competitor id or 'you'
  title: string;
  path: string;
  snippet: string;
}

export interface Query {
  id: string;
  query: string;
  short: string;
  volume: number; // monthly searches, US, sample
  intent: Intent;
  difficulty: number; // 0–100, sample
  yours: number | null; // your best organic position (sample snapshot)
  tone: Tone;
  status: string;
  /** Where the peak sits on the terrain: x along the intent axis (0–1), and which ridge (0 = back). */
  x: number;
  ridge: number;
  results: Result[];
  yourPage: { title: string; path: string; note: string } | null;
  ai: {
    question: string;
    answer: string;
    cited: string[];
    youCited: boolean;
    sampled: string;
  };
  insight: { headline: string; body: string };
  gsc: { impressions: number; clicks: number; ctr: string; position: number };
  evidence: [string, string, string][]; // source, detail, date
  outline: {
    kind: string;
    title: string;
    h1: string;
    sections: string[];
    details: [string, string][];
  };
  rival: string;
  compare: { label: string; you: string; them: string }[];
}

export const QUERIES: Query[] = [
  {
    id: 'weekend',
    query: 'lightweight weekend backpack',
    short: 'weekend backpack',
    volume: 12100,
    intent: 'Commercial',
    difficulty: 34,
    yours: 31,
    tone: 'gap',
    status: 'No page answers it',
    x: 0.56,
    ridge: 3,
    results: [
      {
        pos: 1,
        by: 'packwell',
        title: 'Weekend Backpacks: Lightweight 20–30L Bags',
        path: 'packwell.example › weekend-backpacks',
        snippet: '9 bags under 1 kg compared by size, weight and carry-on fit. Free returns.',
      },
      {
        pos: 2,
        by: 'arcline',
        title: 'The 8 Best Lightweight Backpacks for a Weekend Away',
        path: 'arcline.example › guides › weekend',
        snippet: 'We packed two nights into eight bags and weighed every one.',
      },
      {
        pos: 3,
        by: 'tern',
        title: 'Weekender Pack 26L | Tern & Co.',
        path: 'tern.example › weekender-26',
        snippet: 'A 26L clamshell pack with a padded laptop sleeve.',
      },
    ],
    yourPage: {
      title: 'Weekender 28L Backpack',
      path: 'morrow-supply.example › weekender-28l',
      note: 'Your product page sits at position 31. No category page or guide answers this search.',
    },
    ai: {
      question: 'What’s the best lightweight backpack for a weekend trip?',
      answer:
        'Look for 20–30 litres, under 1 kg, with a clamshell opening and a laptop sleeve. Packwell’s weekend range and Arcline’s tested guide are the most cited picks.',
      cited: ['packwell', 'arcline', 'trail'],
      youCited: false,
      sampled: 'Asked 4 times · you were named 0 times',
    },
    insight: {
      headline: 'High-intent demand. Your category page doesn’t answer this search yet.',
      body: '12,100 people search for this every month, ready to compare and buy. You sell three matching bags, but only one product page exists, on page 4.',
    },
    gsc: { impressions: 2340, clicks: 18, ctr: '0.8%', position: 31.4 },
    evidence: [
      ['Search Console (sample)', '2,340 impressions · 18 clicks · avg. position 31.4', '15 Sep – 12 Oct'],
      ['Results snapshot (sample)', 'Top 3: a category page, a tested guide, a product page', '12 Oct'],
      ['AI answers (sample)', 'Same question asked 4 times · you were named 0 times', '11–12 Oct'],
      ['Competitor page (sample)', 'Packwell: 9 products, size guide, FAQ markup', '12 Oct'],
    ],
    outline: {
      kind: 'Buying guide + category page',
      title: 'Weekend backpack buying guide',
      h1: 'Lightweight Weekend Backpacks: How to Choose (20–30L)',
      sections: [
        'What fits in 28 litres, photographed',
        'Weight, size and carry-on fit compared',
        'Clamshell vs. top-loading',
        'Our three weekend bags, side by side',
        'FAQ: airline limits, laptop sleeves, returns',
      ],
      details: [
        ['Title tag', 'Lightweight Weekend Backpacks (20–30L) | Morrow Supply'],
        ['Structured data', 'ItemList for 3 bags · FAQPage'],
        ['Internal links', 'From 4 pages, incl. the packing-cubes guide'],
      ],
    },
    rival: 'packwell',
    compare: [
      {
        label: 'Page type',
        you: 'One product page',
        them: 'Category page + guide',
      },
      { label: 'Products shown', you: '1', them: '9' },
      { label: 'Size and weight guide', you: 'No', them: 'Yes' },
      { label: 'Internal links to it', you: '2', them: '14' },
      { label: 'Named in AI answers', you: '0 of 4', them: '3 of 4' },
    ],
  },
  {
    id: 'tips',
    query: 'carry on packing tips',
    short: 'packing tips',
    volume: 14800,
    intent: 'Informational',
    difficulty: 18,
    yours: 6,
    tone: 'weak',
    status: 'Missing from AI answers',
    x: 0.15,
    ridge: 1,
    results: [
      {
        pos: 1,
        by: 'arcline',
        title: 'Carry-On Packing Tips: The 2-Night Checklist',
        path: 'arcline.example › guides › carry-on-packing',
        snippet: 'A printable checklist with the weight of every item.',
      },
      {
        pos: 2,
        by: 'trail',
        title: 'Carry-on only for a week? Here’s how',
        path: 'trailtalk.example › threads › 48210',
        snippet: '312 replies · roll, don’t fold.',
      },
      {
        pos: 3,
        by: 'packwell',
        title: 'Packing for 48 Hours: A Simple System',
        path: 'packwell.example › journal › 48-hours',
        snippet: 'Three cubes, one pouch, nothing checked.',
      },
    ],
    yourPage: {
      title: 'How We Pack a Weekender | Morrow Journal',
      path: 'morrow-supply.example › journal › weekend',
      note: 'Your guide ranks 6th, but it has no checklist or measured data, so AI answers quote others.',
    },
    ai: {
      question: 'How do I pack a carry-on for a weekend?',
      answer:
        'Roll clothes, use two packing cubes, wear your bulkiest layer and keep liquids in one clear pouch. Arcline’s checklist and a Trailtalk thread are cited most.',
      cited: ['arcline', 'trail'],
      youCited: false,
      sampled: 'Asked 4 times · you were named 0 times',
    },
    insight: {
      headline: 'You rank, but AI answers quote everyone except you.',
      body: 'Your guide is on page one. Answers favour pages with a clear checklist and measured data; yours is a long story without either.',
    },
    gsc: { impressions: 6900, clicks: 240, ctr: '3.5%', position: 6.1 },
    evidence: [
      ['AI answers (sample)', 'Same question asked 4 times · Arcline named 4 times, you 0', '11–12 Oct'],
      ['Search Console (sample)', '6,900 impressions · 240 clicks · avg. position 6.1', '15 Sep – 12 Oct'],
      ['Results snapshot (sample)', 'All top 3 use a checklist format', '12 Oct'],
    ],
    outline: {
      kind: 'Content update',
      title: 'Carry-on packing checklist',
      h1: 'Carry-On Packing Tips: A 2-Night Checklist (With Weights)',
      sections: ['The 14-item checklist, printable', 'Measured weight of each item', 'Rolling vs. folding, tested', 'Where packing cubes save space'],
      details: [
        ['Change', 'Restructure the existing guide; keep its URL'],
        ['Cite', 'Your own measured bag weights and volumes'],
        ['Note', 'Clearer structure can help; AI citations are never guaranteed'],
      ],
    },
    rival: 'arcline',
    compare: [
      { label: 'Checklist format', you: 'No', them: 'Yes' },
      { label: 'Measured weights', you: 'No', them: 'Yes' },
      { label: 'Organic position', you: '6', them: '1' },
      { label: 'Named in AI answers', you: '0 of 4', them: '4 of 4' },
    ],
  },
  {
    id: 'cubes',
    query: 'best packing cubes',
    short: 'packing cubes',
    volume: 9900,
    intent: 'Commercial',
    difficulty: 41,
    yours: 3,
    tone: 'strong',
    status: 'Strong · keep it',
    x: 0.4,
    ridge: 1,
    results: [
      {
        pos: 1,
        by: 'packwell',
        title: 'Packing Cubes: Compression Set of 4',
        path: 'packwell.example › packing-cubes',
        snippet: 'Saves up to 30% space. 2-year warranty.',
      },
      {
        pos: 2,
        by: 'arcline',
        title: 'Best Packing Cubes, Tested on 20 Trips',
        path: 'arcline.example › guides › cubes',
        snippet: 'Our top pick and the one to skip.',
      },
      {
        pos: 3,
        by: 'you',
        title: 'Compression Packing Cubes, Set of 3 | Morrow',
        path: 'morrow-supply.example › packing-cubes',
        snippet: 'Water-resistant, YKK zips, 4.8 from 1,240 reviews.',
      },
    ],
    yourPage: null,
    ai: {
      question: 'What are the best packing cubes for carry-on travel?',
      answer: 'Compression cubes save the most space. Morrow Supply and Packwell are recommended for durable zips and fair prices.',
      cited: ['you', 'packwell'],
      youCited: true,
      sampled: 'Asked 4 times · you were named 2 times',
    },
    insight: {
      headline: 'This one works. Keep it working before the holidays.',
      body: 'You rank third and appear in half of the sampled AI answers. The page still shows last year’s prices, and two competitors refreshed theirs this month.',
    },
    gsc: { impressions: 4400, clicks: 610, ctr: '13.9%', position: 3.2 },
    evidence: [
      ['Search Console (sample)', '4,400 impressions · 610 clicks · avg. position 3.2', '15 Sep – 12 Oct'],
      ['AI answers (sample)', 'Same question asked 4 times · you were named 2 times', '11–12 Oct'],
      ['Site crawl (sample)', 'Price block last updated 14 Nov 2025', '12 Oct'],
    ],
    outline: {
      kind: 'Page refresh',
      title: 'Packing cubes page refresh',
      h1: 'Compression Packing Cubes, Set of 3',
      sections: ['2026 prices and stock', 'Comparison with the 4-cube set', 'Review highlights (1,240 reviews)', 'Link from the weekend backpack guide'],
      details: [
        ['Watch', 'Position and AI mentions weekly'],
        ['Timing', 'Before the November gift season'],
      ],
    },
    rival: 'packwell',
    compare: [
      { label: 'Organic position', you: '3', them: '1' },
      { label: 'Prices updated', you: 'Nov 2025', them: 'Oct 2026' },
      { label: 'Reviews shown', you: '1,240', them: '860' },
      { label: 'Named in AI answers', you: '2 of 4', them: '3 of 4' },
    ],
  },
  {
    id: 'personal',
    query: 'personal item travel bag',
    short: 'personal item bag',
    volume: 6600,
    intent: 'Transactional',
    difficulty: 22,
    yours: 27,
    tone: 'weak',
    status: 'Duplicate page title',
    x: 0.84,
    ridge: 4,
    results: [
      {
        pos: 1,
        by: 'tern',
        title: 'Under-Seat Personal Item Bag, 40×30×20 cm',
        path: 'tern.example › under-seat',
        snippet: 'Fits personal-item limits on 14 airlines.',
      },
      {
        pos: 2,
        by: 'packwell',
        title: 'Personal Item Bags That Actually Fit',
        path: 'packwell.example › personal-item',
        snippet: 'Airline size checker, 6 bags, free returns.',
      },
      {
        pos: 3,
        by: 'arcline',
        title: 'Does a 40L Bag Count as a Personal Item?',
        path: 'arcline.example › reviews › 40l',
        snippet: 'We measured them against 10 airlines.',
      },
    ],
    yourPage: {
      title: 'Carry-On Backpack | Morrow Supply',
      path: 'morrow-supply.example › carry-on-40l',
      note: 'Your 40L bag fits, but its page shares a title with another bag and hides the dimensions.',
    },
    ai: {
      question: 'Which bag fits as a personal item on budget airlines?',
      answer: 'Check each airline’s under-seat limit; 40×30×20 cm is common. Tern & Co. and Packwell list exact dimensions for their bags.',
      cited: ['tern', 'packwell'],
      youCited: false,
      sampled: 'Asked 4 times · you were named 0 times',
    },
    insight: {
      headline: 'Ready-to-buy searches land on a confusing page.',
      body: 'Shoppers check dimensions first. Your page never states them and shares its title with the 28L backpack, so search engines can’t tell them apart.',
    },
    gsc: { impressions: 1120, clicks: 21, ctr: '1.9%', position: 27.2 },
    evidence: [
      ['Site crawl (sample)', '2 pages share the title “Carry-On Backpack | Morrow Supply”', '12 Oct'],
      ['Site crawl (sample)', '4 colour variants have no canonical tag', '12 Oct'],
      ['Search Console (sample)', '1,120 impressions · 21 clicks · avg. position 27.2', '15 Sep – 12 Oct'],
    ],
    outline: {
      kind: 'Technical fix',
      title: 'Personal item page fix',
      h1: 'Under-Seat 40L Travel Bag (40×30×20 cm)',
      sections: ['Dimensions in the first screen', 'Airline fit table', 'Product markup with size and price'],
      details: [
        ['Fix', 'Unique title tag · canonical tags on 4 colour variants'],
        ['Effort', 'About an hour, reviewed before it ships'],
      ],
    },
    rival: 'tern',
    compare: [
      { label: 'Dimensions in first screen', you: 'No', them: 'Yes' },
      { label: 'Unique title', you: 'No (duplicate)', them: 'Yes' },
      { label: 'Airline fit table', you: 'No', them: '14 airlines' },
      { label: 'Named in AI answers', you: '0 of 4', them: '3 of 4' },
    ],
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
];

/* ---------------------------------------------------------------------------------------------- growth plan */
export interface Audience {
  id: string;
  name: string;
  who: string;
  searches: string[];
  message: string;
  ad: { headline: string; description: string };
  social: string;
  share: number;
}

export const AUDIENCES: Audience[] = [
  {
    id: 'city',
    name: 'Weekend city-breakers',
    who: 'Planning 2–3 nights away by train or car',
    searches: ['lightweight weekend backpack', 'carry on packing tips'],
    message: 'Two nights. One bag. Under 1 kg.',
    ad: {
      headline: 'Lightweight Weekend Backpacks',
      description: '28L, under 1 kg, opens like a suitcase. Free 60-day returns.',
    },
    social: 'Everything for two nights, in one 28L bag that weighs less than your laptop.',
    share: 45,
  },
  {
    id: 'flyers',
    name: 'Carry-on-only flyers',
    who: 'Avoiding checked-bag fees on short flights',
    searches: ['personal item travel bag', 'best packing cubes'],
    message: 'Fits under the seat. Holds the whole trip.',
    ad: {
      headline: 'Under-Seat 40L Travel Bag',
      description: '40×30×20 cm. Fits personal-item limits on most budget airlines.',
    },
    social: 'Skip the bag fee: 40 litres that slide under the seat in front of you.',
    share: 35,
  },
  {
    id: 'gift',
    name: 'Holiday gift shoppers',
    who: 'Buying for someone who travels, Nov–Dec',
    searches: ['best packing cubes', 'gifts for travellers'],
    message: 'A gift they’ll use every trip.',
    ad: {
      headline: 'Travel Gifts That Get Used',
      description: 'Packing cubes and weekend bags, gift-wrapped, delivered by 20 Dec.',
    },
    social: 'For the friend who always overpacks: cubes that fit a week into a weekend bag.',
    share: 20,
  },
];

export const PLAN = {
  title: 'Weekend backpack launch',
  channels: [
    {
      id: 'page',
      name: 'Buying guide + category page',
      provider: null as ToolId | null,
      cap: 'No spend',
    },
    {
      id: 'ads',
      name: 'Search ads',
      provider: 'gads' as ToolId | null,
      cap: '$40 / day cap',
    },
    {
      id: 'social',
      name: 'Social ads',
      provider: 'meta' as ToolId | null,
      cap: '$25 / day cap',
    },
    {
      id: 'email',
      name: 'Email to 3,200 opted-in buyers',
      provider: 'hubspot' as ToolId | null,
      cap: 'No spend',
    },
  ],
  exclusions: ['cheap', 'used', 'kids school', 'hiking 60l'],
  checks: [
    { label: 'Guide and category page drafted', ok: true },
    { label: 'Spend capped at $65 a day for 14 days ($910 at most)', ok: true },
    { label: 'Ad and email accounts not connected', ok: false },
    { label: 'Nothing publishes, sends or spends without you', ok: false },
  ],
};

/* ---------------------------------------------------------------------------------------------- conversions */
export interface Source {
  id: string;
  name: string;
  provider: ToolId | null;
  /** visitors → product views → checkout starts → purchases (30 days, sample). */
  funnel: [number, number, number, number];
  note: string;
}

export const STAGES = ['Visitors', 'Product views', 'Checkout starts', 'Purchases'];

export const SOURCES: Source[] = [
  {
    id: 'organic',
    name: 'Organic search',
    provider: 'gsc',
    funnel: [6480, 3110, 410, 119],
    note: 'Your largest source. Guides and category pages bring 61% of it.',
  },
  {
    id: 'ai',
    name: 'AI answers',
    provider: null,
    funnel: [520, 340, 46, 14],
    note: 'Small but focused: people arrive already knowing what they want.',
  },
  {
    id: 'ads',
    name: 'Search ads',
    provider: 'gads',
    funnel: [2310, 1290, 168, 41],
    note: 'Converts close to organic search when exclusions keep low-intent searches out.',
  },
  {
    id: 'social',
    name: 'Social ads',
    provider: 'meta',
    funnel: [3140, 1020, 122, 26],
    note: 'Most visitors per dollar, fewest purchases: good for awareness, weak for sales.',
  },
  {
    id: 'email',
    name: 'Email',
    provider: 'hubspot',
    funnel: [1180, 860, 141, 52],
    note: 'Best purchase rate: past buyers come back for a second bag.',
  },
];

export const CONVERSIONS = {
  window: '30 days · sample · last non-direct touch (simplified)',
  friction: {
    title: 'Mobile shoppers leave at the shipping step',
    body: '58% of mobile checkouts end on the shipping page, against 31% on desktop. Delivery cost first appears at checkout.',
    move: 'Show delivery cost and dates on product pages',
    forecast: 'If mobile matched desktop: roughly 9–14 more purchases a month. A forecast, not a promise.',
  },
};

/* ----------------------------------------------------------------------------------------------------- tools */
export interface Tool {
  id: ToolId;
  name: string;
  group: 'Discover' | 'Understand' | 'Reach';
  role: string;
  could: string[];
  /** Exact entry in Xroga's integrations directory (frontend/src/lib/integrations-catalog.ts), or null. */
  catalog: string | null;
}

export const TOOLS: Tool[] = [
  {
    id: 'gsc',
    name: 'Google Search Console',
    group: 'Discover',
    role: 'Your real clicks, impressions and indexing',
    could: ['Read clicks, impressions and positions for your own site', 'Spot pages that lost visibility', 'Check indexing after a page goes live'],
    catalog: null,
  },
  {
    id: 'ahrefs',
    name: 'Ahrefs',
    group: 'Discover',
    role: 'Competitor pages, backlinks and keyword difficulty',
    could: [
      'Compare your pages with competitors’ top pages',
      'Check difficulty before a brief is written',
      'Find sites that link to competitors but not to you',
    ],
    catalog: 'Ahrefs',
  },
  {
    id: 'semrush',
    name: 'Semrush',
    group: 'Discover',
    role: 'Keyword research, rank tracking and site audits',
    could: ['Pull search volume and intent for a topic', 'Track positions for pages Xroga prepares', 'Turn audit issues into a prioritised fix list'],
    catalog: 'SEMrush',
  },
  {
    id: 'ga',
    name: 'Google Analytics',
    group: 'Understand',
    role: 'Visitors, purchases and channels',
    could: ['Show which sources bring purchases, not only visits', 'Find where shoppers leave checkout', 'Measure a change after it ships'],
    catalog: 'Google Analytics',
  },
  {
    id: 'gtm',
    name: 'Google Tag Manager',
    group: 'Understand',
    role: 'Conversion tags and events',
    could: ['Check that purchase events fire correctly', 'Prepare tag changes for your review'],
    catalog: null,
  },
  {
    id: 'gads',
    name: 'Google Ads',
    group: 'Reach',
    role: 'Search campaigns and budgets',
    could: [
      'Prepare campaigns, keywords and exclusions as drafts',
      'Report spend and purchases by campaign',
      'Never publish or raise a budget without your approval',
    ],
    catalog: 'Google Ads API',
  },
  {
    id: 'meta',
    name: 'Meta Ads',
    group: 'Reach',
    role: 'Facebook and Instagram campaigns',
    could: [
      'Prepare audiences and creative variants as drafts',
      'Compare reach with purchases, not only clicks',
      'Never publish or spend without your approval',
    ],
    catalog: 'Meta Business Suite',
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    group: 'Reach',
    role: 'Contacts, email and lead stages',
    could: ['Draft an email to an opted-in segment', 'Record which campaign a customer came from', 'Never send without your approval'],
    catalog: 'HubSpot',
  },
];

export const queryOf = (id: string) => QUERIES.find((q) => q.id === id) ?? QUERIES[0];
export const audienceOf = (id: string) => AUDIENCES.find((a) => a.id === id) ?? AUDIENCES[0];
export const sourceOf = (id: string) => SOURCES.find((s) => s.id === id) ?? SOURCES[0];
export const toolOf = (id: ToolId) => TOOLS.find((t) => t.id === id)!;
export const fmt = (n: number) => n.toLocaleString('en-US');
export const kfmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${n}`);
export const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;
export const totalFunnel = () =>
  SOURCES.reduce((t, s) => t.map((v, i) => v + s.funnel[i]) as [number, number, number, number], [0, 0, 0, 0] as [number, number, number, number]);

export const COPY = {
  eyebrow: 'Xroga / Search & Growth',
  title: 'Your next customer is already searching.',
  lede: 'Find the searches you’re missing, see what competitors are winning, and turn those openings into better pages, smarter campaigns and measurable growth.',
  launch: 'Just launched, or selling for years: Xroga keeps reading your market after launch.',
  cta: 'Start with Xroga',
  explore: 'Explore search opportunities',
  views: {
    market: 'Search market',
    plan: 'Growth plan',
    conversions: 'Conversions',
  } as Record<View, string>,
  disclosure: 'Illustrative example · sample data',
  toolsTitle: 'Bring the growth tools you already trust.',
  toolsLede: 'Connect a service when the work needs it. Nothing is connected in this preview.',
  toolsLink: 'Explore integrations',
};
