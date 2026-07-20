#!/usr/bin/env node
/**
 * Generates frontend/src/lib/integrations-catalog.ts from structured category data.
 * Run: node frontend/scripts/generate-integrations-catalog.mjs
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {Record<string, string[]>} */
const CATALOG = {
  'Developer & Code': [
    'GitHub', 'GitLab', 'Vercel', 'Netlify', 'Railway', 'AWS', 'DigitalOcean', 'Heroku', 'Render', 'Supabase', 'Upstash Redis',
    'CircleCI', 'Buildkite', 'Jenkins (CloudBees)', 'Fly.io', 'Coolify', 'Appwrite', 'QStash', 'Tinybird', 'ClickHouse',
    'SonarQube', 'Snyk', 'Dependabot', 'LaunchDarkly', 'Docker Hub', 'GHCR', 'JFrog', 'Sonatype Nexus', 'npm', 'PyPI', 'NuGet',
    'Hashnode', 'DEV.to', 'Medium', 'RapidAPI', 'Postman', 'Insomnia', 'Hoppscotch', 'Bruno', 'SwaggerHub', 'ReadMe', 'Stoplight',
    'Mockoon', 'WireMock', 'GitHub Copilot', 'Cursor', 'Replit', 'Lovable', 'Bolt.new', 'Vercel v0', 'Magic Patterns', 'Databutton', 'Aider', 'Composio',
  ],
  'Gaming & Consoles': [
    'Xbox (Series X/S & One)', 'PlayStation (PS5 & PS4)', 'Steam / PC', 'Nintendo Switch', 'Epic Games', 'Unity Gaming Services',
    'Roblox', 'itch.io', 'Google Play Store', 'Microsoft Store', 'Snap Store', 'Flathub', 'Unity Cloud / DevOps', 'Unreal Engine (Horde)',
    'Roblox Open Cloud', 'Fortnite Creative', 'Decentraland', 'VRChat', 'Sportradar', 'Genius Sports', 'Bet365 API', 'Scientific Games (SG Digital)',
  ],
  'Social Media & Communication': [
    'Twitter/X', 'LinkedIn', 'Instagram', 'Facebook', 'YouTube', 'TikTok', 'Gmail / Google Calendar', 'Outlook', 'Slack', 'Discord',
    'Telegram', 'WhatsApp Business', 'Pinterest', 'Zoom', 'Google Meet', 'Signal', 'Threads API', 'Meta Business Suite', 'Meta Pixel (Conv. API)',
  ],
  'E-commerce & Payments': [
    'Stripe', 'PayPal', 'Paddle', 'Lemon Squeezy', 'Binance', 'Coinbase', 'Alpaca', 'Shopify', 'WooCommerce', 'Braintree', 'Adyen',
    'Chargebee', 'Recurly', 'Alchemy', 'Moralis', 'BigCommerce', 'Magento (Adobe Commerce)', 'Printful', 'Printify', 'Gelato', 'Redbubble',
    'Teespring (Spring)', 'Gooten', 'Lulu Direct', 'SPOD', 'DSers', 'CJ Dropshipping', 'Zendrop', 'Spocket', 'Modalyst', 'AutoDS',
    'Square', 'Toast', 'Clover', 'Rakuten Advertising', 'ShareASale', 'Impact', 'Grin', 'Aspire', 'Commission Junction (CJ)', 'FlexOffers', 'Pepperjam',
    'Cin7', 'Brightpearl', 'Skubana (Extensiv)', 'HalalWatch API', 'Alif API', 'Salaam Gateway API',
  ],
  'AI & Media APIs': [
    'Replicate', 'Runway', 'ElevenLabs', 'DeepSeek', 'Anthropic Claude', 'OpenAI', 'Google Gemini', 'Groq', 'Hugging Face', 'Fal.ai',
    'Luma', 'Tripo', 'Midjourney', 'Stability AI', 'Perplexity', 'Cohere', 'Mistral AI', 'AssemblyAI', 'Whisper', 'LangChain', 'LlamaIndex',
    'DeepL / Grammarly', 'Brave Search API', 'You.com API',
  ],
  'Automation & Scraping': [
    'Apify', 'Browserless', 'Firecrawl', 'LlamaParse', 'Exa.ai', 'Tavily', 'Bright Data', 'NewsAPI', 'ScrapingBee', 'ScrapingAnt', 'Zyte',
    'Puppeteer (service)', 'Playwright (service)', 'Oxylabs', 'Smartproxy', 'Zapier', 'Make (Integromat)', 'n8n', 'Pipedream', 'Boomi', 'Workato', 'MuleSoft (Anypoint)',
  ],
  'Monitoring & Analytics': [
    'Sentry', 'LogRocket', 'PostHog', 'Mixpanel', 'Google Analytics', 'Segment', 'Amplitude', 'Heap', 'FullStory', 'Hotjar', 'Metabase', 'Looker',
    'New Relic', 'Datadog', 'Bugsnag', 'Prometheus', 'Grafana', 'Dynatrace', 'Tableau', 'Power BI', 'Ahrefs', 'SEMrush', 'Moz',
    'Integral Ad Science (IAS)', 'DoubleVerify', 'Google Ads API', 'Microsoft Advertising', 'LinkedIn Ads', 'Pinterest Ads', 'Snapchat Ads', 'Reddit Ads', 'TikTok Ads',
  ],
  'Marketing & Email': [
    'SendGrid', 'Resend', 'Mailchimp', 'ConvertKit', 'HubSpot', 'Klaviyo', 'ActiveCampaign', 'Drip', 'Salesforce', 'Zoho CRM',
    'Twilio (standalone)', 'Postmark', 'MessageBird', 'Canva', 'Adobe Creative Cloud API', 'Cloudinary', 'Bynder', 'Widen', 'Bitly', 'Rebrandly', 'Dub.co',
  ],
  'File & Storage': [
    'Cloudflare R2', 'AWS S3', 'Google Cloud Storage', 'Dropbox', 'OneDrive', 'Backblaze B2', 'Wasabi', 'Box', 'SharePoint',
    'CloudConvert', 'PDF.co',
  ],
  'Cloud & Infrastructure': [
    'GCP', 'Azure', 'Cloudflare (Workers/DNS)', 'Hetzner', 'Vultr', 'Terraform Cloud (HashiCorp)', 'Ansible (AWX)', 'LocalStack',
    'Teleport', 'Tailscale', 'ZeroTier', 'ngrok', 'Cloudflare Tunnel', 'Cloud Shells (bundle)', 'Traefik Hub', 'Nginx (NMS / F5 API)', 'Caddy Server (API)',
    'Kong', 'Tyk', 'Hasura', 'Gravitee', 'Fastly', 'Akamai (Edge & Security)', 'Kentik', 'ThousandEyes (Cisco)', 'TeleGeography', 'RIPE NCC / ARIN APIs',
    'ICANN (Zone Data)', 'PeeringDB', 'NetBox', 'OCI (Oracle Cloud)',
  ],
  'Databases & Data Stores': [
    'MongoDB Atlas', 'Neon', 'PlanetScale', 'Redis Enterprise', 'Confluent (Kafka)', 'Snowflake', 'Databricks', 'Fivetran', 'Airbyte', 'Stitch', 'dbt (Data Build Tool)',
    'Algolia', 'Meilisearch', 'Typesense', 'Elastic (ELK)',
  ],
  'Project Management & Collaboration': [
    'Jira', 'Linear', 'Asana', 'Trello', 'Notion', 'Figma', 'Miro', 'Airtable', 'Atlassian Confluence', 'Atlassian Bitbucket', 'Smartsheet (Government Edition)',
    'StudioBinder', 'FilmTrack', 'ShotGrid (Autodesk)', 'SyncSketch', 'Scenechronize',
  ],
  'Identity & Security': [
    'Auth0', 'Okta', 'OneLogin', 'Clerk', 'HashiCorp Vault', 'Vanta', 'Drata', 'Secureframe', 'Cloudflare Turnstile', 'hCaptcha',
    'Mandiant (Google Cloud)', 'Recorded Future', 'CrowdStrike Falcon', 'Zscaler (Zero Trust)', 'Palo Alto Networks (Cortex XSOAR)', 'Anomali / ThreatConnect',
    'CISA (Known Exploited Vulnerabilities)', 'Shodan (Enterprise)', 'VirusTotal', 'OneTrust', 'Osano', 'ScamAdviser',
    'Sift', 'Riskified', 'Forter', 'Signifyd', 'Onfido', 'Persona', 'Jumio', 'Trulioo', 'Veriff', 'Chainalysis', 'Elliptic',
    'Kisi', 'Openpath', 'Brivo',
  ],
  'CMS & Headless Content': [
    'Contentful', 'Sanity', 'WordPress', 'Storyblok', 'Wix', 'Squarespace', 'Bubble', 'Glide',
  ],
  'Finance & Banking': [
    'QuickBooks Online', 'Xero', 'FreshBooks', 'Plaid', 'Yapily', 'Tink', 'Klarna', 'Affirm', 'Afterpay (Clearpay)', 'Chargeback911', 'Ethoca / Verifi',
    'Dun & Bradstreet (D&B)', 'Experian Business API', 'Creditsafe', 'Expensify', 'Ramp', 'Brex', 'Marqeta', 'Lithic', 'Unit',
    'Arab Financial Services API', 'Bank of Palestine API', 'Liwwa API', 'SAMA (Saudi Central Bank) APIs', 'Egypt Meeza', 'RENTAS (Malaysia)', 'BI-Fast (Bank Indonesia)', 'Buna (Arab Monetary Fund)',
    'IFS (Islamic Financial System)', 'Sukuk Gateway (Bloomberg)', 'Thomson Reuters EIKON (Islamic Finance)', 'Wahed Invest', 'HDFC (Islamic Window)', 'La Riba / Ameen Housing', 'Al Baraka (Digital Banking)',
    'Akhuwat', 'Kiva (Interest-Free)', 'Ethis', 'NamaFin', 'Amana Funds', 'Yaqeen Fund / QardHasan Foundation', 'Zoya API',
  ],
  'Shipping & Logistics': [
    'ShipStation', 'Shippo', 'Easyship', 'UPS API', 'FedEx API', 'USPS API', 'Flexport', 'Freightos', 'MarineTraffic', 'VesselFinder',
    'Port of Rotterdam API', 'Lufthansa API', 'Mawani (Saudi Ports)', 'DP World (CARGOES)', 'Pakistan Single Window', 'KADIN (Indonesia)',
    'UPU API', 'Royal Mail (UK)', 'La Poste (France)', 'Deutsche Post DHL', 'Pos Malaysia / Pos Indonesia', 'Saudi Post (SPL)',
    'Google Maps Platform', 'Mapbox', 'Here Technologies', 'MaxMind (GeoIP)', 'IPinfo', 'Airmap (Drone)',
  ],
  'Customer Support & HR': [
    'Zendesk', 'Intercom', 'DocuSign', 'HelloSign (Dropbox Sign)', 'Gusto', 'BambooHR', 'Rippling', 'RingCentral', 'Aircall', 'Zoom Phone', 'Twilio Flex',
    'Clio', 'LexisNexis', 'Sure (Insurance API)', 'Bold Penguin', 'Zocdoc', 'GoodRx API',
  ],
  'Education & Learning': [
    'Canvas (Instructure)', 'Moodle', 'Blackboard', 'Udemy Business', 'Coursera for Business', 'ApplyBoard', 'Studyportals', 'Envoy Global',
    'Boundless Immigration', 'GradRight', 'MPOWER Financing', 'King Salman Global Academy (Arabic NLP)', 'Qatar Foundation / Al Jazeera Learning', 'MINDS (Malaysia)',
    'Tamer Institute API', 'ArchNet API (Islamic Architecture)', 'Bushra API (Islamic Art)',
  ],
  'Data Platforms & CDP': [
    'Tealium', 'BlueConic', 'RudderStack', 'Habu', 'InfoSum', 'Svix', 'Hookdeck',
  ],
  'Real Estate & Construction': [
    'AppFolio', 'Yardi', 'Procore', 'Autodesk Construction Cloud', 'Zillow API', 'Redfin API', 'CoreLogic', 'PlanGrid (Autodesk)',
    'Oracle Primavera P6', 'Trimble (Tekla Structures)', 'Topcon GNSS', 'Leica Geosystems', 'Bentley Systems (iTwin)', 'Autodesk Build', 'HCSS', 'Assemble Systems',
    'NEOM (Digital Twin API)', 'Masdar City', 'Kuwait Vision 2035 (Silk City)', 'Egypt Vision 2030 (New Capital)',
  ],
  'Healthcare & Medical': [
    'Epic Systems (EMR)', 'Cerner (Oracle Health)', 'eClinicalWorks', 'DICOM / PACS Systems', 'Intuitive Surgical (Da Vinci)', 'Change Healthcare',
    'Flatiron Health (Roche)', 'Veeva Vault', 'Medidata Rave', 'DNAnexus', 'Illumina BaseSpace', 'Oura Ring API', 'Fitbit Web API', 'Garmin Connect', 'Dexcom', 'Withings',
  ],
  'Energy, Agriculture & Environment': [
    'John Deere Operations Center', 'Climate FieldView', 'Taranis', 'CropX', 'HerdDogg', 'Cropio', 'ClimateAI', 'AgroStar', 'Syngenta (CropWise)', 'Silostop API',
    'Enphase', 'SolarEdge', 'Tesla Energy API', 'ChargePoint', 'GridX (Griddy)', 'Schneider Electric EcoStruxure', 'PurpleAir', 'IQAir', 'USGS Earthquake API', 'NOAA Climate API',
    'OpenWeatherMap', 'Tomorrow.io', 'SCADA Water Systems (AVEVA)', 'Aquarius', 'GoAigua', 'Trimble WaterWorks', 'Xylem (Sensus)', 'DHI MIKE', 'SWCC (Desalination)', 'Kahramaa (Qatar)', 'IBTCI (Jordan Water)',
    'Hydration (Watergen)', 'AquaVolve', 'Katadyn / MSR',
  ],
  'Industrial, Mining & Manufacturing': [
    'Universal Robots (UR+)', 'Boston Dynamics Spot API', 'OctoPrint', 'SparkFun DataStream', 'FANUC Field System', 'Siemens (TIA Portal)', 'GE Digital (APM)', 'AspenTech', 'FLSmidth', 'SAP S/4HANA (Manufacturing)',
    'Maptek Vulcan', 'Deswik', 'Micromine', 'MineSense', 'ABB Mining', 'Rio Tinto (Mine of the Future)', 'Caterpillar (MineStar)',
  ],
  'Space, Aviation & Maritime': [
    'Inmarsat API', 'Iridium Edge', 'Planet Labs (Planet API)', 'Satellogic', 'SpaceX / Starlink API', 'NASA Open APIs', 'Copernicus (Sentinels)',
    'Tesla Fleet API', 'FordPass Connect', 'Mercedes-Benz API', 'Smartcar', 'OBD-II Dongles',
  ],
  'Government & National Infrastructure': [
    'World Bank Open Data API', 'IMF API', 'UN Comtrade API', 'Customs Single Window Systems', 'Treasury Single Account Platforms', 'National IDs (India Stack / MOSIP)',
    'Sovereign Wealth Fund Platforms', 'Cubic Transportation Systems', 'Siemens Mobility API', 'Citymapper', 'Waze (Carpool API)', 'Palantir Foundry (Government)', 'Esri (ArcGIS)',
    'FEMA API', 'GDACS', 'Terra Sentinel (Copernicus EMS)', 'Everbridge', 'Infralinx / IJGlobal', 'Devex (Development Finance)', 'COMESA / ECO Trade APIs', 'Islamic Solidarity Fund (ISFD)',
    'UAE Pass', 'Absher (Saudi Arabia)', 'Tawakkalna (Saudi)', 'NADRA (Pakistan)', 'MyDigital ID (Malaysia)', 'eID (Turkey)', 'GCC Unified Visa', 'Iraq Entry / Jordanian MoI API',
    'Nusuk (Hajj Platform)', 'Makkah Route Initiative API', 'Hajj Smart Card', 'General Authority (Two Holy Mosques)', 'ZATCA (Zakat & Tax)', 'Department of Waqf (UAE)', 'Kuwait Awqaf Public Foundation',
    'Saudi Aramco Digital', 'ADNOC (SPC)', 'Petronas (Selangkah API)',
  ],
  'Media, Entertainment & Sports': [
    'Mux', 'Vimeo (OTT / API)', 'Daily.co', 'Comscore Box Office API', 'MovieLabs', 'Hudl', 'Catapult Sports', 'Sleeper API', 'ESPN API',
    'FIFA API', 'IOC API', 'FIBA', 'World Athletics', 'F1 API', 'PGA Tour / European Tour', 'ATP / WTA', 'FINA', 'NBA API', 'NFL API', 'MLB API', 'UEFA API', 'ICC API',
  ],
  'Hospitality & Travel': [
    'Amadeus (Hospitality)', 'SiteMinder', 'Oracle Opera PMS', 'Infor HMS', 'Availpro (Mews)', 'The Leading Hotels of the World', 'Jumeriah Group API', 'HalalBooking API',
    'Adhan API / Prayer Times', 'QuranCloud API', 'Sunnah.com API', 'Zabihah API', 'Muslim Pro API', 'LaunchGood API',
  ],
  'Startup & Investment': [
    'AngelList', 'Republic', 'Wefunder', 'Crowdcube', 'Techstars (StarView)', 'Innovate UK / SBIR API', 'Aliph Capital (GCC)', 'Apple App Store Connect',
    'SAP', 'ServiceNow', 'Stack Overflow for Teams',
  ],
  'Palestinian & Humanitarian Tech': [
    'Gaza Sky Geeks', 'Souktel', 'Humanitarian OpenStreetMap Team (HOT)', 'Akka (Palestine News API)', 'We.Info', 'AidTech (Blockchain for Refugees)', 'UNRWA Digital Services API',
    'GoFundMe API', 'Donorbox', 'Classy', 'GlobalGiving',
  ],
  'Food Tech & Restaurant Ops': [
    'Olo', 'Squadle', 'Revel Systems',
  ],
  'Fire, Emergency & Archives': [
    'FirstDue', 'ESO (Emergency Services)', 'AlertSense (CivicReady)', 'Wildfire Predictive Services', 'NFIRS', 'Securitas / G4S (Fire & Safety)',
    'Internet Archive API', 'Library of Congress API', 'Europeana API', 'British Library Labs API', 'UNESCO World Heritage API', 'DPLA API', 'Qatar National Library API',
  ],
  'Domain & DNS': [
    'Spaceship', 'GoDaddy', 'Namecheap', 'Squarespace Domains', 'Name.com', 'Porkbun', 'Hover', 'Dynadot', 'Gandi.net', 'IONOS',
    'DNSimple', 'NS1 (IBM)', 'Akamai Edge DNS', "Let's Encrypt", 'ZeroSSL', 'DigiCert', 'Sectigo', 'WhoisXMLAPI',
  ],
  'Microsoft Ecosystem': [
    'Azure DevOps', 'Microsoft Graph API', 'Power Automate', 'Power Apps',
  ],
  'Calendar & Scheduling': [
    'Calendly', 'Cal.com', 'SavvyCal', 'OnceHub', 'YouCanBook.me', 'Cron (Notion Calendar)',
  ],
};

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

