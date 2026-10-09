import { z } from 'zod';

const shortText = z.string().trim().min(1).max(500);
const source = z.object({
  title: shortText,
  url: z.string().url().max(2048).refine((value) => safeRichSourceUrl(value) !== null, 'Source must be a safe web URL.'),
  provider: shortText.optional(),
  observedAt: z.string().datetime().optional(),
});
const money = z.object({
  amount: z.number().finite().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  basis: z.enum(['one-way', 'round-trip', 'per-night', 'total-stay', 'per-item', 'per-person', 'per-day', 'monthly', 'total', 'from']),
  taxesIncluded: z.boolean().optional(),
  feesIncluded: z.boolean().optional(),
  note: z.string().max(300).optional(),
});
const media = z.object({
  url: z.string().max(2048),
  alt: shortText,
  attribution: z.string().max(300).optional(),
  rights: z.enum(['owned', 'licensed', 'provider-authorized', 'demo-generated']),
});
const leg = z.object({
  from: shortText, to: shortText,
  departureLocal: z.string().max(80).optional(), arrivalLocal: z.string().max(80).optional(),
  departureTimeZone: z.string().max(80).optional(), arrivalTimeZone: z.string().max(80).optional(),
  provider: z.string().max(120).optional(), service: z.string().max(80).optional(),
  duration: z.string().max(80).optional(),
});

export const xrogaRichResultSchema = z.object({
  id: z.string().trim().min(1).max(100),
  domain: z.enum(['transport', 'accommodation', 'shopping', 'reservation', 'vehicle', 'travel', 'business', 'other']),
  kind: z.string().trim().min(1).max(80),
  transportMode: z.enum(['flight', 'train', 'bus', 'ferry', 'transfer']).optional(),
  title: shortText,
  summary: z.string().max(1200).optional(),
  provider: z.string().max(160).optional(),
  status: z.enum(['search-result', 'offer', 'availability-checked', 'confirmed', 'unavailable', 'expired', 'demo']),
  demo: z.boolean().optional(),
  source: source.optional(),
  price: money.optional(),
  images: z.array(media).max(5).optional(),
  facts: z.array(z.object({ label: shortText, value: shortText })).max(12).optional(),
  route: z.array(leg).max(8).optional(),
  coupon: z.object({ code: shortText, eligibility: z.string().max(300).optional(), expiresAt: z.string().datetime().optional() }).optional(),
  availabilityEvidence: z.string().max(500).optional(),
  confirmationReference: z.string().max(120).optional(),
  limitations: z.string().max(600).optional(),
}).superRefine((item, ctx) => {
  if (item.status !== 'demo' && !item.demo && !item.source) ctx.addIssue({ code: 'custom', message: 'Non-demo results require a source.' });
  if (item.status === 'availability-checked' && !item.availabilityEvidence) ctx.addIssue({ code: 'custom', message: 'Checked availability requires evidence.' });
  if (item.status === 'confirmed' && (!item.confirmationReference || !item.availabilityEvidence)) ctx.addIssue({ code: 'custom', message: 'Confirmation requires a receipt reference and evidence.' });
});

export type XrogaRichResult = z.infer<typeof xrogaRichResultSchema>;

/** Only same-origin demo assets or explicitly approved remote hosts can enter Next/Image. */
const APPROVED_IMAGE_HOSTS = new Set<string>(); // Add only after provider rights and host review.
export function safeRichImageUrl(url: string, rights: NonNullable<XrogaRichResult['images']>[number]['rights'], isDemo = false): string | null {
  if (isDemo && url.startsWith('/os-preview/rich-results/') && rights === 'demo-generated' && /^\/os-preview\/rich-results\/[a-z0-9-]+\.webp$/.test(url)) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && APPROVED_IMAGE_HOSTS.has(parsed.hostname) && rights !== 'demo-generated' ? parsed.href : null;
  } catch { return null; }
}

export function safeRichSourceUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && !parsed.username && !parsed.password ? parsed.href : null;
  } catch { return null; }
}

export function formatRichPrice(price: XrogaRichResult['price']): string | null {
  if (!price) return null;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency, maximumFractionDigits: 2 }).format(price.amount); }
  catch { return `${price.amount} ${price.currency}`; }
}
