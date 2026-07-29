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
    'Xroga AI works in connected repositories, validates changes, and publishes through accounts you authorise, with one 30-day plan billed by Lemon Squeezy.',
};