const CONNECTED = new Set(['github', 'supabase', 'upstash_redis', 'lemon_squeezy', 'cloudflare_r2', 'r2']);
const OAUTH = new Set([
  'github', 'gitlab', 'vercel', 'netlify', 'railway', 'digitalocean', 'heroku', 'render',
  'xbox_series_x_s_one', 'playstation_ps5_ps4', 'steam_pc', 'epic_games', 'twitter_x', 'linkedin',
  'instagram', 'facebook', 'youtube', 'tiktok', 'gmail_google_calendar', 'outlook', 'slack', 'discord',
  'stripe', 'paypal', 'lemonsqueezy', 'coinbase', 'alpaca', 'shopify', 'huggingface', 'sentry', 'ga',
  'mailchimp', 'convertkit', 'hubspot', 'dropbox', 'onedrive', 'zoom', 'google_meet',
]);

const DESCRIPTIONS = {
  supabase: 'Database, Auth, RLS',
  upstash_redis: 'Task queue & caching',
  lemon_squeezy: 'Subscription billing (merchant of record)',
  lemonsqueezy: 'Subscription billing (merchant of record)',
  cloudflare_r2: 'Object storage',
  r2: 'Object storage',
  xbox_series_x_s_one: 'Xbox Store API — Series X|S & Xbox One',
  playstation_ps5_ps4: 'PlayStation Store — PS5 & PS4 unified API',
};

