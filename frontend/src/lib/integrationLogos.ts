/** Favicon / brand logo URLs for integrations — prefer local assets so logos never fail to load */
export const INTEGRATION_LOGOS: Record<string, string> = {
  github: '/brand/logos/github.svg',
  gitlab: '/brand/logos/gitlab.svg',
  vercel: '/brand/logos/vercel.svg',
  netlify: 'https://cdn.simpleicons.org/netlify/00C7B7',
  railway: 'https://cdn.simpleicons.org/railway/0B0D0E',
  aws: 'https://cdn.simpleicons.org/amazonaws/FF9900',
  digitalocean: 'https://cdn.simpleicons.org/digitalocean/0080FF',
  heroku: 'https://cdn.simpleicons.org/heroku/430098',
  render: 'https://cdn.simpleicons.org/render/000000',
  supabase: '/brand/logos/supabase.svg',
  upstash_redis: 'https://cdn.simpleicons.org/upstash/00E9A3',
  stripe: 'https://cdn.simpleicons.org/stripe/635BFF',
  paypal: 'https://cdn.simpleicons.org/paypal/00457C',
  lemon_squeezy: 'https://cdn.simpleicons.org/lemonsqueezy/FFC233',
  shopify: 'https://cdn.simpleicons.org/shopify/7AB55C',
  openai: '/brand/logos/openai.svg',
  anthropic: '/brand/logos/anthropic.svg',
  gemini: 'https://cdn.simpleicons.org/googlegemini/8E75B2',
  slack: 'https://cdn.simpleicons.org/slack/4A154B',
  discord: 'https://cdn.simpleicons.org/discord/5865F2',
  notion: 'https://cdn.simpleicons.org/notion/000000',
  jira: 'https://cdn.simpleicons.org/jira/0052CC',
  linear: 'https://cdn.simpleicons.org/linear/5E6AD2',
  asana: 'https://cdn.simpleicons.org/asana/F06A6A',
  trello: 'https://cdn.simpleicons.org/trello/0052CC',
  figma: 'https://cdn.simpleicons.org/figma/F24E1E',
  docker_hub: 'https://cdn.simpleicons.org/docker/2496ED',
  postman: 'https://cdn.simpleicons.org/postman/FF6C37',
  zapier: 'https://cdn.simpleicons.org/zapier/FF4A00',
  auth0: 'https://cdn.simpleicons.org/auth0/EB5424',
  datadog: 'https://cdn.simpleicons.org/datadog/632CA6',
  cloudflare_r2: 'https://cdn.simpleicons.org/cloudflare/F38020',
};

const DOMAIN_GUESS: Record<string, string> = {
  jira: 'atlassian.com',
  linear: 'linear.app',
  asana: 'asana.com',
  trello: 'trello.com',
  notion: 'notion.so',
  figma: 'figma.com',
  miro: 'miro.com',
  airtable: 'airtable.com',
  salesforce: 'salesforce.com',
  hubspot: 'hubspot.com',
  zendesk: 'zendesk.com',
  intercom: 'intercom.com',
  docusign: 'docusign.com',
  quickbooks_online: 'quickbooks.intuit.com',
  xero: 'xero.com',
  plaid: 'plaid.com',
  twilio_standalone: 'twilio.com',
  mongodb_atlas: 'mongodb.com',
  snowflake: 'snowflake.com',
  databricks: 'databricks.com',
  algolia: 'algolia.com',
  bitly: 'bitly.com',
  canva: 'canva.com',
  spotify: 'spotify.com',
};

function slugToDomain(id: string, name: string): string | null {
  if (DOMAIN_GUESS[id]) return DOMAIN_GUESS[id];
  const clean = name
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase();
  if (!clean || clean.length < 2) return null;
  return `${clean}.com`;
}

export function getIntegrationLogo(id: string, name?: string): string | undefined {
  if (INTEGRATION_LOGOS[id]) return INTEGRATION_LOGOS[id];
  const domain = slugToDomain(id, name ?? id);
  if (domain) return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  return undefined;
}
