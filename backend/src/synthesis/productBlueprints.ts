import type { ProjectFile } from '../ai/patches.js';

/**
 * What each kind of product actually has to contain.
 *
 * The gap this closes was described by the person who owns this product: *"our system
 * I think not known their capabilities what they build and what types of files are with
 * what type of product, because not all code file is same for all product building."*
 *
 * They were right, and the evidence agreed. Run `85681d10` asked for a dental clinic
 * landing page and shipped an `index.html` with a hero and nothing else — no services,
 * no team, no contact. The architect planned five files, the builder delivered four,
 * and nothing anywhere compared the two. The pipeline had a rich domain model
 * (`productDefinition` infers entities, lifecycles, permissions) and a file plan from
 * the architect, but no statement of what a *booking site* or a *DeFi dashboard* must
 * contain to be that thing rather than a page with a title on it.
 *
 * A blueprint is that statement. It is used twice:
 *
 * 1. **Before the build**, as an explicit section list in the builder's brief, so the
 *    model is told what "complete" means for this product instead of inferring it.
 * 2. **After the build**, to name what is missing from the delivered files.
 *
 * The second use is deliberately a *report*, not a gate. Section detection reads
 * generated markup for evidence, and a heuristic that blocks a ship is a heuristic that
 * will eventually delete somebody's working product — this codebase has already done
 * that once, over an npm timeout. Gaps are named, fed to the repair pass, and reported
 * honestly. Real structural failures are still caught by `staticValidateProject`.
 */

export type ProductBlueprintId =
  | 'landing_page'
  | 'portfolio'
  | 'booking_site'
  | 'defi_dashboard'
  | 'hackathon_project'
  | 'ecommerce'
  | 'saas_dashboard'
  | 'blog'
  | 'website';

export interface BlueprintSection {
  /** Stable identifier, used in gap reports. */
  id: string;
  /** What the section is, phrased as an instruction to the builder. */
  requirement: string;
  /**
   * Evidence that the section exists in generated output. Matched against the combined
   * text of the delivered files. Deliberately broad — the question is "is there
   * anything here about pricing", not "is the markup shaped a particular way".
   */
  evidence: RegExp;
  /** Recommended sections are briefed but never reported as gaps. */
  priority: 'required' | 'recommended';
}

export interface ProductBlueprint {
  id: ProductBlueprintId;
  label: string;
  /** How a prompt selects this blueprint. First match by specificity order wins. */
  match: RegExp;
  /** One line telling the builder what this product is for. */
  intent: string;
  sections: BlueprintSection[];
  /** Behaviour the product needs beyond page content. */
  capabilities: string[];
}

const section = (
  id: string,
  requirement: string,
  evidence: RegExp,
  priority: BlueprintSection['priority'] = 'required',
): BlueprintSection => ({ id, requirement, evidence, priority });

