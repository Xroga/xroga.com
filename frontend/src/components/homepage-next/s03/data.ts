/**
 * S03 illustrative scenarios. Both businesses are fictional and every figure is an illustration of how Xroga works,
 * never a measurement: Northlane Heating (an existing local business with a website) in the search chapter, and Ember
 * Roasters (a coffee subscription about to launch) in the growth chapter. Domains use the reserved `.example` TLD.
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
export const SITE = { name: 'Northlane Heating', domain: 'northlane.example', city: 'Leeds' };

export type Lens = 'health' | 'content' | 'ai' | 'links' | 'local';
export const LENSES: { id: Lens; label: string; status: string; discipline: string; tools: ToolId[] }[] = [
  { id: 'health', label: 'Site health', status: '3 crawl issues', discipline: 'Technical SEO', tools: ['gsc', 'semrush'] },
  { id: 'content', label: 'Keywords & content', status: '1 missing page', discipline: 'On-page & content', tools: ['gsc', 'semrush', 'ahrefs'] },
  { id: 'ai', label: 'AI answers', status: 'Not cited', discipline: 'AEO · GEO', tools: [] },
  { id: 'links', label: 'Authority & links', status: '3 link gaps', discipline: 'Off-page & digital PR', tools: ['ahrefs', 'semrush'] },
  { id: 'local', label: 'Local presence', status: '2 missing details', discipline: 'Local SEO', tools: ['gbp', 'gsc'] },
];

/* --- site health: a small crawlable site ------------------------------------------------------------ */
export interface Page {
  id: string;
  path: string;
  x: number; // % of the crawl map
  y: number;
}
export const PAGES: Page[] = [
  { id: 'home', path: '/', x: 12, y: 50 },
  { id: 'services', path: '/services', x: 40, y: 22 },
  { id: 'pricing', path: '/pricing', x: 40, y: 50 },
  { id: 'blog', path: '/blog', x: 40, y: 78 },
  { id: 'repairs', path: '/services/boiler-repair', x: 74, y: 14 },
  { id: 'locations', path: '/locations/leeds', x: 74, y: 44 },
  { id: 'guide', path: '/blog/boiler-pressure', x: 74, y: 78 },
];
export type IssueId = 'broken' | 'noindex' | 'schema';
export interface Issue {
  id: IssueId;
  label: string;
  from: string; // page ids: the internal link this issue sits on
  to: string;
  status: string;
  consequence: string;
  repair: string;
  verify: string;
}
export const ISSUES: Issue[] = [
  {
    id: 'broken',
    label: 'Broken link',
    from: 'services',
    to: 'repairs',
    status: '404 · /services/boiler-repair',
    consequence: 'Your main service page is unreachable for visitors and crawlers.',
    repair: 'Point the link at /services/boiler-repairs',
    verify: 'Re-crawl /services: the link returns 200',
  },
  {
    id: 'noindex',
    label: 'Blocked page',
    from: 'pricing',
    to: 'locations',
    status: 'noindex · /locations/leeds',
    consequence: 'Your city page cannot appear in search results.',
    repair: 'Remove the noindex tag from the template',
    verify: 'URL inspection reports the page as indexable',
  },
  {
    id: 'schema',
    label: 'Missing schema',
    from: 'blog',
    to: 'guide',
    status: 'No FAQ markup · /blog/boiler-pressure',
    consequence: 'Your most-read guide shows as a plain result.',
    repair: 'Add FAQ structured data for 3 questions',
    verify: 'Rich results test passes for the page',
  },
];
export const LINKS: [string, string][] = [
  ['home', 'services'],
  ['home', 'pricing'],
  ['home', 'blog'],
  ['services', 'repairs'],
  ['pricing', 'locations'],
  ['blog', 'guide'],
  ['services', 'locations'],
];

