export type PlanTier =
  | 'free'
  | 'spark';


export interface GalacticPlan {
  tier:
    PlanTier;

  name:
    string;

  priceLabel:
    string;

  usdPrice:
    number;

  productId:
    string;

  /**
   * Internal compatibility accounting.
   * Never display this as a guaranteed
   * customer token allowance.
   */
  aiTokens:
    number;

  tokensLabel:
    string;

  aiTokensLabel:
    string;

  xrgBonus:
    number;

  xrgLabel:
    string;

  /**
   * Internal request limit only.
   * Never render in pricing copy.
   */
  concurrency:
    number;

  highlight?:
    boolean;

  tagline?:
    string;
}


/**
 * Internal compatibility values.
 * Customer copy never promises
 * a fixed token total.
 */
export const SPARK_TOKEN_POOL =
  6_172_222;

export const FREE_TOKEN_POOL =
  617_222;


/**
 * Public plans.
 */
export const GALACTIC_PLANS:
  GalacticPlan[] = [

  {
    tier:
      'free',

    name:
      'Free',

    priceLabel:
      '$0',

    usdPrice:
      0,

    productId:
      '',

    aiTokens:
      FREE_TOKEN_POOL,

    tokensLabel:
      'No card required',

    aiTokensLabel:
      'Included monthly AI usage',

    xrgBonus:
      0,

    xrgLabel:
      'Start building with Xroga for free',

    // Internal only.
    concurrency:
      1,

    tagline:
      'Everything you need to start building',
  },


  {
    tier:
      'spark',

    name:
      'Xroga Pro',

    priceLabel:
      '$25',

    usdPrice:
      25,

    productId:
      'plan_hlV1A10I5QfSP',

    aiTokens:
      SPARK_TOKEN_POOL,

    tokensLabel:
      'Higher monthly AI capacity',

    aiTokensLabel:
      'Full Access pacing',

    xrgBonus:
      0,

    xrgLabel:
      'For active builders who need more power',

    // Internal only.
    concurrency:
      3,

    highlight:
      true,

    tagline:
      'Higher capacity and faster access',
  },
];


export const COMING_SOON_PLANS:
  Array<{
    name: string;
    price: string;
    label: string;
  }> = [];


export function getPlanFeatures(
  plan:
    GalacticPlan,

  _featureCount:
    number,
): string[] {

  if (
    plan.tier ===
    'free'
  ) {
    return [
      'Included monthly AI usage',
      'Core AI building workspace',
      'Repository-aware edits',
      'Preview and verification',
      'No card required',
    ];
  }


  return [
    'Higher monthly AI capacity',
    'Full Xroga building workspace',
    'Full Access pacing',
    'Production-focused workflows',
    'Priority capacity for active builders',
  ];
}


export {
  LOGO_URL,
  DESKTOP_BG,
  MOBILE_BG,
} from '@/lib/theme';
