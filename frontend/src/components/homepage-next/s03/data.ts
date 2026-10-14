/**
 * S03 illustrative scenarios. Both businesses are fictional and every figure is an illustration of how Xroga works,
 * never a measurement: PeakForm Nutrition (a sports-nutrition brand with an online store and a Leeds shop) across all
 * five search lenses, and Ember Roasters (a coffee subscription about to launch) in the marketing mode. Domains use the reserved `.example` TLD.
 * Provider availability mirrors Xroga's integrations directory (src/lib/integrations-catalog.ts): listed services are
 * "available to connect"; services that are not listed are named as examples only. Nothing here is a live connection.
 */

export type ToolId = 'gsc' | 'ahrefs' | 'semrush' | 'gbp' | 'gads' | 'meta' | 'hubspot' | 'ga' | 'gtm';
export type Availability = 'connect' | 'unlisted';

export interface Tool {
  id: ToolId;
  name: string;
  catalog: string | null; // exact name in the integrations directory, or null when not listed
  reads: string; // what Xroga would read or do with it, in one line
}
export const TOOLS: Record<ToolId, Tool> = {
  gsc: { id: 'gsc', name: 'Search Console', catalog: null, reads: 'Your own clicks, queries, indexing and crawl reports' },
  ahrefs: { id: 'ahrefs', name: 'Ahrefs', catalog: 'Ahrefs', reads: 'Referring domains, link intersect and competitor pages' },
  semrush: { id: 'semrush', name: 'Semrush', catalog: 'SEMrush', reads: 'Keyword demand, site audit and backlink insight' },
  gbp: { id: 'gbp', name: 'Business Profile', catalog: null, reads: 'Listing details, categories, hours and reviews' },
  gads: { id: 'gads', name: 'Google Ads', catalog: 'Google Ads API', reads: 'Campaigns, ad groups, keywords and budgets' },
  meta: { id: 'meta', name: 'Meta Ads', catalog: 'Meta Business Suite', reads: 'Social campaigns, audiences and placements' },
  hubspot: { id: 'hubspot', name: 'HubSpot', catalog: 'HubSpot', reads: 'Leads, contacts and follow-up sequences' },
  ga: { id: 'ga', name: 'Google Analytics', catalog: 'Google Analytics', reads: 'Sessions, key events and conversions by source' },
  gtm: { id: 'gtm', name: 'Tag Manager', catalog: null, reads: 'Conversion tags and the events they fire' },
};
export const availability = (t: Tool): Availability => (t.catalog ? 'connect' : 'unlisted');
export const AVAILABILITY_LABEL: Record<Availability, string> = { connect: 'Available to connect', unlisted: 'Not in directory · example' };

/* =============================================================================================== A · SEARCH */
/** One example business runs through all five search lenses, so every finding belongs to the same story. */
export const SITE = { name: 'PeakForm Nutrition', domain: 'peakform.example', city: 'Leeds', product: 'PeakForm Whey Isolate' };

export type Lens = 'health' | 'content' | 'ai' | 'links' | 'local';
export const LENSES: { id: Lens; label: string; expert: string; discipline: string; tools: ToolId[] }[] = [
  { id: 'health', label: 'Fix my website', expert: 'Technical SEO', discipline: 'Technical SEO', tools: ['gsc', 'semrush'] },
  { id: 'content', label: 'Find search opportunities', expert: 'Keywords & content', discipline: 'Keywords & content', tools: ['gsc', 'semrush', 'ahrefs'] },
  { id: 'ai', label: 'Appear in AI answers', expert: 'AEO · GEO', discipline: 'AEO · GEO', tools: [] },
  { id: 'links', label: 'Earn authority', expert: 'Backlinks & digital PR', discipline: 'Off-page & digital PR', tools: ['ahrefs', 'semrush'] },
  { id: 'local', label: 'Show up locally', expert: 'Local SEO', discipline: 'Local SEO', tools: ['gbp', 'gsc'] },
];

