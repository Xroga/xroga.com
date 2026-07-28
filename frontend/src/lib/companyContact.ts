/**
 * Public company contact — required for Lemon Squeezy / MoR website compliance.
 * Override the phone with NEXT_PUBLIC_SUPPORT_PHONE in Vercel if it changes.
 */
const phoneDisplay =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim()) ||
  '+92 321 7831302';

export const COMPANY_CONTACT = {
  brand: 'Xroga AI',
  legalName: 'Xroga AI',
  email: 'hello@xroga.com',
  /** Visible support phone (Paddle requires email + phone on Contact). */
  phoneDisplay,
  phoneTel: phoneDisplay.replace(/[^\d+]/g, ''),
  region: 'Pakistan',
  productDescription:
    'Xroga AI works in connected repositories, validates applicable changes, and publishes through accounts the operator authorises. One plan is billed by Lemon Squeezy in complete 30-day cycles with capacity pacing.',
};
