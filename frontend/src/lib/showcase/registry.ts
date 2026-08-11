/**
 * Xroga AI Showcase — the single source of truth for the showcase products.
 *
 * Everything in this module is public, browser-safe metadata. It deliberately
 * contains no filesystem paths: the browser only ever sends a template `id` and
 * `version`, and the server resolves those against its own allow-list before it
 * touches any template source. See `backend/src/services/showcase/templateSources.ts`.
 */

export type ShowcaseCategory =
  | 'Website'
  | 'Marketplace'
  | 'Booking'
  | 'Mobile app'
  | 'AI SaaS'
  | 'Game';

/**
 * `live` — the interactive preview route exists and is verified.
 * `building` — metadata is final but the interactive build is still in progress.
 *   The UI must say so plainly rather than showing a fake preview.
 */
export type ShowcaseStatus = 'live' | 'building';

export interface GuidedQuestion {
  id: string;
  /** Question shown to the user. Kept short — this is not a technical survey. */
  label: string;
  placeholder?: string;
  /** `quick` shows in the first step; `advanced` is behind progressive disclosure. */
  tier: 'quick' | 'advanced';
  kind: 'text' | 'textarea' | 'choice';
  choices?: readonly string[];
}

export interface ShowcaseTemplate {
  id: string;
  slug: string;
  name: string;
  category: ShowcaseCategory;
  shortDescription: string;
  longDescription: string;
  /** Headline capabilities, shown on cards and the detail page. */
  capabilities: readonly string[];
  technologies: readonly string[];
  templateVersion: string;
  status: ShowcaseStatus;
  featured: boolean;
  /** True when the product is a mobile app rendered in a phone frame. */
  mobileApp: boolean;
  /** Accent used for the card's colour block. Must be a CSS colour. */
  accent: string;
  /** Shown wherever demonstration data appears, so nothing reads as real. */
  demoDataNotice?: string;
  /** Seed prompt used when the user skips the guided questions entirely. */
  defaultBuildPrompt: string;
  guidedQuestions: readonly GuidedQuestion[];
  /** Areas a user is most likely to want changed — drives the build plan. */
  editableAreas: readonly string[];
  /** Checks that must pass before a customised build is reported as complete. */
  requiredValidation: readonly string[];
  supportedIntegrations: readonly string[];
  lastVerifiedAt: string | null;
}

/**
 * Thumbnails are real screenshots of the running product, captured by
 * `scripts/capture-showcase-thumbnails.mjs` — never mockups.
 *
 * Cards use these rather than a live frame so a page showing all six does not boot
 * six application runtimes. The interactive preview still runs live on the detail
 * and preview routes, which is where a user has asked to try the product.
 */
export function thumbnailFor(template: ShowcaseTemplate, view: 'desktop' | 'tablet' | 'mobile' = 'desktop'): string {
  return `/showcase/thumbnails/${template.slug}-${view}.webp?v=${encodeURIComponent(template.templateVersion)}`;
}

/** Intrinsic size of each stored thumbnail, so images reserve space and never shift layout. */
export const THUMBNAIL_SIZES = {
  desktop: { width: 960, height: 600 },
  tablet: { width: 640, height: 767 },
  mobile: { width: 414, height: 760 },
} as const;

/** Questions every product asks. Kept to two so the first step stays short. */
const BRAND_QUESTIONS: readonly GuidedQuestion[] = [
  {
    id: 'brandName',
    label: 'What is the name of your product or business?',
    placeholder: 'Northstar Properties',
    tier: 'quick',
    kind: 'text',
  },
  {
    id: 'visualStyle',
    label: 'Which visual style fits your brand?',
    tier: 'quick',
    kind: 'choice',
    choices: ['Clean and minimal', 'Bold and colourful', 'Dark and premium', 'Warm and friendly'],
  },
] as const;