/* --- site health: a small crawlable store ------------------------------------------------------------- */
export type PageState = 'ok' | 'broken' | 'blocked' | 'slow' | 'excluded';
export interface Page {
  id: string;
  path: string;
  label: string; // what the page is, in plain words (for screen readers and the inspector)
  x: number; // % of the crawl map
  y: number;
  state: PageState;
}
export const PAGES: Page[] = [
  { id: 'home', path: '/', label: 'Home page', x: 13, y: 44, state: 'ok' },
  { id: 'protein', path: '/protein', label: 'Protein category', x: 40, y: 14, state: 'ok' },
  { id: 'guides', path: '/guides', label: 'Guides', x: 40, y: 44, state: 'ok' },
  { id: 'stores', path: '/stores', label: 'Store finder', x: 40, y: 74, state: 'ok' },
  { id: 'whey', path: '/protein/whey-isolate', label: 'Whey isolate product page', x: 72, y: 10, state: 'broken' },
  { id: 'beginners', path: '/guides/beginners', label: 'Beginners’ guide', x: 72, y: 42, state: 'slow' },
  { id: 'leeds', path: '/stores/leeds', label: 'Leeds store page', x: 72, y: 74, state: 'blocked' },
  { id: 'account', path: '/account', label: 'Customer account', x: 13, y: 82, state: 'excluded' },
];
export const PAGE_STATE: Record<Exclude<PageState, 'ok'>, { tag: string; label: string }> = {
  broken: { tag: '404 · can’t be opened', label: 'Can’t be opened' },
  slow: { tag: 'Slow on phones', label: 'Opens, but slowly' },
  blocked: { tag: 'noindex · by mistake', label: 'Hidden by mistake' },
  excluded: { tag: 'noindex · on purpose', label: 'Hidden on purpose' },
};
export type IssueId = 'broken' | 'blocked' | 'slow';
export interface Issue {
  id: IssueId;
  label: string;
  from: string; // page ids: the internal link this issue sits on
  to: string;
  status: string;
  finding: string; // one concrete sentence
  consequence: string;
  repair: string;
  verify: string;
}
export const ISSUES: Issue[] = [
  {
    id: 'broken',
    label: 'Broken link',
    from: 'protein',
    to: 'whey',
    status: '404 · /protein/whey-isolate',
    finding: 'This product page returns 404.',
    consequence: 'Shoppers and crawlers following the link from /protein reach an error page.',
    repair: 'Point the link at /protein/whey-isolate-1kg and redirect the old address',
    verify: 'Re-crawl /protein: the link returns 200',
  },
  {
    id: 'blocked',
    label: 'Hidden by mistake',
    from: 'stores',
    to: 'leeds',
    status: 'noindex · /stores/leeds',
    finding: 'The Leeds store page is hidden from search.',
    consequence: 'People looking for a shop nearby can’t find this page in results.',
    repair: 'Remove the noindex tag from the store-page template',
    verify: 'URL inspection reports the page as indexable',
  },
  {
    id: 'slow',
    label: 'Slow on phones',
    from: 'guides',
    to: 'beginners',
    status: 'Slow main content · /guides/beginners',
    finding: 'This guide opens, but slowly on phones.',
    consequence: 'It can be found and indexed; visitors on mobile wait for the main content.',
    repair: 'Compress the header image and load the reviews widget later',
    verify: 'Re-test mobile loading on the same page',
  },
];
export const LINKS: [string, string][] = [
  ['home', 'protein'],
  ['home', 'guides'],
  ['home', 'stores'],
  ['protein', 'whey'],
  ['guides', 'beginners'],
  ['stores', 'leeds'],
  ['protein', 'beginners'],
  ['home', 'account'],
];
export const CRAWL = { pages: PAGES.length, links: LINKS.length, checks: 'Links, status codes, indexing, mobile speed' };

