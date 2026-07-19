/**
 * Public company contact — required for Paddle website compliance.
 * Override the phone with NEXT_PUBLIC_SUPPORT_PHONE in Vercel if it changes.
 */
const phoneDisplay =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim()) ||
  '+92 300 8471947';

export const COMPANY_CONTACT = {
  brand: 'Xroga AI',
  legalName: 'Xroga AI',
  email: 'hello@xroga.com',
  /** Visible support phone (Paddle requires email + phone on Contact). */
  phoneDisplay,
  phoneTel: phoneDisplay.replace(/[^\d+]/g, ''),
  region: 'Pakistan',
  productDescription:
    'Xroga AI is the #1 coding agent for developers and non-developers. It builds web apps from plain language, pushes working code to your GitHub, deploys on your Vercel, syncs your API keys securely into Vercel env, and updates the same repo (edit/delete) without starting over. No coding knowledge required to start. Subscriptions are billed monthly via Paddle with AI token capacity by plan.',
};
