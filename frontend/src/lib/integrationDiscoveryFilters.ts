/**
 * Small public directory filters shared by server data and client-side discovery.
 * Keep heavyweight provider/canonical catalog imports out of browser bundles.
 */
import type { PublicIntegrationCard } from './publicIntegrationsDirectory';

export const PUBLIC_INTEGRATION_FEATURED_IDS = [
  'github', 'slack', 'shopify', 'notion', 'stripe', 'supabase',
  'vercel', 'openai', 'gmail', 'hubspot', 'cloudflare', 'google_calendar',
] as const;

const crmMatch = /(?:^|[^a-z])(crm|salesforce|hubspot|pipedrive|salesloft|zoho|freshsales|close|insightly|copper|keap|highlevel)(?:$|[^a-z])/i;
const humanResourcesMatch = /bamboohr|workday|gusto|rippling|greenhouse|recruit|payroll|employee|human.?resources|deel|lever|peopleforce|talent/i;
const languageMatch = /deepl|translat|language|speech.?to.?text|text.?to.?speech|whisper|transcrib|elevenlabs|linguistic/i;

export function matchesPublicIntegrationCategory(card: PublicIntegrationCard, categoryId: string): boolean {
  if (categoryId === 'all') return true;
  if (categoryId.startsWith('source:')) return card.sourceCategory === categoryId.slice(7);
  if (categoryId === 'focus:crm') return crmMatch.test(card.name + ' ' + card.searchTerms);
  if (categoryId === 'focus:hr') return humanResourcesMatch.test(card.name + ' ' + card.searchTerms);
  if (categoryId === 'focus:language') return languageMatch.test(card.name + ' ' + card.searchTerms);
  return false;
}