/* --- keywords & content ------------------------------------------------------------------------------- */
export type Intent = 'compare' | 'buy' | 'local' | 'learn';
export const INTENTS: { id: Intent; label: string }[] = [
  { id: 'compare', label: 'Compare' },
  { id: 'buy', label: 'Buy' },
  { id: 'local', label: 'Local' },
  { id: 'learn', label: 'Learn' },
];
export interface Query {
  id: string;
  q: string;
  intent: Intent;
  you: string; // where PeakForm stands
  rival: string; // who answers it today
  rivalPage: string;
  gap: boolean; // no page answers it
}
export const QUERIES: Query[] = [
  {
    id: 'which',
    q: 'which whey protein should I buy for the gym',
    intent: 'compare',
    you: 'No page answers this',
    rival: 'liftmag.example',
    rivalPage: 'Best protein powders, compared',
    gap: true,
  },
  {
    id: 'ingredients',
    q: 'compare whey protein ingredients',
    intent: 'compare',
    you: 'Position 18',
    rival: 'ironwhey.example',
    rivalPage: 'What’s in our whey',
    gap: false,
  },
  {
    id: 'beginners',
    q: 'whey protein powder for beginners',
    intent: 'buy',
    you: 'No page answers this',
    rival: 'ironwhey.example',
    rivalPage: 'Starter whey, 1 kg',
    gap: true,
  },
  {
    id: 'nearby',
    q: 'where to buy whey protein nearby',
    intent: 'local',
    you: 'Store page hidden',
    rival: 'gymfuel.example',
    rivalPage: 'Gym Fuel · Leeds',
    gap: false,
  },
  { id: 'scoop', q: 'how much protein in one scoop', intent: 'learn', you: 'Position 3', rival: 'peakform.example', rivalPage: 'Your guide', gap: false },
];
export const QUERY_NEXT: Record<string, string> = {
  ingredients: 'Add a full ingredient table to the product page before writing anything new',
  nearby: 'Unhide /stores/leeds first: it is the page this search needs',
  scoop: 'Keep the guide current and link it from the product page',
};
export const BRIEF: Record<string, { title: string; covers: string[]; faq: string; link: string; facts: string }> = {
  which: {
    title: 'Which whey protein should you buy? A plain comparison',
    covers: ['Protein per serving, side by side', 'Ingredients and allergens', 'Isolate or concentrate: who each suits'],
    faq: 'What does “isolate” mean on a label?',
    link: 'From /protein and /guides/beginners',
    facts: 'Protein per serving · allergens · flavours · price per serving',
  },
  beginners: {
    title: 'Whey protein for beginners: what to look for',
    covers: ['What whey protein is', 'How to read the label', 'Choosing a size and flavour'],
    faq: 'How many servings are in a 1 kg bag?',
    link: 'From /guides/beginners and /protein',
    facts: 'Serving size · servings per bag · allergens',
  },
};

