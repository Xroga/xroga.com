export type IntegrationStatus = 'connected' | 'not_connected';

export interface Integration {
  id: string;
  name: string;
  category: string;
  status: IntegrationStatus;
  description?: string;
  oauth?: boolean;
}

export const INTEGRATION_CATEGORIES = [
  'Developer & Code',
  'Social Media & Communication',
  'E-commerce & Payments',
  'AI & Media APIs',
  'Automation & Scraping',
  'Monitoring & Analytics',
  'Marketing & Email',
  'File & Storage',
] as const;

export const INTEGRATIONS: Integration[] = [
  // Developer & Code
  { id: 'github', name: 'GitHub', category: 'Developer & Code', status: 'not_connected', oauth: true },
  { id: 'gitlab', name: 'GitLab', category: 'Developer & Code', status: 'not_connected', oauth: true },
  { id: 'vercel', name: 'Vercel', category: 'Developer & Code', status: 'not_connected', oauth: true },
  { id: 'netlify', name: 'Netlify', category: 'Developer & Code', status: 'not_connected', oauth: true },
  { id: 'railway', name: 'Railway', category: 'Developer & Code', status: 'not_connected', oauth: true },
  { id: 'aws', name: 'AWS', category: 'Developer & Code', status: 'not_connected' },
  { id: 'digitalocean', name: 'DigitalOcean', category: 'Developer & Code', status: 'not_connected', oauth: true },
  { id: 'heroku', name: 'Heroku', category: 'Developer & Code', status: 'not_connected', oauth: true },
  { id: 'render', name: 'Render', category: 'Developer & Code', status: 'not_connected', oauth: true },
  { id: 'supabase', name: 'Supabase', category: 'Developer & Code', status: 'connected', description: 'Database, Auth, RLS' },
  { id: 'upstash', name: 'Upstash Redis', category: 'Developer & Code', status: 'connected', description: 'Task queue & caching' },
  // Social
  { id: 'twitter', name: 'Twitter/X', category: 'Social Media & Communication', status: 'not_connected', oauth: true },
  { id: 'linkedin', name: 'LinkedIn', category: 'Social Media & Communication', status: 'not_connected', oauth: true },
  { id: 'instagram', name: 'Instagram', category: 'Social Media & Communication', status: 'not_connected', oauth: true },
  { id: 'facebook', name: 'Facebook', category: 'Social Media & Communication', status: 'not_connected', oauth: true },
  { id: 'youtube', name: 'YouTube', category: 'Social Media & Communication', status: 'not_connected', oauth: true },
  { id: 'tiktok', name: 'TikTok', category: 'Social Media & Communication', status: 'not_connected', oauth: true },
  { id: 'gmail', name: 'Gmail / Google Calendar', category: 'Social Media & Communication', status: 'not_connected', oauth: true },
  { id: 'outlook', name: 'Outlook', category: 'Social Media & Communication', status: 'not_connected', oauth: true },
  { id: 'slack', name: 'Slack', category: 'Social Media & Communication', status: 'not_connected', oauth: true },
  { id: 'discord', name: 'Discord', category: 'Social Media & Communication', status: 'not_connected', oauth: true },
  { id: 'telegram', name: 'Telegram', category: 'Social Media & Communication', status: 'not_connected' },
  { id: 'whatsapp', name: 'WhatsApp Business', category: 'Social Media & Communication', status: 'not_connected' },
  // E-commerce
  { id: 'stripe', name: 'Stripe', category: 'E-commerce & Payments', status: 'not_connected', oauth: true },
  { id: 'paypal', name: 'PayPal', category: 'E-commerce & Payments', status: 'not_connected', oauth: true },
  { id: 'paddle', name: 'Paddle', category: 'E-commerce & Payments', status: 'connected', description: 'Subscription billing' },
  { id: 'lemonsqueezy', name: 'Lemon Squeezy', category: 'E-commerce & Payments', status: 'not_connected', oauth: true },
  { id: 'binance', name: 'Binance', category: 'E-commerce & Payments', status: 'not_connected' },
  { id: 'coinbase', name: 'Coinbase', category: 'E-commerce & Payments', status: 'not_connected', oauth: true },
  { id: 'alpaca', name: 'Alpaca', category: 'E-commerce & Payments', status: 'not_connected', oauth: true },
  { id: 'shopify', name: 'Shopify', category: 'E-commerce & Payments', status: 'not_connected', oauth: true },
  { id: 'woocommerce', name: 'WooCommerce', category: 'E-commerce & Payments', status: 'not_connected', oauth: true },
  // AI & Media
  { id: 'replicate', name: 'Replicate', category: 'AI & Media APIs', status: 'not_connected' },
  { id: 'runway', name: 'Runway', category: 'AI & Media APIs', status: 'not_connected' },
  { id: 'elevenlabs', name: 'ElevenLabs', category: 'AI & Media APIs', status: 'not_connected' },
  { id: 'deepseek', name: 'DeepSeek', category: 'AI & Media APIs', status: 'not_connected' },
  { id: 'anthropic', name: 'Anthropic Claude', category: 'AI & Media APIs', status: 'not_connected' },
  { id: 'openai', name: 'OpenAI', category: 'AI & Media APIs', status: 'not_connected' },
  { id: 'gemini', name: 'Google Gemini', category: 'AI & Media APIs', status: 'not_connected' },
  { id: 'groq', name: 'Groq', category: 'AI & Media APIs', status: 'not_connected' },
  { id: 'huggingface', name: 'Hugging Face', category: 'AI & Media APIs', status: 'not_connected', oauth: true },
  { id: 'fal', name: 'Fal.ai', category: 'AI & Media APIs', status: 'not_connected' },
  { id: 'luma', name: 'Luma', category: 'AI & Media APIs', status: 'not_connected' },
  { id: 'tripo', name: 'Tripo', category: 'AI & Media APIs', status: 'not_connected' },
  // Automation
  { id: 'apify', name: 'Apify', category: 'Automation & Scraping', status: 'not_connected' },
  { id: 'browserless', name: 'Browserless', category: 'Automation & Scraping', status: 'not_connected' },
  { id: 'firecrawl', name: 'Firecrawl', category: 'Automation & Scraping', status: 'not_connected' },
  { id: 'llamaparse', name: 'LlamaParse', category: 'Automation & Scraping', status: 'not_connected' },
  { id: 'exa', name: 'Exa.ai', category: 'Automation & Scraping', status: 'not_connected' },
  { id: 'tavily', name: 'Tavily', category: 'Automation & Scraping', status: 'not_connected' },
  { id: 'brightdata', name: 'Bright Data', category: 'Automation & Scraping', status: 'not_connected' },
  { id: 'newsapi', name: 'NewsAPI', category: 'Automation & Scraping', status: 'not_connected' },
  // Monitoring
  { id: 'sentry', name: 'Sentry', category: 'Monitoring & Analytics', status: 'not_connected', oauth: true },
  { id: 'logrocket', name: 'LogRocket', category: 'Monitoring & Analytics', status: 'not_connected' },
  { id: 'posthog', name: 'PostHog', category: 'Monitoring & Analytics', status: 'not_connected' },
  { id: 'mixpanel', name: 'Mixpanel', category: 'Monitoring & Analytics', status: 'not_connected' },
  { id: 'ga', name: 'Google Analytics', category: 'Monitoring & Analytics', status: 'not_connected', oauth: true },
  { id: 'segment', name: 'Segment', category: 'Monitoring & Analytics', status: 'not_connected' },
  // Marketing
  { id: 'sendgrid', name: 'SendGrid', category: 'Marketing & Email', status: 'not_connected' },
  { id: 'resend', name: 'Resend', category: 'Marketing & Email', status: 'not_connected' },
  { id: 'mailchimp', name: 'Mailchimp', category: 'Marketing & Email', status: 'not_connected', oauth: true },
  { id: 'convertkit', name: 'ConvertKit', category: 'Marketing & Email', status: 'not_connected', oauth: true },
  { id: 'hubspot', name: 'HubSpot', category: 'Marketing & Email', status: 'not_connected', oauth: true },
  // Storage
  { id: 'r2', name: 'Cloudflare R2', category: 'File & Storage', status: 'connected', description: 'Object storage' },
  { id: 's3', name: 'AWS S3', category: 'File & Storage', status: 'not_connected' },
  { id: 'gcs', name: 'Google Cloud Storage', category: 'File & Storage', status: 'not_connected' },
  { id: 'dropbox', name: 'Dropbox', category: 'File & Storage', status: 'not_connected', oauth: true },
  { id: 'onedrive', name: 'OneDrive', category: 'File & Storage', status: 'not_connected', oauth: true },
];
