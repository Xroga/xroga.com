/**
 * S03 illustrative content. Aurel is a fictional product (shared focus sessions for remote teams) and every figure
 * here is an illustration of how Xroga works, not a measurement. Domains use the reserved `.example` TLD. Provider
 * names are used only to name services; catalog names come from Xroga's integrations directory.
 */

export type Perspective = 'launch' | 'discovery' | 'campaigns' | 'results';
export type ToolId = 'gsc' | 'ahrefs' | 'semrush' | 'gads' | 'meta' | 'hubspot' | 'ga' | 'gtm';

export const PRODUCT = {
  name: 'Aurel',
  domain: 'aurel.example',
  category: 'Focus sessions for remote teams',
  promise: 'Deep work, in good company.',
  sub: 'Shared focus hours for teams that work apart.',
};

export const PERSPECTIVES: { id: Perspective; label: string; title: string; line: string }[] = [
  { id: 'launch', label: 'Launch', title: 'Make the first market impression count.', line: 'A launch page, its announcement and the signals behind them.' },
  { id: 'discovery', label: 'Discovery', title: 'See where demand already exists.', line: 'The searches, comparisons and AI answers shaping buying intent.' },
  {
    id: 'campaigns',
    label: 'Campaigns',
    title: 'One idea, shaped for each audience.',
    line: 'Market insight turned into channel-ready creative, held for review.',
  },
  {
    id: 'results',
    label: 'Results',
    title: 'See what actually moved the business.',
    line: 'Follow attention to activation, and the path that needs work next.',
  },
];

/* ------------------------------------------------------------------------------------------------------ launch */
export type AssetId = 'page' | 'announce' | 'listing' | 'signals';
export const ASSETS: { id: AssetId; label: string; state: string }[] = [
  { id: 'page', label: 'Launch page', state: 'Ready for review' },
  { id: 'announce', label: 'Announcement', state: 'Drafted' },
  { id: 'listing', label: 'Search listing', state: 'Checked' },
  { id: 'signals', label: 'Signals', state: 'Defined' },
];
export const ANNOUNCE = { kicker: 'Now open', title: 'Aurel is here.', text: 'Book a quiet hour with your team, wherever they are.' };
export const LISTING = {
  url: 'aurel.example › focus',
  title: 'Aurel · Shared focus sessions for remote teams',
  text: 'Book quiet hours together. Cameras optional, progress visible.',
};
export const SIGNALS = ['session_booked', 'first_session_done', 'teammate_joined'];

/* --------------------------------------------------------------------------------------------------- discovery */
export const QUERY = 'focus app for remote teams';
export type OpportunityId = 'compare' | 'answer' | 'howto' | 'template';
export interface Opportunity {
  id: OpportunityId;
  query: string;
  kind: string;
  demand: number; // relative weight, 1–4: sizes the node
  presence: 'missing' | 'weak' | 'visible';
  status: string; // where Aurel stands, in a few words
  leader: string; // who holds the answer today
  move: string; // the next asset Xroga proposes
  x: number; // node position in the market field, % of its box
  y: number;
}
export const OPPORTUNITIES: Opportunity[] = [
  {
    id: 'answer',
    query: 'best co-working focus tool',
    kind: 'AI answer',
    demand: 4,
    presence: 'missing',
    status: 'Not cited',
    leader: 'Tempo, Hushly',
    move: 'A methods page AI answers can cite',
    x: 76,
    y: 20,
  },
  {
    id: 'compare',
    query: 'aurel vs tempo',
    kind: 'Comparison',
    demand: 3,
    presence: 'missing',
    status: 'No page',
    leader: 'tempo.example',
    move: 'A fair comparison page',
    x: 22,
    y: 24,
  },
  {
    id: 'howto',
    query: 'how to run a focus session',
    kind: 'How-to',
    demand: 2,
    presence: 'weak',
    status: 'Position 14',
    leader: 'hushly.example',
    move: 'The session guide as a page',
    x: 27,
    y: 74,
  },
  {
    id: 'template',
    query: 'remote deep work schedule',
    kind: 'Template',
    demand: 2,
    presence: 'visible',
    status: 'Position 4',
    leader: 'aurel.example',
    move: 'A schedule people can copy',
    x: 80,
    y: 80,
  },
];
/** quieter related searches that fill out the market field (not interactive) */
export const FIELD = [
  { q: 'virtual coworking', x: 50, y: 6 },
  { q: 'pomodoro for teams', x: 10, y: 50 },
  { q: 'body doubling app', x: 90, y: 50 },
  { q: 'quiet hours policy', x: 50, y: 95 },
];