/* --- keywords & content ------------------------------------------------------------------------------- */
export type Intent = 'buying' | 'comparing' | 'learning';
export interface Query {
  id: string;
  q: string;
  intent: Intent;
  you: string; // where Northlane stands
  rival: string; // who covers it today
  gap: boolean;
}
export const QUERIES: Query[] = [
  { id: 'emergency', q: 'emergency boiler repair leeds', intent: 'buying', you: 'Position 14', rival: 'brightflow.example', gap: false },
  { id: 'cost', q: 'new boiler cost leeds', intent: 'buying', you: 'No page', rival: 'cityboiler.example', gap: true },
  { id: 'combi', q: 'combi vs system boiler', intent: 'comparing', you: 'No page', rival: 'brightflow.example', gap: true },
  { id: 'best', q: 'best boiler brands 2026', intent: 'comparing', you: 'Position 31', rival: 'homeguide.example', gap: false },
  { id: 'pressure', q: 'boiler pressure too low', intent: 'learning', you: 'Position 4', rival: 'northlane.example', gap: false },
  { id: 'bleed', q: 'how to bleed a radiator', intent: 'learning', you: 'Position 9', rival: 'homeguide.example', gap: false },
];
export const BRIEF = {
  cost: {
    title: 'New boiler cost in Leeds: 2026 price guide',
    h2: ['What a new boiler costs', 'What changes the price', 'Finance and grants'],
    faq: 'Do I need a new flue?',
    link: 'From /pricing and /services',
  },
  combi: {
    title: 'Combi or system boiler? Which suits your home',
    h2: ['How each one works', 'Homes that suit each', 'Running costs compared'],
    faq: 'Can I switch types?',
    link: 'From /services and the pressure guide',
  },
} as const;

/* --- AI answers ----------------------------------------------------------------------------------------- */
export type CiteState = 'cited' | 'absent' | 'untested' | 'conflicting';
export const AI_QUESTION = 'Who should I call for a boiler repair in Leeds?';
export const AI_SOURCES: { id: string; domain: string; kind: string; state: CiteState }[] = [
  { id: 'brightflow', domain: 'brightflow.example', kind: 'Competitor service page', state: 'cited' },
  { id: 'homeguide', domain: 'homeguide.example', kind: 'Buyer guide', state: 'cited' },
  { id: 'directory', domain: 'tradefinder.example', kind: 'Trade directory', state: 'conflicting' },
];
export const AI_SAMPLES = [
  { id: 's1', label: 'Sample 1', you: 'absent' as CiteState },
  { id: 's2', label: 'Sample 2', you: 'absent' as CiteState },
  { id: 's3', label: 'Sample 3', you: 'untested' as CiteState },
];
export const AI_GAP = {
  why: 'Answers cite pages that list services, areas and response times. Yours list none of the three.',
  move: 'Add service areas and response times to /services',
  method: 'Three sampled answers, 12 Oct, one location. Answers vary by assistant, date and place; nothing here is a guarantee.',
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
  x: number; // position on the source arc, % of the graph
  y: number;
}
export const SOURCES: Source[] = [
  {
    id: 'leedsnews',
    domain: 'leedslive.example',
    page: '/home/winter-heating-tips',
    cls: 'verified',
    topic: 'Local news',
    seen: '3 Aug',
    relevance: 'High',
    action: 'Keep the cited page up to date',
    x: 68,
    y: 8,
  },
  {
    id: 'energy',
    domain: 'energysaver.example',
    page: '/installers/yorkshire',
    cls: 'verified',
    topic: 'Energy advice',
    seen: '18 Jun',
    relevance: 'High',
    action: 'Monitor the listing',
    x: 88,
    y: 24,
  },
  {
    id: 'forum',
    domain: 'homefixers.example',
    page: '/t/boiler-keeps-losing-pressure',
    cls: 'mention',
    topic: 'Home repair forum',
    seen: '2 Oct',
    relevance: 'Medium',
    action: 'Ask the author to link the guide they quote',
    x: 94,
    y: 46,
  },
  {
    id: 'guide',
    domain: 'homeguide.example',
    page: '/best-heating-engineers-leeds',
    cls: 'rival',
    topic: 'Buyer guide',
    seen: '—',
    relevance: 'High',
    action: 'Offer the pressure guide as a resource',
    x: 88,
    y: 68,
  },
  {
    id: 'council',
    domain: 'greenhomes.example',
    page: '/approved-installers',
    cls: 'rival',
    topic: 'Grant scheme list',
    seen: '—',
    relevance: 'High',
    action: 'Check the listing criteria and apply',
    x: 72,
    y: 90,
  },
  {
    id: 'podcast',
    domain: 'trade-talk.example',
    page: '/episodes/winter-callouts',
    cls: 'rival',
    topic: 'Trade podcast',
    seen: '—',
    relevance: 'Medium',
    action: 'Pitch an expert interview',
    x: 58,
    y: 62,
  },
  {
    id: 'blog',
    domain: 'cosyhome.example',
    page: '/heating-guides',
    cls: 'prospect',
    topic: 'Home blog',
    seen: '—',
    relevance: 'Medium',
    action: 'Draft a data-led pitch',
    x: 44,
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
    action: 'Excluded: buying links breaks search policies',
    x: 96,
    y: 92,
  },
];
export const RIVAL = { domain: 'brightflow.example' };
export type LinkMode = 'mine' | 'gap' | 'mentions' | 'outreach';
export const LINK_MODES: { id: LinkMode; label: string; show: LinkClass[] }[] = [
  { id: 'mine', label: 'My links', show: ['verified'] },
  { id: 'gap', label: 'Competitor gap', show: ['verified', 'rival'] },
  { id: 'mentions', label: 'Unlinked mentions', show: ['verified', 'mention'] },
  { id: 'outreach', label: 'Outreach', show: ['rival', 'mention', 'prospect', 'discarded'] },
];
export const CLASS_LABEL: Record<LinkClass, string> = {
  verified: 'Links to you · verified',
  mention: 'Mentions you · no link',
  rival: 'Links to competitor only',
  prospect: 'Relevant prospect',
  discarded: 'Excluded',
};

