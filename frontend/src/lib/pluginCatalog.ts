      const order = [
        'Search & read',
        'Draft & send',
        'Create & send',
        'Update & manage',
        'Files & attachments',
        'People & customers',
        'Billing & payments',
        'Commerce',
        'Scheduling',
        'Engineering',
        'Organize & remove',
        'Available capabilities',
      ];
      return order.indexOf(a.name) - order.indexOf(b.name);
    });
}

export function pluginDefinitionFor(id: string): PluginDefinition | undefined {
  return PLUGIN_MAP.get(canonicalPluginId(id));
}

export function genericPluginDefinition(slug: string): PluginDefinition {
  const name = titleCase(slug.replace(/[-_]+/g, ' '));
  return {
    id: canonicalPluginId(slug),
    name,
    description: 'Connect this app so Xroga can use its supported capabilities.',
    category: inferCategory(name),
    source: 'composio',
    query: `find ${name} capabilities`,
    keywords: [name.toLowerCase()],
  };
}

export function composioLogoUrl(
  toolkit: string,
  theme?: 'dark',
): string {
  const base = `https://logos.composio.dev/api/${encodeURIComponent(toolkit)}`;
  return theme === 'dark' ? `${base}?theme=dark` : base;
}

function catalogCategoryText(
  toolkit: XrogaConnectCatalogToolkit,
): string {
  return toolkit.categories
    .flatMap((category) => [category.id, category.name])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function catalogPrimaryCategory(
  toolkit: XrogaConnectCatalogToolkit,
): string {
  const compactSlug = canonicalPluginId(toolkit.slug);
  const explicitCategory =
    compactSlug === 'whop'
      ? 'Commerce & Payments'
      : compactSlug === 'canva'
        ? 'Design & Media'
        : compactSlug === 'flyio' || compactSlug === 'flydotio'
          ? 'Deployment & Hosting'
          : undefined;

  if (explicitCategory) return explicitCategory;

  const serverLabel = toolkit.xrogaGroup
    ? XROGA_GROUP_LABELS[toolkit.xrogaGroup]
    : undefined;

  // The backend classification is authoritative so a shelf label and the app's
  // displayed category cannot drift apart. The local rules below are a
  // backwards-compatible fallback during rolling deploys.
  if (serverLabel) return serverLabel;

  const categories = catalogCategoryText(toolkit);
  const text = `${toolkit.name} ${toolkit.description ?? ''}`.toLowerCase();

  if (
    /maps?|geocoding|geospatial|location intelligence|navigation|places/.test(categories) ||
    /\b(google maps|mapbox|geocod|geospatial|directions?|route planning|places api|location data)\b/.test(text)
  ) return 'Maps & Location';
  if (
    /weather|climate|forecast|time zones?|currency conversion|utilities/.test(categories) ||
    /\b(weather|forecast|climate|temperature|time zone|timezone|currency converter)\b/.test(text)
  ) return 'Weather & Utilities';
  if (
    /scheduling\s*&\s*booking|scheduling and booking|appointment|reservation|calendar booking/.test(categories) ||
    /\b(calendly|cal\.com|appointment|booking page|scheduler|scheduling|meeting booking|availability management)\b/.test(text)
  ) return 'Booking & Scheduling';
  if (
    /hotel|hospitality|lodging|accommodation|vacation rental|short-term rental/.test(categories) ||
    /\b(hotel|hotels|lodging|accommodation|stay|stays|booking\.com|airbnb|agoda|hospitality)\b/.test(text)
  ) return 'Hotels & Stays';
  if (
    /travel|flight|airline|tourism|transport|rail|rental car/.test(categories) ||
    /\b(flight|flights|airline|airlines|tourism|trip\.com|skyscanner|expedia|travel|transport|rail|train|rental car)\b/.test(text)
  ) return 'Travel & Transport';
  if (/shipping|logistics|delivery|fleet|carrier|postal|warehouse|supply chain/.test(categories)) return 'Logistics & Shipping';
  if (/real estate|property management|property listings|mortgage/.test(categories)) return 'Real Estate';
  if (/food|restaurants?|restaurant management|recipes?|dining/.test(categories)) return 'Food & Restaurants';
  if (/legal|contracts?|signatures?|e-signatures?|document signing/.test(categories)) return 'Legal & Contracts';
  if (/forms\s*&\s*surveys|forms and surveys|surveys?|questionnaires?|data collection/.test(categories)) return 'Forms & Surveys';
  if (/social media accounts|social media marketing|social media management|creator tools/.test(categories)) return 'Social Media';
  if (/ai web scraping|web scraping|web search|search engine|browser automation|data extraction/.test(categories)) return 'Web Search & Scraping';
  if (/\bdatabases?\b/.test(categories)) return 'Databases';
  if (/website\s*&\s*app building|website and app building|app builder|website builders|hosting/.test(categories)) return 'Deployment & Hosting';
  if (/security\s*&\s*identity|security and identity|risk management|compliance|audit management/.test(categories)) return 'Security';
  if (/blockchain|crypto|cryptocurrency|web3|on-chain|onchain/.test(categories)) return 'Blockchain & Crypto';
  if (/developer tools|developer tools\s*&\s*devops|developer tools and devops|api testing/.test(categories)) return 'Developer Tools';
  if (/it operations|server monitoring|internet of things|networking|cloud infrastructure/.test(categories)) return 'Cloud & Infrastructure';
  if (/online courses/.test(categories)) return 'Education & Research';
  if (/artificial intelligence|ai agents|ai assistants|ai chatbots|ai content generation|ai document extraction|ai meeting assistants|ai models|ai safety compliance detection|ai sales tools|model context protocol|creative automation/.test(categories)) return 'AI & Automation';
  if (/business intelligence|analytics|dashboards|product analytics|data analytics|reporting/.test(categories)) return 'Data & Analytics';
  if (/accounting|fundraising|proposal\s*&\s*invoice|proposal and invoice|taxes|banking|expense management/.test(categories)) return 'Finance & Accounting';
  if (/commerce|ecommerce|payment processing|reviews|retail/.test(categories)) return 'Commerce & Payments';
  if (/marketing|ads\s*&\s*conversion|ads and conversion|drip emails|email newsletters|event management|marketing automation|transactional email|url shortener|webinars|seo/.test(categories)) return 'Marketing & Growth';
  if (/customer support|\bsupport\b|customer appreciation|help desk|ticketing/.test(categories)) return 'Customer Support';
  if (/sales\s*&\s*crm|sales and crm|contact management|\bcrm\b|lead management/.test(categories)) return 'Sales & CRM';
  if (/business operations|business management|erp|office management|professional services|workflow management/.test(categories)) return 'Business & Operations';
  if (/images\s*&\s*design|images and design|video\s*&\s*audio|video and audio|visual content generation/.test(categories)) return 'Design & Media';
  if (/content\s*&\s*files|content and files|documents|file management\s*&\s*storage|file management and storage|notes|transcription/.test(categories)) return 'Content & Files';
  if (/human resources|hr talent\s*&\s*recruitment|hr talent and recruitment|recruiting|employee management/.test(categories)) return 'HR & Recruiting';
  if (/scientific research|biology|chemistry|genomics|bioinformatics/.test(categories)) return 'Scientific Research';
  if (/\beducation\b/.test(categories)) return 'Education & Research';
  if (/fitness|healthcare|health|medical|wellness|nutrition/.test(categories)) return 'Healthcare & Fitness';
  if (/gaming|lifestyle\s*&\s*entertainment|lifestyle and entertainment|news\s*&\s*lifestyle|news and lifestyle|music|sports/.test(categories)) return 'Entertainment';
  if (/phone\s*&\s*sms|phone and sms|team chat|team collaboration|video conferencing|communication|call tracking|\bemail\b|fax|notifications|messaging/.test(categories)) return 'Communication';
  if (/calendar/.test(categories)) return 'Booking & Scheduling';
  if (/project management|product management|task management|work management|kanban|roadmap/.test(categories)) return 'Project Management';
  if (/productivity|bookmark managers|spreadsheets|time tracking software/.test(categories)) return 'Productivity';

  return inferCategory(toolkit.name, toolkit.description);
}
export function groundedUseCasePrompt(
  tool: XrogaConnectTool,
  pluginName: string,
): string {
  const action = tool.name || prettyToolName(tool);
  const cleanAction = action.replace(/[.!?]+$/, '').trim();
  const lower = cleanAction.toLowerCase();

  if (/^(search|find|lookup)\b/i.test(cleanAction)) {
    return `Use ${pluginName} to ${lower} and show me the most relevant results.`;
  }
  if (/^(list|read|get|fetch|retrieve)\b/i.test(cleanAction)) {
    return `Use ${pluginName} to ${lower} and summarize what matters.`;
  }
  if (/^(create|add|draft|generate)\b/i.test(cleanAction)) {
    return `Use ${pluginName} to ${lower} from the details I provide.`;
  }