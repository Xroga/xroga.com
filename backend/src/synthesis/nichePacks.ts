import type {
  ProductClassification,
} from './productTaxonomy.js';

export const NICHE_PACK_SCHEMA_VERSION =
  '1.0.0' as const;

export interface NichePack {
  readonly schemaVersion:
    typeof NICHE_PACK_SCHEMA_VERSION;

  readonly id:
    string;

  readonly domain:
    string;

  readonly aliases:
    readonly string[];

  readonly contentRequirements:
    readonly string[];

  readonly uxGuidance:
    readonly string[];

  readonly trustRequirements:
    readonly string[];

  readonly forbiddenAssumptions:
    readonly string[];
}

const PACKS:
  readonly NichePack[] = [
  {
    schemaVersion:
      NICHE_PACK_SCHEMA_VERSION,

    id:
      'photography',

    domain:
      'photography',

    aliases: [
      'photography',
      'photographer',
      'photo studio',
      'wedding photographer',
    ],

    contentRequirements: [
      'Prominent portfolio or gallery work',
      'Clear photographer identity and specialty',
      'Contact or inquiry path',
      'Services or session categories when relevant',
    ],

    uxGuidance: [
      'Prioritize imagery and whitespace over dense text.',
      'Gallery interaction must remain usable on mobile.',
      'Avoid unnecessary dashboard-like UI.',
    ],

    trustRequirements: [
      'Do not invent awards, clients or publication credits.',
    ],

    forbiddenAssumptions: [
      'Do not fabricate testimonials.',
      'Do not claim availability, location or pricing unless supplied.',
    ],
  },

  {
    schemaVersion:
      NICHE_PACK_SCHEMA_VERSION,

    id:
      'dental',

    domain:
      'dental',

    aliases: [
      'dental',
      'dentist',
      'dentistry',
      'dental clinic',
      'orthodontist',
    ],

    contentRequirements: [
      'Services or treatment categories',
      'Clinic contact information',
      'Appointment call to action when booking is requested',
      'Practice/team information when supplied',
    ],

    uxGuidance: [
      'Use clear service navigation and high-visibility appointment actions.',
      'Mobile contact and booking actions should remain easy to reach.',
    ],

    trustRequirements: [
      'Medical or treatment claims must not be invented.',
      'Do not invent doctor credentials or accreditations.',
    ],

    forbiddenAssumptions: [
      'Do not fabricate treatment prices.',
      'Do not claim emergency availability unless supplied.',
    ],
  },

  {
    schemaVersion:
      NICHE_PACK_SCHEMA_VERSION,

    id:
      'restaurant',

    domain:
      'restaurant',

    aliases: [
      'restaurant',
      'cafe',
      'coffee shop',
      'bakery',
      'food business',
    ],

    contentRequirements: [
      'Menu or offering overview',
      'Location/contact path',
      'Opening-hours area when information is supplied',
      'Reservation action when reservations are requested',
    ],

    uxGuidance: [
      'Prioritize menu discovery, location and reservation intent.',
      'Keep essential information accessible without deep navigation.',
    ],

    trustRequirements: [
      'Do not invent ratings, awards or review quotes.',
    ],

    forbiddenAssumptions: [
      'Do not fabricate menu prices or opening hours.',
    ],
  },

  {
    schemaVersion:
      NICHE_PACK_SCHEMA_VERSION,

    id:
      'agency',

    domain:
      'agency',

    aliases: [
      'agency',
      'creative agency',
      'marketing agency',
      'digital agency',
      'studio',
    ],

    contentRequirements: [
      'Services',
      'Selected work or case-study area',
      'Positioning/value proposition',
      'Contact or lead-generation action',
    ],

    uxGuidance: [
      'Show proof of capability before long company descriptions.',
      'Primary conversion action should remain visible and specific.',
    ],

    trustRequirements: [
      'Do not invent client logos, revenue numbers or performance results.',
    ],

    forbiddenAssumptions: [
      'Do not fabricate case-study metrics.',
    ],
  },

  {
    schemaVersion:
      NICHE_PACK_SCHEMA_VERSION,

    id:
      'saas',

    domain:
      'saas',

    aliases: [
      'saas',
      'software platform',
      'software product',
      'b2b software',
    ],

    contentRequirements: [
      'Clear primary workflow',
      'Feature/value explanation',
      'Empty and error states for application surfaces',
      'Account flow only when authentication is actually required',
    ],

    uxGuidance: [
      'Optimize for task completion rather than decorative landing-page sections.',
      'Navigation should reflect real product objects and workflows.',
    ],

    trustRequirements: [
      'Mock data must not be presented as live customer data.',
    ],

    forbiddenAssumptions: [
      'Do not invent paid plans or payment integration unless requested.',
    ],
  },

  {
    schemaVersion:
      NICHE_PACK_SCHEMA_VERSION,

    id:
      'ecommerce',

    domain:
      'ecommerce',

    aliases: [
      'ecommerce',
      'e-commerce',
      'online store',
      'storefront',
      'shop',
    ],

    contentRequirements: [
      'Product catalog',
      'Product detail experience',
      'Cart interaction',
      'Checkout path only to the level actually integrated',
    ],

    uxGuidance: [
      'Product discovery and purchase intent outrank decorative sections.',
      'Cart state must stay visible and understandable.',
    ],

    trustRequirements: [
      'Do not present test payment flow as production payment processing.',
    ],

    forbiddenAssumptions: [
      'Do not invent stock levels, shipping times or discounts.',
    ],
  },
];

function normalize(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /[_-]+/g,
      ' ',
    )
    .replace(
      /\s+/g,
      ' ',
    );
}

export function nichePacks():
  readonly NichePack[] {
  return PACKS;
}

export function selectNichePack(
  input: {
    text:
      string;

    classification:
      ProductClassification | null;
  },
): NichePack | null {
  const domain =
    input.classification
      ?.domain
      ?.trim();

  if (
    domain
  ) {
    const exact =
      PACKS.find(
        (
          pack,
        ) =>
          normalize(
            pack.domain,
          ) ===
            normalize(
              domain,
            ) ||
          pack.aliases.some(
            (
              alias,
            ) =>
              normalize(
                alias,
              ) ===
              normalize(
                domain,
              ),
          ),
      );

    if (
      exact
    ) {
      return exact;
    }
  }

  const text =
    normalize(
      input.text,
    );

  return (
    PACKS.find(
      (
        pack,
      ) =>
        pack.aliases.some(
          (
            alias,
          ) =>
            text.includes(
              normalize(
                alias,
              ),
            ),
        ),
    ) ??
    null
  );
}