/* --- local presence ---------------------------------------------------------------------------------------- */
export const LOCAL = {
  query: 'boiler repair near me',
  area: 'LS6 · 5 km service area',
  fields: [
    { id: 'name', label: 'Name', ok: true },
    { id: 'category', label: 'Primary category', ok: true },
    { id: 'phone', label: 'Phone matches site', ok: true },
    { id: 'hours', label: 'Opening hours', ok: false },
    { id: 'area', label: 'Service areas', ok: false },
  ],
  pins: [
    { id: 'you', name: 'Northlane Heating', x: 46, y: 50, you: true },
    { id: 'p1', name: 'Brightflow', x: 30, y: 30, you: false },
    { id: 'p2', name: 'City Boiler Co', x: 66, y: 34, you: false },
    { id: 'p3', name: 'Warm Hands', x: 60, y: 70, you: false },
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
export const issueOf = (id: IssueId) => ISSUES.find((i) => i.id === id)!;
export const groupOf = (id: AdGroup) => AD_GROUPS.find((g) => g.id === id)!;
export const audienceOf = (id: Audience) => AUDIENCES.find((a) => a.id === id)!;

export const COPY = {
  eyebrow: 'Xroga / Search & Growth',
  title: 'Getting found is work. So is winning the customer.',
  lede: 'Xroga inspects how people find you and prepares the marketing work, through the tools you connect and with your approval.',
  search: {
    kicker: 'Search & AI visibility',
    title: 'See what search engines miss.',
    line: 'Find the pages, sources and links holding your visibility back.',
    enter: 'Explore search work',
  },
  growth: {
    kicker: 'Launch & marketing',
    title: 'From search intent to a campaign ready for review.',
    line: 'Give every channel a job, then trace what it brings in.',
    enter: 'Explore growth work',
  },
  disclosure: 'Interactive example',
  about:
    'Northlane Heating and Ember Roasters are fictional. Their figures illustrate how Xroga works: no accounts are connected, and nothing is published, sent or spent.',
};