/* --------------------------------------------------------------------------------------------------- campaigns */
export type AudienceId = 'teams' | 'freelance' | 'study';
export type Channel = 'social' | 'search' | 'email';
export type Art = 'arch' | 'sun' | 'steps';
export interface Audience {
  id: AudienceId;
  name: string;
  art: Art; // the creative's image treatment changes with the audience
  headline: string;
  offer: string;
  search: { title: string; text: string };
  email: { subject: string; body: string; cta: string };
}
export const AUDIENCES: Audience[] = [
  {
    id: 'teams',
    name: 'Remote teams',
    art: 'arch',
    headline: 'Quiet hours your whole team keeps.',
    offer: 'Free for teams of 5',
    search: { title: 'Aurel · Focus Sessions for Remote Teams', text: 'Book shared quiet hours across time zones. Free for teams of 5.' },
    email: { subject: 'Your team’s first quiet hour', body: 'Pick a slot, invite the team, protect two hours of real work.', cta: 'Book the first hour' },
  },
  {
    id: 'freelance',
    name: 'Freelancers',
    art: 'sun',
    headline: 'Company for the hours that count.',
    offer: 'Drop-in rooms, every hour',
    search: { title: 'Aurel · Drop-In Focus Rooms for Freelancers', text: 'Work alongside others in quiet rooms that open every hour.' },
    email: { subject: 'A room opens at 9:00', body: 'Join a quiet room, set one goal, check in when the hour ends.', cta: 'Join a room' },
  },
  {
    id: 'study',
    name: 'Study groups',
    art: 'steps',
    headline: 'Study together. Finish separately.',
    offer: 'Group plans for students',
    search: { title: 'Aurel · Group Study Sessions That Stay on Track', text: 'Shared timers, quiet rooms and a streak the group can see.' },
    email: { subject: 'Exam season, sorted', body: 'Set the group’s sessions once and let reminders do the rest.', cta: 'Plan the week' },
  },
];
export const CHANNELS: { id: Channel; name: string; provider: ToolId; format: string }[] = [
  { id: 'social', name: 'Social', provider: 'meta', format: 'Image post' },
  { id: 'search', name: 'Search', provider: 'gads', format: 'Search ad' },
  { id: 'email', name: 'Email', provider: 'hubspot', format: 'Email' },
];
export const APPROVALS = ['Audience and budget cap', 'Copy and creative', 'Landing page and tracking'];

/* ----------------------------------------------------------------------------------------------------- results */
export const STAGES = ['Visitors', 'Trials', 'Active teams'];
export interface Source {
  id: string;
  name: string;
  mark: string; // a glyph, so sources never rely on colour alone
  flow: [number, number, number];
  note: string; // what contributed, in one line
}
export const SOURCES: Source[] = [
  { id: 'organic', name: 'Search', mark: '◆', flow: [4200, 120, 66], note: 'The schedule template brought steady, qualified visits.' },
  { id: 'ai', name: 'AI answers', mark: '▲', flow: [640, 38, 26], note: 'Small volume, the best activation of any source.' },
  { id: 'paid', name: 'Paid social', mark: '●', flow: [2600, 74, 18], note: 'Plenty of trials, few teams reach a second session.' },
  { id: 'partner', name: 'Partners', mark: '■', flow: [380, 24, 15], note: 'Two community newsletters, both still growing.' },
  { id: 'email', name: 'Email', mark: '✦', flow: [900, 46, 30], note: 'Waitlist invitations converted well in week one.' },
];
export const RESULTS = {
  bottleneck: 'Paid trials stall before the second session.',
  move: 'Invite a teammate during onboarding',
  method: 'Illustrative figures for a fictional launch. In Xroga they come from your connected analytics, counted per source over 30 days.',
};