/* --- AI answers: product discovery ------------------------------------------------------------------- */
export type CiteState = 'cited' | 'mentioned' | 'absent' | 'untested';
export interface AiSource {
  domain: string;
  kind: string; // a buying guide, a product page, a testing register …
  state: CiteState;
}
export interface AiQuestion {
  id: string;
  label: string; // the chip: a human question, never a sample number
  q: string;
  answer: { text: string; cite?: number; mention?: boolean }[]; // each sentence may be supported by a source (1-based)
  sources: AiSource[];
  you: CiteState; // PeakForm for this question
  finding: string;
  why: string;
}
export const AI_QUESTIONS: AiQuestion[] = [
  {
    id: 'buy',
    label: 'Which to buy',
    q: 'Which whey protein should I buy for the gym?',
    answer: [
      { text: 'Compare protein per serving, the ingredients and allergens', cite: 1 },
      { text: 'Ironwhey publishes a test certificate for each batch', cite: 2 },
      { text: 'Leanlab is often recommended in gym forums', mention: true },
      { text: 'Check price per serving and stock before you order', cite: 1 },
    ],
    sources: [
      { domain: 'liftmag.example', kind: 'Buying guide', state: 'cited' },
      { domain: 'ironwhey.example', kind: 'Product page', state: 'cited' },
      { domain: 'Leanlab', kind: 'Brand named, no site cited', state: 'mentioned' },
    ],
    you: 'absent',
    finding: 'Missing clear product details.',
    why: 'The cited pages state protein per serving, allergens and test results. PeakForm’s product page states none of them.',
  },
  {
    id: 'trust',
    label: 'Where to buy',
    q: 'Where can I buy a trustworthy whey protein?',
    answer: [
      { text: 'Buy from shops that show a full ingredient label and batch testing', cite: 1 },
      { text: 'An independent testing register lists brands whose batches were checked', cite: 2 },
    ],
    sources: [
      { domain: 'liftmag.example', kind: 'Buying guide', state: 'cited' },
      { domain: 'testedsports.example', kind: 'Independent testing register', state: 'cited' },
    ],
    you: 'absent',
    finding: 'No testing information on your pages.',
    why: 'Answers point to stockists and testing lists. PeakForm’s pages don’t say how its batches are tested.',
  },
  {
    id: 'check',
    label: 'What to check',
    q: 'What should I check before buying whey protein?',
    answer: [
      { text: 'Protein per serving and serving size', cite: 1 },
      { text: 'Allergens, sweeteners and the full ingredient list', cite: 1 },
      { text: 'Whether batches are independently tested', cite: 2 },
    ],
    sources: [
      { domain: 'liftmag.example', kind: 'Buying guide', state: 'cited' },
      { domain: 'testedsports.example', kind: 'Independent testing register', state: 'cited' },
    ],
    you: 'untested',
    finding: 'Not checked yet for this question.',
    why: 'This question has not been checked for PeakForm yet. Its product page would still need the same facts.',
  },
];
/** the product facts the draft adds: what answers cite elsewhere, and what PeakForm's page leaves out */
export const PRODUCT_FACTS: { id: string; label: string; draft: string }[] = [
  { id: 'protein', label: 'Protein per serving', draft: '24 g in a 30 g serving' },
  { id: 'allergens', label: 'Ingredients & allergens', draft: 'Full list · contains milk' },
  { id: 'faq', label: 'Comparison & FAQ', draft: 'Isolate or concentrate, compared' },
];
export const AI_COPY = {
  label: 'AI answer · illustrative',
  prepared: 'Better product facts, comparison content and clear answers.',
  schema: 'Product structured data',
  recheck:
    'After you approve and publish, Xroga can ask the same questions again where it has access and compare which sources are cited or mentioned. This preview has no AI-answer data provider, so no new result is shown.',
  method:
    'Example answers, written to illustrate how sourced AI answers work. Real answers vary by assistant, date, wording and place. Clearer product facts can make a page easier to cite; nothing guarantees a mention or a citation.',
  surfaces: [
    { id: 'results', label: 'Search result', line: 'A list of pages. You earn the click by ranking.' },
    { id: 'quick', label: 'Quick answer', line: 'One extract from one page, shown above the results.' },
    { id: 'ai', label: 'AI answer', line: 'A written summary that may cite several sources, or none.' },
  ],
};