const ADVANCED_QUESTIONS: readonly GuidedQuestion[] = [
  {
    id: 'colors',
    label: 'Preferred colours',
    placeholder: 'charcoal, white, emerald',
    tier: 'advanced',
    kind: 'text',
  },
  { id: 'fonts', label: 'Preferred fonts', placeholder: 'Inter, or leave blank', tier: 'advanced', kind: 'text' },
  {
    id: 'integrations',
    label: 'Any integrations you need?',
    placeholder: 'WhatsApp enquiries, Stripe, Google Maps',
    tier: 'advanced',
    kind: 'text',
  },
  {
    id: 'instructions',
    label: 'Anything else Xroga AI should know?',
    placeholder: 'Describe anything specific in your own words.',
    tier: 'advanced',
    kind: 'textarea',
  },
] as const;

export const SHOWCASE_TEMPLATES: readonly ShowcaseTemplate[] = [
  {
    id: 'business-website',
    slug: 'modern-business-website',
    name: 'Modern Business Website',
    category: 'Website',
    shortDescription: 'A dark editorial 2026 marketing site for an agency, startup, or consultancy.',
    longDescription:
      'A complete, responsive editorial marketing website with a dimensional hero, bento services, large product mockups, process, pricing, FAQ, and a validated demo contact form. Every section is editable and driven by local brand tokens.',
    capabilities: [
      'Responsive navigation with mobile menu',
      'Services, portfolio, and process sections',
      'Pricing packages and FAQ',
      'Contact form with validation and success state',
      'Reduced-motion-safe reveals and interactions',
    ],
    technologies: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS'],
    templateVersion: '2.0.0',
    status: 'live',
    featured: true,
    mobileApp: false,
    accent: '#c2f04a',
    demoDataNotice: 'Company, project outcomes, testimonials, and pricing are illustrative sample content.',
    defaultBuildPrompt:
      'Customize the Modern Business Website template into a production marketing site. Preserve the dark editorial direction, responsive navigation, bento services, product mockups, process, pricing, FAQ, reduced-motion support, and the validated contact form.',
    guidedQuestions: [
      {
        id: 'purpose',
        label: 'What does your business do?',
        placeholder: 'We design and build custom software for logistics teams.',
        tier: 'quick',
        kind: 'textarea',
      },
      ...BRAND_QUESTIONS,
      {
        id: 'primaryCta',
        label: 'What is the main action visitors should take?',
        placeholder: 'Book a discovery call',
        tier: 'quick',
        kind: 'text',
      },
      {
        id: 'pages',
        label: 'Which pages do you need?',
        placeholder: 'Home, Services, Work, About, Contact',
        tier: 'advanced',
        kind: 'text',
      },
      ...ADVANCED_QUESTIONS,
    ],
    editableAreas: ['Hero copy', 'Services', 'Portfolio', 'Pricing', 'FAQ', 'Contact details', 'Brand tokens'],
    requiredValidation: ['typecheck', 'lint', 'production build', 'responsive check'],
    supportedIntegrations: ['GitHub', 'Vercel', 'Contact form email'],
    lastVerifiedAt: '2026-07-31',
  },
  {
    id: 'real-estate-platform',
    slug: 'real-estate-platform',
    name: 'Real Estate Platform',
    category: 'Marketplace',
    shortDescription: 'Property listings with search, filters, favourites, and a mortgage calculator.',
    longDescription:
      'A property marketplace with listing cards, keyword search, city and property-type filters, a price range, a bedroom filter, five sort orders, a detail drawer with per-property specifications and features, favourites persisted on the device, and a mortgage calculator that runs real amortisation arithmetic.',
    capabilities: [
      'Keyword search across area, type, and features',
      'City, type, price, and bedroom filters with reset',
      'Five sort orders and a live result count',
      'Detail drawer with a four-view image gallery',
      'Amenities, a map-ready location slot, and an agent enquiry form',
      'Favourites saved on the device',
      'Mortgage calculator with real amortisation',
    ],
    technologies: ['Next.js', 'React', 'TypeScript'],
    templateVersion: '2.0.0',
    status: 'live',
    featured: true,
    mobileApp: false,
    accent: '#a78bfa',
    demoDataNotice: 'All properties are demonstration data and are not live inventory.',
    defaultBuildPrompt:
      'Customize the Real Estate Platform template. Preserve search, filtering, sorting, property details, favourites, and the mortgage calculator.',
    guidedQuestions: [
      {
        id: 'propertyType',
        label: 'What type of properties do you list?',
        placeholder: 'Luxury apartments and villas',
        tier: 'quick',
        kind: 'text',
      },
      ...BRAND_QUESTIONS,
      {
        id: 'locations',
        label: 'Which locations do you cover?',
        placeholder: 'Lisbon, Porto, Algarve',
        tier: 'quick',
        kind: 'text',
      },
      {
        id: 'inquiryMethod',
        label: 'Which enquiry method should be most prominent?',
        tier: 'advanced',
        kind: 'choice',
        choices: ['Contact form', 'WhatsApp', 'Phone call', 'Email'],
      },
      ...ADVANCED_QUESTIONS,
    ],
    editableAreas: ['Listings data', 'Filters', 'Detail layout', 'Agent details', 'Calculator defaults', 'Brand tokens'],
    requiredValidation: ['typecheck', 'lint', 'production build', 'filter behaviour', 'favourites persistence'],
    supportedIntegrations: ['GitHub', 'Vercel', 'Maps', 'WhatsApp'],
    lastVerifiedAt: null,
  },
  {
    id: 'booking-platform',
    slug: 'booking-platform',
    name: 'Booking Platform',
    category: 'Booking',
    shortDescription: 'Curated stays with smart matching, live filters, favourites, and transparent booking math.',
    longDescription:
      'A reservation flow where date and guest selection drive real availability rules — capacity, minimum stay, and blocked check-in weekdays. The price breakdown is computed from the actual stay length with cleaning, service fee, and tax lines, and a three-step confirmation validates before it will advance. No payment is collected at any point.',
    capabilities: [
      'Date and guest selection with validation',
      'Availability from real capacity and minimum-stay rules',
      'Computed price breakdown with fees and tax',
      'Three-step reservation flow with a progress indicator',
      'Confirmation state that never claims a payment',
    ],
    technologies: ['Next.js', 'React', 'TypeScript'],
    templateVersion: '2.0.0',
    status: 'live',
    featured: false,
    mobileApp: false,
    accent: '#38bdf8',
    demoDataNotice: 'Availability and pricing are demonstration data. No real reservation or payment is made.',
    defaultBuildPrompt:
      'Customize the Booking Platform template. Preserve availability search, the booking form, dynamic price calculation, and the confirmation state.',
    guidedQuestions: [
      {
        id: 'bookedThing',
        label: 'What is being booked?',
        placeholder: 'Boutique hotel rooms',
        tier: 'quick',
        kind: 'text',
      },
      ...BRAND_QUESTIONS,
      {
        id: 'availability',
        label: 'How is availability decided?',
        placeholder: 'Per night, with a two-night minimum',
        tier: 'advanced',
        kind: 'text',
      },
      {
        id: 'payments',
        label: 'Do you need payments?',
        tier: 'advanced',
        kind: 'choice',
        choices: ['Not yet', 'Deposit only', 'Full payment at booking'],
      },
      ...ADVANCED_QUESTIONS,
    ],
    editableAreas: ['Inventory data', 'Pricing rules', 'Booking form', 'Fees and taxes', 'Brand tokens'],
    requiredValidation: ['typecheck', 'lint', 'production build', 'price calculation'],
    supportedIntegrations: ['GitHub', 'Vercel', 'Stripe', 'Calendar'],
    lastVerifiedAt: null,
  },
  {
    id: 'android-app',
    slug: 'android-app',
    name: 'Android App',
    category: 'Mobile app',
    shortDescription: 'A cross-platform Expo app with navigation, saved items, and settings.',
    longDescription:
      'An Expo and React Native application with bottom-tab navigation, a browse list with search and category filters, a detail sheet, saved items persisted on the device, and working settings toggles. The showcase renders the interface in an interactive phone frame in the browser — no APK is built and no store listing exists.',
    capabilities: [
      'Bottom-tab navigation across browse, saved, profile, and settings',
      'Browse with search and category filters',
      'Detail sheet with save and dismiss',
      'Saved items persisted on the device',
      'Profile screen summarising real local activity',
      'Working settings toggles, including live text sizing',
    ],
    technologies: ['Expo', 'React Native', 'TypeScript'],
    templateVersion: '1.0.0',
    status: 'live',
    featured: false,
    mobileApp: true,
    accent: '#34d399',
    demoDataNotice: 'Content is demonstration data. No store listing or signed release exists.',
    defaultBuildPrompt:
      'Customize the Android App template. Preserve navigation, the core screens, local persistence, and Android-safe spacing.',
    guidedQuestions: [
      {
        id: 'purpose',
        label: "What is the app's main purpose?",
        placeholder: 'Track workouts and log progress',
        tier: 'quick',
        kind: 'textarea',
      },
      ...BRAND_QUESTIONS,
      {
        id: 'screens',
        label: 'Which screens are required?',
        placeholder: 'Home, Search, Detail, Saved, Profile',
        tier: 'advanced',
        kind: 'text',
      },
      {
        id: 'signIn',
        label: 'Should users sign in?',
        tier: 'advanced',
        kind: 'choice',
        choices: ['No sign-in', 'Optional sign-in', 'Required sign-in'],
      },
      ...ADVANCED_QUESTIONS,
    ],
    editableAreas: ['Screens', 'Navigation', 'Saved data model', 'Theme', 'App name and icon'],
    requiredValidation: ['typecheck', 'lint', 'expo config check'],
    supportedIntegrations: ['GitHub', 'Expo EAS'],
    lastVerifiedAt: null,
  },
  {
    id: 'ai-saas',
    slug: 'ai-saas-chatbot',
    name: 'AI SaaS with AI Chatbot',
    category: 'AI SaaS',
    shortDescription: 'Aura is a polished AI workspace with live, server-streamed Groq responses.',
    longDescription:
      'Aura is a modern AI chat product with multi-conversation history, selectable Groq models, prompt starters, responsive navigation, themes, assistant personas, creativity controls, and streamed responses. Provider credentials remain exclusively on the server, and the public endpoint is rate limited.',
    capabilities: [
      'Product overview with a real session summary',
      'Live streaming AI chat with suggested prompts and honest error states',
      'Multi-conversation history with auto-titling',
      'Selectable Groq models and assistant personas',
      'Session usage counted from real activity',
      'Server-only provider credential and public rate limiting',
      'Responsive light and dark themes',
    ],
    technologies: ['Next.js', 'React', 'TypeScript', 'Groq API'],
    templateVersion: '2.0.0',
    status: 'live',
    featured: true,
    mobileApp: false,
    accent: '#9ef5d1',
    demoDataNotice:
      'The public preview can call Groq through a rate-limited Xroga server route when the deployment credential is configured. Conversations remain local to the preview session.',
    defaultBuildPrompt:
      'Customize the AI SaaS template. Preserve the chat workspace, conversation history, settings, and the usage views.',
    guidedQuestions: [
      {
        id: 'problem',
        label: 'What problem does your AI solve?',
        placeholder: 'Summarise long support tickets for agents',
        tier: 'quick',
        kind: 'textarea',
      },
      ...BRAND_QUESTIONS,
      {
        id: 'users',
        label: 'Who are the users?',
        placeholder: 'Support teams at mid-size SaaS companies',
        tier: 'quick',
        kind: 'text',
      },
      {
        id: 'aiActions',
        label: 'Which AI actions should be available?',
        placeholder: 'Summarise, draft a reply, extract action items',
        tier: 'advanced',
        kind: 'text',
      },
      ...ADVANCED_QUESTIONS,
    ],
    editableAreas: ['Marketing copy', 'Dashboard metrics', 'Chat actions', 'Prompt library', 'Plans', 'Brand tokens'],
    requiredValidation: ['typecheck', 'lint', 'production build', 'no exposed keys'],
    supportedIntegrations: ['GitHub', 'Vercel', 'Supabase', 'Model provider (BYOK)'],
    lastVerifiedAt: null,
  },
  {
    id: 'web-game',
    slug: 'playable-web-game',
    name: 'Playable Web Game',
    category: 'Game',
    shortDescription: 'A genuinely playable browser game with score, restart, and best-score saving.',
    longDescription:
      'An original canvas arcade game with a real requestAnimationFrame loop, delta timing, AABB collision, collectables, difficulty that rises with survival time, pause and resume, restart, keyboard, pointer and touch controls, and a best score saved on the device. All geometry is drawn procedurally — no third-party or licensed assets.',
    capabilities: [
      'Start screen with instructions',
      'Real game loop with delta timing and collision',
      'Rising difficulty, pause, resume, and restart',
      'Synthesised sound with an off-by-default toggle',
      'Keyboard, pointer, and touch controls',
      'Best score saved on the device',
    ],
    technologies: ['React', 'TypeScript', 'Canvas'],
    templateVersion: '1.0.0',
    status: 'live',
    featured: false,
    mobileApp: false,
    accent: '#fb7185',
    defaultBuildPrompt:
      'Customize the Playable Web Game template. Preserve the game loop, scoring, restart, and both keyboard and touch controls.',
    guidedQuestions: [
      {
        id: 'theme',
        label: 'What visual theme should it use?',
        placeholder: 'Neon retro arcade',
        tier: 'quick',
        kind: 'text',
      },
      ...BRAND_QUESTIONS,
      { id: 'goal', label: 'What is the goal of the game?', placeholder: 'Survive as long as possible', tier: 'quick', kind: 'text' },
      {
        id: 'difficulty',
        label: 'Should difficulty increase over time?',
        tier: 'advanced',
        kind: 'choice',
        choices: ['Yes, gradually', 'Yes, in stages', 'No, keep it constant'],
      },
      ...ADVANCED_QUESTIONS,
    ],
    editableAreas: ['Visual theme', 'Scoring rules', 'Difficulty curve', 'Controls', 'Sound'],
    requiredValidation: ['typecheck', 'lint', 'production build', 'playable check'],
    supportedIntegrations: ['GitHub', 'Vercel'],
    lastVerifiedAt: null,
  },
] as const;

/** Registry is fixed at six products by design. */
export const SHOWCASE_COUNT = 6;

export function getAllShowcaseSlugs(): string[] {
  return SHOWCASE_TEMPLATES.map((template) => template.slug);
}

export function getShowcaseBySlug(slug: string | undefined | null): ShowcaseTemplate | null {
  if (!slug) return null;
  return SHOWCASE_TEMPLATES.find((template) => template.slug === slug) ?? null;
}

export function getShowcaseById(id: string | undefined | null): ShowcaseTemplate | null {
  if (!id) return null;
  return SHOWCASE_TEMPLATES.find((template) => template.id === id) ?? null;
}

/** Route for a product's interactive preview. `building` products have none yet. */
export function previewRouteFor(template: ShowcaseTemplate): string | null {
  return template.status === 'live' ? `/showcase/${template.slug}/preview` : null;
}

export function isLive(template: ShowcaseTemplate): boolean {
  return template.status === 'live';
}