/* -------------------------------------------------------------------------------------------------------- stack */
export interface Tool {
  id: ToolId;
  name: string;
  step: Perspective; // the journey step this tool feeds
  role: string;
  example: string;
  catalog: string | null; // name in Xroga's integrations directory, or null when not confirmed
}
export const TOOLS: Tool[] = [
  { id: 'gsc', name: 'Search Console', step: 'discovery', role: 'Search clicks', example: 'remote deep work schedule · position 4', catalog: null },
  { id: 'ahrefs', name: 'Ahrefs', step: 'discovery', role: 'Competitor pages', example: 'tempo.example/compare · top page', catalog: 'Ahrefs' },
  { id: 'semrush', name: 'Semrush', step: 'discovery', role: 'Keyword demand', example: 'focus app for remote teams · commercial', catalog: 'SEMrush' },
  { id: 'gads', name: 'Google Ads', step: 'campaigns', role: 'Search campaigns', example: 'Remote teams · draft · $40/day cap', catalog: 'Google Ads API' },
  { id: 'meta', name: 'Meta Ads', step: 'campaigns', role: 'Social campaigns', example: 'Freelancers · draft · not published', catalog: 'Meta Business Suite' },
  { id: 'hubspot', name: 'HubSpot', step: 'campaigns', role: 'Email and CRM', example: 'Waitlist · 1,800 opted in · not sent', catalog: 'HubSpot' },
  { id: 'ga', name: 'Google Analytics', step: 'results', role: 'Conversions', example: 'first_session_done · by source', catalog: 'Google Analytics' },
  { id: 'gtm', name: 'Tag Manager', step: 'results', role: 'Event tags', example: 'session_booked · fires on confirm', catalog: null },
];
export const STACK_GROUPS: { step: Perspective; label: string }[] = [
  { step: 'discovery', label: 'Discover' },
  { step: 'campaigns', label: 'Reach' },
  { step: 'results', label: 'Measure' },
];

/* ------------------------------------------------------------------------------------------------------ helpers */
export const sourceOf = (id: string) => SOURCES.find((s) => s.id === id) ?? SOURCES[0];
export const audienceOf = (id: string) => AUDIENCES.find((a) => a.id === id) ?? AUDIENCES[0];
export const opportunityOf = (id: string) => OPPORTUNITIES.find((o) => o.id === id) ?? OPPORTUNITIES[0];
export const toolOf = (id: ToolId) => TOOLS.find((t) => t.id === id)!;
export const fmt = (n: number) => n.toLocaleString('en-US');
export const pct = (a: number, b: number, digits = 0) => `${((a / b) * 100).toFixed(digits)}%`;
export const totals = () => SOURCES.reduce((t, s) => t.map((v, i) => v + s.flow[i]) as [number, number, number], [0, 0, 0] as [number, number, number]);

export const COPY = {
  eyebrow: 'Xroga / Launch & Growth',
  title: 'A finished product isn’t a finished business.',
  lede: 'Xroga carries what you ship into the market: finding demand, shaping campaigns and tracing which paths bring customers.',
  cta: 'Open the growth workspace',
  preview: 'Interactive preview',
  about: 'Aurel is a fictional company. Its scenes and figures illustrate how Xroga works: no accounts are connected, and nothing is published, sent or spent.',
  stackTitle: 'Your growth stack, in the loop',
  stackLink: 'All integrations',
};
