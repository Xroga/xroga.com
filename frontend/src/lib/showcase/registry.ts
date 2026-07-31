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
    shortDescription: 'A premium marketing site for an agency, startup, or consultancy.',
    longDescription:
      'A complete, responsive marketing website with a modern hero, services, portfolio, process, pricing, FAQ, and a validated contact form. Every section is editable and driven by brand tokens, so changing colours, copy, and structure does not require rebuilding the page.',
    capabilities: [
      'Responsive navigation with mobile menu',
      'Services, portfolio, and process sections',
      'Pricing packages and FAQ',
      'Contact form with validation and success state',
      'Brand tokens for colours and type',
    ],
    technologies: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS'],
    templateVersion: '1.0.0',
    status: 'live',
    featured: true,
    mobileApp: false,
    accent: '#c2f04a',
    demoDataNotice: 'Testimonials and portfolio entries are sample content.',
    defaultBuildPrompt:
      'Customize the Modern Business Website template into a production marketing site. Preserve the responsive navigation, services, portfolio, process, pricing, FAQ, and the validated contact form.',
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
      'Property detail drawer with specifications',
      'Favourites saved on the device',
      'Mortgage calculator with real amortisation',
    ],
    technologies: ['Next.js', 'React', 'TypeScript'],
    templateVersion: '1.0.0',
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
    shortDescription: 'Availability search, reservations, and a transparent price breakdown.',
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
    templateVersion: '1.0.0',
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
      'Bottom-tab navigation between three sections',
      'Browse with search and category filters',
      'Detail sheet with save and dismiss',
      'Saved items persisted on the device',
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
    shortDescription: 'A SaaS shell with a full AI chat workspace, history, and usage views.',
    longDescription:
      'A SaaS application shell around a chat workspace: multi-conversation history with auto-titling, suggested prompts, a composer with keyboard send, a usage panel counted from real session activity, and a guide for wiring your own provider key server-side. The preview runs in a labelled demonstration mode — replies are composed locally and every one says so, because the template will not present composed text as model output.',
    capabilities: [
      'Chat workspace with suggested prompts',
      'Multi-conversation history with auto-titling',
      'Usage panel counted from real session activity',
      'Server-side provider key guidance, no bundled credential',
      'Demonstration mode labelled on every reply',
    ],
    technologies: ['Next.js', 'React', 'TypeScript'],
    templateVersion: '1.0.0',
    status: 'live',
    featured: true,
    mobileApp: false,
    accent: '#f59e0b',
    demoDataNotice:
      'The public preview runs a clearly labelled demonstration mode. It does not call a live model and no API keys are used.',
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