/* --- authority & links (the signature graph) -------------------------------------------------------------- */
export type LinkClass = 'verified' | 'mention' | 'rival' | 'prospect' | 'discarded';
export interface Source {
  id: string;
  domain: string;
  page: string;
  cls: LinkClass;
  topic: string;
  seen: string; // date first observed, or '—'
  relevance: 'High' | 'Medium' | 'Low';
  action: string;
  angle?: string; // the outreach angle a draft would use
  x: number; // position on the source arc, % of the graph
  y: number;
}
export const SOURCES: Source[] = [
  {
    id: 'trainhub',
    domain: 'trainhub.example',
    page: '/nutrition/protein-on-a-budget',
    cls: 'verified',
    topic: 'Fitness magazine',
    seen: '3 Aug',
    relevance: 'High',
    action: 'Keep the linked product page accurate',
    x: 66,
    y: 8,
  },
  {
    id: 'forum',
    domain: 'gymtalk.example',
    page: '/t/best-budget-whey',
    cls: 'mention',
    topic: 'Gym forum',
    seen: '2 Oct',
    relevance: 'Medium',
    action: 'Ask the author to link the product they mention',
    angle: 'You mention PeakForm Whey Isolate in this thread; a link to the product page would help readers check the label.',
    x: 94,
    y: 30,
  },
  {
    id: 'liftmag',
    domain: 'liftmag.example',
    page: '/best-protein-powders-2026',
    cls: 'rival',
    topic: 'Buying guide',
    seen: '—',
    relevance: 'High',
    action: 'Offer the ingredient comparison as a resource',
    angle: 'Your protein guide compares powders for beginners. Our ingredient-by-ingredient comparison could help your readers check labels.',
    x: 90,
    y: 50,
  },
  {
    id: 'runclub',
    domain: 'runclub.example',
    page: '/fuel-partners',
    cls: 'rival',
    topic: 'Club partner list',
    seen: '—',
    relevance: 'Medium',
    action: 'Check the partner criteria and apply',
    angle: 'Your partner list names nutrition brands for club members. We’d like to apply and share our batch-testing details.',
    x: 70,
    y: 94,
  },
  {
    id: 'podcast',
    domain: 'nutritionpod.example',
    page: '/episodes/protein-myths',
    cls: 'rival',
    topic: 'Nutrition podcast',
    seen: '—',
    relevance: 'Medium',
    action: 'Pitch an expert interview',
    angle: 'Your protein-myths episode drew questions about labels. Our product lead could explain how to read one.',
    x: 52,
    y: 72,
  },
  {
    id: 'homegym',
    domain: 'homegym.example',
    page: '/beginner-plan',
    cls: 'prospect',
    topic: 'Home-gym blog',
    seen: '—',
    relevance: 'Medium',
    action: 'Draft a data-led pitch',
    angle: 'Your beginner plan asks readers to track protein. Our serving-size table could make that easier.',
    x: 42,
    y: 14,
  },
  {
    id: 'spam',
    domain: 'linkfarm-seo.example',
    page: '/buy-links',
    cls: 'discarded',
    topic: 'Paid link network',
    seen: '—',
    relevance: 'Low',
    action: 'Unsuitable: buying links breaks search policies',
    x: 96,
    y: 88,
  },
];
export const RIVAL = { domain: 'ironwhey.example' };
export type LinkMode = 'mine' | 'gap' | 'mentions' | 'outreach';
export const LINK_MODES: { id: LinkMode; label: string; show: LinkClass[] }[] = [
  { id: 'mine', label: 'My links', show: ['verified'] },
  { id: 'gap', label: 'Competitor gap', show: ['verified', 'rival'] },
  { id: 'mentions', label: 'Unlinked mentions', show: ['verified', 'mention'] },
  { id: 'outreach', label: 'Outreach', show: ['rival', 'mention', 'prospect', 'discarded'] },
];
export const CLASS_LABEL: Record<LinkClass, string> = {
  verified: 'Verified link to you',
  mention: 'Mentions you · no link',
  rival: 'Links to competitor only',
  prospect: 'Opportunity to contact',
  discarded: 'Unsuitable · excluded',
};
export const LEGEND: { cls: LinkClass | 'gap'; label: string }[] = [
  { cls: 'verified', label: 'Verified link' },
  { cls: 'rival', label: 'Competitor link' },
  { cls: 'gap', label: 'No link to you yet' },
  { cls: 'mention', label: 'Mention, no link' },
  { cls: 'prospect', label: 'Opportunity to contact' },
];

/* --- local presence ---------------------------------------------------------------------------------------- */
export const LOCAL = {
  query: 'whey protein shop near me',
  area: 'Leeds city centre',
  store: 'PeakForm Nutrition',
  category: 'Sports nutrition store · Leeds',
  fields: [
    { id: 'name', label: 'Name', value: 'PeakForm Nutrition', ok: true },
    { id: 'category', label: 'Primary category', value: 'Sports nutrition store', ok: true },
    { id: 'phone', label: 'Phone matches website', value: '0113 496 0123', ok: true },
    { id: 'weekday', label: 'Mon–Fri hours', value: '09:00–18:00', ok: true },
    { id: 'saturday', label: 'Saturday hours', value: '09:00–17:00', ok: false },
  ],
  fix: 'Add Saturday 09:00–17:00, matching /stores/leeds',
  pins: [
    { id: 'you', name: 'PeakForm Nutrition', x: 46, y: 50, you: true },
    { id: 'p1', name: 'Gym Fuel Co', x: 28, y: 30, you: false },
    { id: 'p2', name: 'Ironwhey Store', x: 68, y: 32, you: false },
    { id: 'p3', name: 'Corner Health', x: 62, y: 72, you: false },
  ],
};

