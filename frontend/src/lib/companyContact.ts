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
    'Xroga AI is a paid AI Swarm platform that turns natural-language prompts into real software: Converter writes a build brief, the multi-model swarm codes and debugs, then pushes to your GitHub and deploys live on Vercel with your domain. Subscriptions are billed monthly via Paddle and include AI token/credit capacity by plan.',
};