/** Sections every public-facing page needs regardless of what it sells. */
const WEB_BASE: BlueprintSection[] = [
  section('nav', 'A navigation bar linking to every section on the page', /<nav|role=["']navigation|class=["'][^"']*nav/i),
  section('hero', 'A hero with a headline, one sentence of positioning, and a primary call to action', /<h1[\s>]/i),
  section('footer', 'A footer with copyright and contact or social links', /<footer|class=["'][^"']*footer/i),
  section('responsive', 'A responsive layout that works at 375px as well as on desktop', /@media[^{]*\(\s*(max|min)-width/i),
  section('metadata', 'A page title and meta description for search engines', /<meta[^>]+name=["']description/i),
];

/**
 * Ordered most specific first. A prompt saying "booking site for a dental clinic" must
 * select the booking blueprint, not the landing-page one, even though it matches both.
 */
export const PRODUCT_BLUEPRINTS: readonly ProductBlueprint[] = [
  {
    id: 'defi_dashboard',
    label: 'Crypto / DeFi dashboard',
    match: /\b(defi|de-fi|crypto|web3|token|wallet|staking|liquidity|yield|swap|dex|nft|on-?chain|blockchain)\b/i,
    intent:
      'A dashboard that reads on-chain or market data and presents positions, balances and price movement.',
    sections: [
      ...WEB_BASE,
      section('wallet', 'A wallet connect control with connected and disconnected states', /connect\s*wallet|walletconnect|metamask|useAccount|wagmi/i),
      section('portfolio', 'A portfolio or balances panel showing holdings and their value', /portfolio|balance|holdings|total\s*value|tvl/i),
      section('market', 'A market table listing assets with price and 24h change', /24h|price|market\s*cap|volume/i),
      section('chart', 'At least one chart of price or value over time', /chart|graph|<canvas|<svg[^>]*class=["'][^"']*chart|recharts|chart\.js/i),
      section('transactions', 'A recent transactions or activity list', /transaction|activity|history|recent/i),
      section('empty_states', 'Explicit loading and empty states — a dashboard with no data must say so', /loading|no\s+(data|results|transactions|positions)|skeleton/i, 'recommended'),
      section('disclaimer', 'A risk disclaimer — this displays financial information', /not\s+financial\s+advice|disclaimer|risk/i),
    ],
    capabilities: [
      'Read market or chain data from a public API and handle the request failing',
      'Format token amounts and fiat values without floating-point drift',
      'Never ask for, store, or transmit a private key or seed phrase',
    ],
  },
  {
    id: 'booking_site',
    label: 'Booking / appointment website',
    match: /\b(booking|book\s+(an?\s+)?(appointment|table|room|slot)|appointment|reservation|reserve|schedul\w*|availability|calendar)\b/i,
    intent:
      'A site whose purpose is to take a reservation: the visitor picks a time and submits their details.',
    sections: [
      ...WEB_BASE,
      section('services', 'A list of bookable services or resources with duration and price', /service|treatment|package|duration|\bslot\b/i),
      section('availability', 'A date and time picker showing available slots', /type=["']date|type=["']time|calendar|datepicker|available/i),
      section('booking_form', 'A booking form capturing name, contact details and the chosen slot', /<form|<input[^>]+type=["']email/i),
      section('validation', 'Client-side validation with visible error messages', /required|aria-invalid|invalid|error/i),
      section('confirmation', 'A confirmation state telling the visitor the booking was received', /confirm|thank\s*you|success|we.{0,10}ll be in touch/i),
      section('contact', 'Location, opening hours and a contact method', /hours|open\w*\s*(hours|times)|address|phone|tel:/i),
      section('policy', 'A cancellation or rescheduling policy', /cancel|reschedul|policy/i, 'recommended'),
    ],
    capabilities: [
      'Persist a booking so it survives a page reload — a form that only alerts is not a booking site',
      'Prevent a slot being double-booked',
      'Send or queue a confirmation to the visitor',
    ],
  },
  {
    id: 'hackathon_project',
    label: 'Hackathon project',
    match: /\bhackathon|hack\s*day|devpost|submission\s+project\b/i,
    intent:
      'A demonstrable project built to be judged: it must run immediately and explain itself.',
    sections: [
      ...WEB_BASE,
      section('demo', 'A working demo path a judge can follow in under a minute', /demo|try\s*it|get\s*started|playground/i),
      section('problem', 'A clear statement of the problem being solved', /problem|why|challenge/i),
      section('how_it_works', 'A how-it-works section naming the technology used', /how\s*it\s*works|architecture|built\s*with|tech\s*stack/i),
      section('readme', 'A README with setup steps that work from a clean clone', /##\s*(getting started|setup|installation|run)/i),
      section('team', 'Team or author credits', /team|author|built\s*by/i, 'recommended'),
    ],
    capabilities: [
      'Run with a single documented command and no private credentials',
      'Degrade to sample data when an external API key is absent, rather than crashing',
    ],
  },
  {
    id: 'ecommerce',
    label: 'Online store',
    match: /\b(e-?commerce|online\s*store|storefront|shop|cart|checkout|sell\s+products)\b/i,
    intent: 'A storefront where a visitor browses products and reaches a checkout.',
    sections: [
      ...WEB_BASE,
      section('catalog', 'A product grid with image, name and price', /product|price|\$\d|catalog/i),
      section('product_detail', 'A product detail view with description and an add-to-cart control', /add\s*to\s*cart|buy\s*now|product-detail/i),
      section('cart', 'A cart showing line items, quantities and a total', /cart|subtotal|total/i),
      section('checkout', 'A checkout step collecting delivery and payment details', /checkout|shipping|payment/i),
      section('policies', 'Returns, shipping and privacy information', /return|refund|shipping|privacy/i, 'recommended'),
    ],
    capabilities: [
      'Keep the cart across page navigation',
      'Never handle raw card numbers — use a hosted payment provider',
    ],
  },
  {
    id: 'saas_dashboard',
    label: 'SaaS dashboard',
    match: /\b(saas|admin\s*(panel|dashboard|console)|analytics\s*dashboard|internal\s*tool|crm)\b/i,
    intent: 'An authenticated application where a user manages their own data.',
    sections: [
      ...WEB_BASE,
      section('auth', 'A sign-in path and a signed-out state', /sign\s*in|log\s*in|auth|session/i),
      section('metrics', 'Summary metrics at the top of the dashboard', /metric|kpi|total|count|stat/i),
      section('data_view', 'A table or list of the primary records with sorting or filtering', /<table|role=["']table|filter|sort/i),
      section('actions', 'Create, edit and delete actions on those records', /create|add\s+new|edit|delete/i),
      section('empty_states', 'Empty and loading states for every data view', /loading|no\s+(data|results|records)|empty/i),
    ],
    capabilities: [
      'Scope every query to the signed-in user — one account must never read another account\'s rows',
      'Keep the session across a page reload',
    ],
  },
  {
    id: 'portfolio',
    label: 'Portfolio site',
    match: /\b(portfolio|personal\s*(site|website)|my\s*work|showcase\s*(my|of)\s*(work|projects)|resume|cv)\b/i,
    intent: 'A personal site whose job is to present work credibly and make contact easy.',
    sections: [
      ...WEB_BASE,
      section('about', 'An about section with a short biography', /about|bio|who\s*i\s*am/i),
      section('projects', 'A projects section with at least three entries, each with a description', /project|work|case\s*stud/i),
      section('skills', 'Skills or the technologies used', /skill|tech|stack|tool/i),
      section('contact', 'A contact method — form, email link, or both', /mailto:|contact|get\s*in\s*touch/i),
      section('social', 'Links to professional profiles', /github|linkedin|twitter|dribbble|behance/i, 'recommended'),
    ],
    capabilities: ['Work with JavaScript disabled for the core content'],
  },
  {
    id: 'blog',
    label: 'Blog',
    match: /\b(blog|articles?|posts?|newsletter|publication|magazine)\b/i,
    intent: 'A site that publishes and lists written articles.',
    sections: [
      ...WEB_BASE,
      section('post_list', 'A list of posts with title, date and excerpt', /article|post|excerpt|read\s*more/i),
      section('post_view', 'A readable article layout with a comfortable measure', /max-width|prose|article/i),
      section('categories', 'Categories or tags', /categor|tag|topic/i, 'recommended'),
      section('subscribe', 'A subscribe or follow control', /subscribe|newsletter|follow/i, 'recommended'),
    ],
    capabilities: ['Give every post its own URL'],
  },
  {
    id: 'landing_page',
    label: 'Landing page',
    match: /\blanding\s*page|\bone-?pager|marketing\s*(site|page)|coming\s*soon\b/i,
    intent: 'A single page that explains one offer and drives one action.',
    sections: [
      ...WEB_BASE,
      section('value_props', 'A features or benefits section with at least three items', /feature|benefit|why\s+choose|what\s+we/i),
      section('social_proof', 'Testimonials, logos, or statistics', /testimonial|review|trusted\s*by|customers|\d+\+?\s*(clients|users|customers)/i),
      section('secondary_cta', 'A second call to action further down the page', /get\s*started|contact|book|sign\s*up|request/i),
      section('faq', 'An FAQ answering the obvious objections', /faq|frequently\s*asked|question/i, 'recommended'),
    ],
    capabilities: ['Make the primary action reachable without scrolling on mobile'],
  },
  {
    id: 'website',
    label: 'Website',
    match: /\b(website|web\s*site|web\s*page|site)\b/i,
    intent: 'A multi-section public website.',
    sections: [
      ...WEB_BASE,
      section('about', 'An about section explaining who this is for', /about|who\s*we|our\s*story/i),
      section('offering', 'A section describing what is offered', /service|product|feature|what\s*we/i),
      section('contact', 'A contact section with a real contact method', /contact|mailto:|tel:|get\s*in\s*touch/i),
    ],
    capabilities: [],
  },
] as const;

/**
 * The blueprint for a prompt, or `null` when it does not describe a web product.
 *
 * Returning `null` matters: a CLI tool, a Chrome extension and a mobile app all reach
 * this code, and forcing a `<nav>` requirement onto them would generate gap reports
 * that are simply wrong.
 */
export function detectProductBlueprint(prompt: string): ProductBlueprint | null {
  const text = prompt || '';
  if (!text.trim()) return null;
  // Specificity order: the array is ordered narrow → broad, so the first match wins.
  return PRODUCT_BLUEPRINTS.find((blueprint) => blueprint.match.test(text)) ?? null;
}

/**
 * The blueprint as a block for the builder's brief.
 *
 * Phrased as requirements rather than suggestions, because the failure being addressed
 * is a model that stopped after the hero and considered the job done.
 */
export function blueprintBriefForBuilder(blueprint: ProductBlueprint): string {
  const required = blueprint.sections.filter((s) => s.priority === 'required');
  const recommended = blueprint.sections.filter((s) => s.priority === 'recommended');
  const lines = [
    ``,
    `PRODUCT TYPE: ${blueprint.label}`,
    blueprint.intent,
    ``,
    `This product is not complete until every one of these exists in the delivered files:`,
    ...required.map((s, i) => `${i + 1}. ${s.requirement}`),
  ];
  if (recommended.length) {
    lines.push(``, `Include these where they fit the request:`, ...recommended.map((s) => `- ${s.requirement}`));
  }
  if (blueprint.capabilities.length) {
    lines.push(``, `Behaviour requirements:`, ...blueprint.capabilities.map((c) => `- ${c}`));
  }
  lines.push(
    ``,
    `Write every file in full. Do not stop early, do not leave a file empty, and do not`,
    `write a placeholder comment where content belongs.`,
    ``,
  );
  return lines.join('\n');
}

export interface BlueprintGap {
  sectionId: string;
  requirement: string;
}

/**
 * Required sections with no evidence in the delivered files.
 *
 * Searches the combined text of source files — markup, components and styles together —
 * because a section can legitimately live in any of them. Binary and lock files are
 * excluded so their contents cannot accidentally satisfy a pattern.
 */
export function missingBlueprintSections(
  blueprint: ProductBlueprint,
  files: ProjectFile[],
): BlueprintGap[] {
  const haystack = files
    .filter((file) => /\.(html?|tsx?|jsx?|css|scss|md|json)$/i.test(file.path))
    .filter((file) => !/package-lock\.json$/i.test(file.path))
    .map((file) => file.content ?? '')
    .join('\n');
  if (!haystack.trim()) return [];

  return blueprint.sections
    .filter((item) => item.priority === 'required')
    .filter((item) => !item.evidence.test(haystack))
    .map((item) => ({ sectionId: item.id, requirement: item.requirement }));
}

/** One line naming what is missing, for the run's report. */
export function describeBlueprintGaps(blueprint: ProductBlueprint, gaps: BlueprintGap[]): string {
  if (!gaps.length) return '';
  const list = gaps.map((gap) => gap.sectionId.replace(/_/g, ' ')).join(', ');
  return `${blueprint.label}: ${gaps.length} expected ${gaps.length === 1 ? 'section is' : 'sections are'} missing — ${list}.`;
}