/* =============================================================================================== B · GROWTH */
export const BRAND = { name: 'Ember Roasters', domain: 'emberroasters.example', product: 'Ember Monthly', offer: 'First bag free' };

export type Mission = 'launch' | 'search' | 'social' | 'paths';
export const MISSIONS: { id: Mission; label: string; line: string; tools: ToolId[] }[] = [
  { id: 'launch', label: 'Launch a product', line: 'One launch, every asset in step.', tools: ['ga', 'gtm'] },
  { id: 'search', label: 'Build search ads', line: 'Two ad groups, matched to intent.', tools: ['gads', 'semrush'] },
  { id: 'social', label: 'Create social ads', line: 'One idea, reshaped for each audience.', tools: ['meta'] },
  { id: 'paths', label: 'Trace conversions', line: 'From first click to subscriber.', tools: ['ga', 'gtm', 'hubspot'] },
];

/* --- launch -------------------------------------------------------------------------------------------- */
export type LaunchAsset = 'positioning' | 'page' | 'announce' | 'distribution';
export const LAUNCH_ASSETS: { id: LaunchAsset; label: string; state: string }[] = [
  { id: 'positioning', label: 'Positioning', state: 'Drafted' },
  { id: 'page', label: 'Launch page', state: 'Ready for review' },
  { id: 'announce', label: 'Announcement', state: 'Drafted' },
  { id: 'distribution', label: 'Distribution', state: 'Planned' },
];
export const POSITIONING = {
  for: 'Home brewers who run out mid-week',
  promise: 'Fresh beans before the last cup',
  proof: 'Roasted to order, shipped in 48 hours',
};
export const DISTRIBUTION = ['Search ads', 'Instagram', 'Waitlist email', 'Coffee forums'];

/* --- search ads ----------------------------------------------------------------------------------------- */
export type Term = { t: string; group: 'subscription' | 'gift' | 'irrelevant' };
export const TERMS: Term[] = [
  { t: 'coffee subscription uk', group: 'subscription' },
  { t: 'fresh roasted coffee delivery', group: 'subscription' },
  { t: 'monthly coffee beans', group: 'subscription' },
  { t: 'coffee gift subscription', group: 'gift' },
  { t: 'coffee gift for dad', group: 'gift' },
  { t: 'free coffee samples', group: 'irrelevant' },
  { t: 'coffee machine repair', group: 'irrelevant' },
  { t: 'coffee shop jobs', group: 'irrelevant' },
];
export type AdGroup = 'subscription' | 'gift';
export const AD_GROUPS: { id: AdGroup; label: string; match: string; headlines: string[]; desc: string; hero: string; offer: string }[] = [
  {
    id: 'subscription',
    label: 'Subscription',
    match: 'Phrase match',
    headlines: ['Fresh Coffee, Every Month', 'Roasted to Order', 'First Bag Free'],
    desc: 'Beans roasted the week they ship. Pause or skip any month.',
    hero: 'Never run out of good coffee.',
    offer: 'First bag free',
  },
  {
    id: 'gift',
    label: 'Gifts',
    match: 'Phrase match',
    headlines: ['A Coffee Gift That Lasts', '3, 6 or 12 Months', 'Gift Card Included'],
    desc: 'A fresh bag every month for the coffee lover you know.',
    hero: 'The gift that arrives every month.',
    offer: 'Choose 3, 6 or 12 months',
  },
];
export const BUDGET = { min: 10, max: 80, step: 5, initial: 25 };
export const RADII = ['UK-wide', 'England', 'Within 50 km of Leeds'];