const seen = new Set();
const entries = [];

for (const [category, names] of Object.entries(CATALOG)) {
  for (const name of names) {
    let id = slugify(name);
    let suffix = 2;
    while (seen.has(id)) {
      id = `${slugify(name)}_${suffix++}`;
    }
    seen.add(id);
    const connected = CONNECTED.has(id) || name === 'Supabase' || name === 'Upstash Redis' || name === 'Lemon Squeezy' || name === 'Cloudflare R2';
    const entry = {
      id,
      name,
      category,
      status: connected ? 'connected' : 'not_connected',
    };
    if (OAUTH.has(id) || name.includes('GitHub') || name.includes('Google')) entry.oauth = true;
    if (DESCRIPTIONS[id]) entry.description = DESCRIPTIONS[id];
    entries.push(entry);
  }
}

const categories = Object.keys(CATALOG);

const out = `/** Auto-generated by scripts/generate-integrations-catalog.mjs — do not edit by hand */
import type { Integration } from './integrations';

export const INTEGRATION_CATALOG_CATEGORIES = ${JSON.stringify(categories, null, 2)} as const;

export const INTEGRATION_CATALOG: Integration[] = ${JSON.stringify(entries, null, 2)};
`;

const target = join(__dirname, '../src/lib/integrations-catalog.ts');
writeFileSync(target, out);
console.log(`Wrote ${entries.length} integrations to ${target}`);