/* --- social ---------------------------------------------------------------------------------------------- */
export type Audience = 'new' | 'barista' | 'office';
export type Placement = 'feed' | 'story';
export const AUDIENCES: { id: Audience; label: string; line: string; offer: string; tone: 'ember' | 'cream' | 'slate'; why: string }[] = [
  { id: 'new', label: 'New to specialty', line: 'Good coffee, without the jargon.', offer: 'First bag free', tone: 'ember', why: 'Low risk to try' },
  {
    id: 'barista',
    label: 'Home baristas',
    line: 'Roasted Monday. In your grinder Wednesday.',
    offer: 'Pick your roast level',
    tone: 'slate',
    why: 'Freshness matters most',
  },
  {
    id: 'office',
    label: 'Office managers',
    line: 'The office coffee everyone stops complaining about.',
    offer: '2 kg team plan',
    tone: 'cream',
    why: 'Solves a team problem',
  },
];

/* --- conversion paths ------------------------------------------------------------------------------------- */
export const PATH_STAGES = ['Visits', 'Trials', 'Subscribers'];
export interface Channel {
  id: string;
  name: string;
  mark: string; // shape glyph, so colour is never the only cue
  flow: [number, number, number];
  note: string;
}
export const CHANNELS: Channel[] = [
  { id: 'search', name: 'Search ads', mark: '◆', flow: [3200, 160, 72], note: 'Subscription terms convert; gift terms peak in December.' },
  { id: 'social', name: 'Social', mark: '●', flow: [5400, 190, 38], note: 'Many trials, few keep the subscription after bag two.' },
  { id: 'organic', name: 'Organic', mark: '▲', flow: [2100, 84, 46], note: 'The brewing guides bring buyers who stay.' },
  { id: 'email', name: 'Email', mark: '■', flow: [900, 70, 41], note: 'The waitlist converts best of any source.' },
];
export const PATH_INSIGHT = {
  bottleneck: 'Social trials cancel after the second bag.',
  move: 'Test a roast quiz before checkout',
  method: 'Illustrative figures for a fictional launch. In Xroga they come from your connected analytics, counted per source over 30 days.',
};

/* ========================================================================================== helpers & copy */
export const fmt = (n: number) => n.toLocaleString('en-US');
export const pct = (a: number, b: number, digits = 0) => `${((a / b) * 100).toFixed(digits)}%`;
export const totals = () => CHANNELS.reduce((t, c) => t.map((v, i) => v + c.flow[i]) as [number, number, number], [0, 0, 0] as [number, number, number]);
export const sourceOf = (id: string) => SOURCES.find((s) => s.id === id) ?? SOURCES[0];
export const channelOf = (id: string) => CHANNELS.find((c) => c.id === id) ?? CHANNELS[0];
export const queryOf = (id: string) => QUERIES.find((q) => q.id === id) ?? QUERIES[0];
export const issueOf = (id: IssueId) => ISSUES.find((i) => i.id === id) ?? ISSUES[0];
export const groupOf = (id: AdGroup) => AD_GROUPS.find((g) => g.id === id)!;
export const audienceOf = (id: Audience) => AUDIENCES.find((a) => a.id === id)!;

export const COPY = {
  eyebrow: 'Xroga / Search & Growth',
  title: 'Get discovered. Win the customer.',
  lede: 'Xroga finds what stops people finding you, prepares the marketing that brings them in, and asks before anything goes live.',
  search: { label: 'Search & Visibility', line: 'Find what stops people finding you', scenario: 'PeakForm Nutrition · a sports-nutrition brand' },
  growth: { label: 'Launch & Marketing', line: 'Put your offer in front of the right people', scenario: 'Ember Roasters · a coffee subscription' },
  disclosure: 'Interactive preview',
  about:
    'PeakForm Nutrition, Ember Roasters and the sites around them are fictional examples. Their pages, AI answers and figures illustrate how Xroga works: no accounts are connected, nothing was crawled, and nothing is published, sent or spent.',
};
