/** Xroga-owned outcome recipes, not a list of installed external engines.
 * These prompts use Xroga's existing authorized native capabilities and verification.
 * Specialized collectors/auditors are never asserted to have run unless evidence exists.
 */
export interface NativeWorkSkill {
 readonly id: string; readonly title: string; readonly description: string;
 readonly inputs: string; readonly deliverable: string; readonly example: string;
 readonly version: number;
}
export const NATIVE_WORK_SKILLS: readonly NativeWorkSkill[] = [
  {
    "id": "local-business-prospecting",
    "title": "Local Business Prospecting",
    "description": "Discover and qualify businesses in a chosen industry and location.",
    "inputs": "Industry, location and target number",
    "deliverable": "Evidence-linked lead spreadsheet and opportunity priorities",
    "example": "Find 60 independent dental clinics in Houston.",
    "version": 1
  },
  {
    "id": "ideal-customer-finder",
    "title": "Ideal Customer Finder",
    "description": "Find companies matching your ideal customer profile.",
    "inputs": "Target customer profile, industry and geography",
    "deliverable": "Ranked company shortlist with source links",
    "example": "Find US manufacturing service businesses that match our ICP.",
    "version": 1
  },
  {
    "id": "multi-city-market-mapper",
    "title": "Multi-City Market Mapper",
    "description": "Compare business opportunities across cities.",
    "inputs": "Industry and comparison cities",
    "deliverable": "City-by-city market comparison and research table",
    "example": "Compare industrial service markets across five Ohio cities.",
    "version": 1
  },
  {
    "id": "public-business-contact-research",
    "title": "Public Business Contact Research",
    "description": "Locate published business contact channels.",
    "inputs": "Businesses or target market",
    "deliverable": "Public business phones, emails, websites and provenance",
    "example": "Verify published contacts for these 30 companies.",
    "version": 1
  },
  {
    "id": "business-growth-signal-scout",
    "title": "Business Growth Signal Scout",
    "description": "Research hiring, expansion and investment signals.",
    "inputs": "Industry or company list and region",
    "deliverable": "Dated company signals and confidence notes",
    "example": "Find Ohio manufacturers announcing new facilities.",
    "version": 1
  },
  {
    "id": "industry-opportunity-discovery",
    "title": "Industry Opportunity Discovery",
    "description": "Discover potential unmet needs in a market.",
    "inputs": "Industry, geography and business objective",
    "deliverable": "Prioritized hypotheses with evidence and research gaps",
    "example": "Explore workflow automation opportunities in legal services.",
    "version": 1
  },
  {
    "id": "lead-list-enrichment-cleanup",
    "title": "Lead List Enrichment & Cleanup",
    "description": "Clean and research an uploaded business list.",
    "inputs": "Business spreadsheet or company list",
    "deliverable": "Deduplicated, checked and enriched spreadsheet",
    "example": "Clean these 500 leads and identify official business sites.",
    "version": 1
  },
  {
    "id": "complete-website-health-audit",
    "title": "Complete Website Health Audit",
    "description": "Assess a website's technical, SEO and content health.",
    "inputs": "Public website URL and target page count",
    "deliverable": "Evidence-backed audit and prioritized improvement plan",
    "example": "Audit my website and recommend the most important fixes.",
    "version": 1
  },
  {
    "id": "complete-on-page-seo-audit",
    "title": "Complete On-Page SEO Audit",
    "description": "Review page structure and on-page search signals.",
    "inputs": "Public website URL",
    "deliverable": "Page-level SEO issue report and editorial recommendations",
    "example": "Audit titles, headings and content across my site.",
    "version": 1
  },
  {
    "id": "competitor-website-benchmark",
    "title": "Competitor Website Benchmark",
    "description": "Compare public websites with consistent checks.",
    "inputs": "Your URL and competitor URLs",
    "deliverable": "Comparable website matrix and improvement priorities",
    "example": "Benchmark my site against three direct competitors.",
    "version": 1
  },
  {
    "id": "website-speed-improvement-roadmap",
    "title": "Website Speed Improvement Roadmap",
    "description": "Investigate page speed issues and remediation options.",
    "inputs": "Public website URL",
    "deliverable": "Measured findings when tools are available; fix roadmap",
    "example": "Review my mobile website speed and rank the likely bottlenecks.",
    "version": 1
  },
  {
    "id": "accessibility-improvement-mission",
    "title": "Accessibility Improvement Mission",
    "description": "Identify accessibility issues and outline remediation.",
    "inputs": "Public website URL",
    "deliverable": "Automated findings and manual testing checklist",
    "example": "Assess my website accessibility and create a fix backlog.",
    "version": 1
  },
  {
    "id": "full-website-content-inventory",
    "title": "Full Website Content Inventory",
    "description": "Catalog accessible pages and their content purpose.",
    "inputs": "Website URL and crawl limit",
    "deliverable": "Structured page inventory and content gap notes",
    "example": "Inventory up to 100 pages on my company site.",
    "version": 1
  },
  {
    "id": "sitemap-internal-link-blueprint",
    "title": "Sitemap & Internal Link Blueprint",
    "description": "Analyze navigation and internal link structure.",
    "inputs": "Public website URL",
    "deliverable": "Sitemap findings and proposed link structure",
    "example": "Map my internal links and propose a better site structure.",
    "version": 1
  },
  {
    "id": "local-seo-readiness-review",
    "title": "Local SEO Readiness Review",
    "description": "Evaluate public local search readiness.",
    "inputs": "Business name, location and website",
    "deliverable": "Local visibility and website consistency improvement plan",
    "example": "Review the local SEO signals of my Dubai towing business.",
    "version": 1
  },
  {
    "id": "competitor-deep-investigation",
    "title": "Competitor Deep Investigation",
    "description": "Create a sourced profile of a company competitor.",
    "inputs": "Company name or URL",
    "deliverable": "Competitor dossier: offerings, positioning and evidence",
    "example": "Investigate this SaaS competitor and its product positioning.",
    "version": 1
  },
  {
    "id": "competitive-landscape-matrix",
    "title": "Competitive Landscape Matrix",
    "description": "Compare participants in a defined market.",
    "inputs": "Industry, region and known competitors",
    "deliverable": "Multi-company matrix with strengths and gaps",
    "example": "Compare ten AI customer support products.",
    "version": 1
  },
  {
    "id": "public-pricing-offers-study",
    "title": "Public Pricing & Offers Study",
    "description": "Compare publicly stated plans, offers and prices.",
    "inputs": "Product or service niche and region",
    "deliverable": "Dated pricing table with sources and limitations",
    "example": "Compare publicly listed prices for ten CRM tools.",
    "version": 1
  },
  {
    "id": "competitor-content-gap-analysis",
    "title": "Competitor Content Gap Analysis",
    "description": "Find topic coverage opportunities against competitors.",
    "inputs": "Your URL and competitor URLs",
    "deliverable": "Content gap matrix and editorial priorities",
    "example": "Find useful competitor topics missing from my website.",
    "version": 1
  },
  {
    "id": "market-entry-research-report",
    "title": "Market Entry Research Report",
    "description": "Research a proposed new market or geographic expansion.",
    "inputs": "Product, target market and budget assumptions",
    "deliverable": "Market entry report, competition and risk register",
    "example": "Research potential entry into the UAE B2B software market.",
    "version": 1
  },
  {
    "id": "industry-trend-intelligence",
    "title": "Industry Trend Intelligence",
    "description": "Investigate important developments in an industry.",
    "inputs": "Industry, geography and timeframe",
    "deliverable": "Source-dated trend report with uncertainty",
    "example": "Research recent trends in industrial maintenance services.",
    "version": 1
  },
  {
    "id": "public-brand-reputation-research",
    "title": "Public Brand Reputation Research",
    "description": "Summarize publicly observable feedback and themes.",
    "inputs": "Brand name and target market",
    "deliverable": "Source-linked themes, limitations and action ideas",
    "example": "Study recurring public reviews for this software brand.",
    "version": 1
  },
  {
    "id": "90-day-growth-strategy",
    "title": "90-Day Growth Strategy",
    "description": "Build a structured plan to achieve growth goals.",
    "inputs": "Business, audience, objectives and budget",
    "deliverable": "90-day roadmap, initiatives and KPIs",
    "example": "Plan 90 days of growth for our B2B SaaS product.",
    "version": 1
  },
  {
    "id": "complete-brand-positioning-blueprint",
    "title": "Complete Brand Positioning Blueprint",
    "description": "Define differentiated positioning and messaging.",
    "inputs": "Business, audience, competitors and brand goals",
    "deliverable": "Positioning system and messaging framework",
    "example": "Build a distinctive positioning framework for our agency.",
    "version": 1
  },
  {
    "id": "buyer-persona-research-dossier",
    "title": "Buyer Persona Research Dossier",
    "description": "Develop evidence-informed customer personas.",
    "inputs": "Product, industry and audience",
    "deliverable": "Buyer hypotheses, pain points and validation steps",
    "example": "Research three potential buyers for a workflow product.",
    "version": 1
  },
  {
    "id": "90-day-editorial-strategy",
    "title": "90-Day Editorial Strategy",
    "description": "Plan a focused publishing program.",
    "inputs": "Business website and audience",
    "deliverable": "Editorial calendar, priorities and content briefs",
    "example": "Create a 90-day editorial strategy for a fintech website.",
    "version": 1
  },
  {
    "id": "seo-topic-cluster-blueprint",
    "title": "SEO Topic Cluster Blueprint",
    "description": "Build interconnected content clusters for search intent.",
    "inputs": "Seed topics, website and market",
    "deliverable": "Pillar/supporting-page outline and topic briefs",
    "example": "Create ten topic clusters for a professional services site.",
    "version": 1
  },
  {
    "id": "landing-page-conversion-review",
    "title": "Landing Page Conversion Review",
    "description": "Identify friction on a public landing page.",
    "inputs": "Page URL and conversion objective",
    "deliverable": "CRO audit with testable improvements",
    "example": "Review my pricing page and propose A/B tests.",
    "version": 1
  },
  {
    "id": "full-campaign-strategy-package",
    "title": "Full Campaign Strategy Package",
    "description": "Design a complete marketing campaign.",
    "inputs": "Offer, audience, channels and budget",
    "deliverable": "Campaign plan, assets brief and metrics",
    "example": "Plan the launch of our next SaaS product.",
    "version": 1
  },
  {
    "id": "30-day-social-content-studio",
    "title": "30-Day Social Content Studio",
    "description": "Draft a month of social content without publishing.",
    "inputs": "Brand, audience and desired channels",
    "deliverable": "30-day content calendar, captions and creative briefs",
    "example": "Create a month of LinkedIn content for a B2B software firm.",
    "version": 1
  },
  {
    "id": "email-campaign-production",
    "title": "Email Campaign Production",
    "description": "Write and structure a marketing email sequence.",
    "inputs": "Audience, objective and brand voice",
    "deliverable": "Email drafts and sequence plan for review",
    "example": "Draft a five-email onboarding sequence for my SaaS.",
    "version": 1
  },
  {
    "id": "website-copy-transformation",
    "title": "Website Copy Transformation",
    "description": "Rework copy for important website pages.",
    "inputs": "Website and target audience",
    "deliverable": "Revised draft copy, metadata and implementation notes",
    "example": "Rewrite my home, services and about pages.",
    "version": 1
  },
  {
    "id": "company-domain-intelligence-dossier",
    "title": "Company Domain Intelligence Dossier",
    "description": "Research publicly available domain records.",
    "inputs": "Domain name",
    "deliverable": "Registration, DNS and infrastructure observations",
    "example": "Prepare a public-domain dossier for example.com.",
    "version": 1
  },
  {
    "id": "email-domain-configuration-audit",
    "title": "Email Domain Configuration Audit",
    "description": "Examine published email authentication DNS records.",
    "inputs": "Domain name",
    "deliverable": "SPF/DMARC observations and remediation checklist",
    "example": "Audit my domain's email authentication setup.",
    "version": 1
  },
  {
    "id": "public-hosting-ip-footprint",
    "title": "Public Hosting & IP Footprint",
    "description": "Summarize publicly visible hosting relationships.",
    "inputs": "Owned or publicly identified domain",
    "deliverable": "DNS, IP and hosting observations",
    "example": "Summarize public hosting information for my domain.",
    "version": 1
  },
  {
    "id": "website-security-hygiene-review",
    "title": "Website Security Hygiene Review",
    "description": "Run non-invasive public security hygiene checks.",
    "inputs": "Website URL",
    "deliverable": "Public-only findings and recommended hardening",
    "example": "Check my site's public HTTPS, headers and DNS hygiene.",
    "version": 1
  },
  {
    "id": "evidence-based-deep-research",
    "title": "Evidence-Based Deep Research",
    "description": "Research a complex question from multiple sources.",
    "inputs": "Research question and required scope",
    "deliverable": "Cited report and evidence table",
    "example": "Research the market for AI bookkeeping platforms.",
    "version": 1
  },
  {
    "id": "public-data-extraction-project",
    "title": "Public Data Extraction Project",
    "description": "Structure information from permitted public sources.",
    "inputs": "Public URLs and fields to extract",
    "deliverable": "CSV or JSON plus source and extraction logs",
    "example": "Extract public course titles from these permitted pages.",
    "version": 1
  },
  {
    "id": "website-knowledge-collection",
    "title": "Website Knowledge Collection",
    "description": "Organize public documentation into a reference set.",
    "inputs": "Public documentation URLs",
    "deliverable": "Structured source collection and summaries",
    "example": "Create a reference collection from these developer docs.",
    "version": 1
  },
  {
    "id": "executive-decision-research-memo",
    "title": "Executive Decision Research Memo",
    "description": "Compare options and build a decision-ready memo.",
    "inputs": "Decision, alternatives, constraints and priorities",
    "deliverable": "Evidence, scenarios, tradeoffs and recommendation",
    "example": "Compare three expansion markets for my company.",
    "version": 1
  }
];
export function nativeWorkSkillById(id: string | null | undefined): NativeWorkSkill | undefined {
 return NATIVE_WORK_SKILLS.find(s=>s.id===id);
}
export function buildNativeWorkSkillPrompt(skill: NativeWorkSkill): string {
 return [
  `Xroga native work skill: ${skill.title} (recipe ${skill.id}, v${skill.version}).`,
  `Goal: ${skill.description}`,
  `Essential details: ${skill.inputs}.`,
  `Expected finished work: ${skill.deliverable}.`,
  'Carry out the complete job in this existing Xroga Workspace using only available, approved native tools, existing web search, models and artifact workers. No customer-connected app or GitHub repository is required.',
  'Use sources and capture evidence for factual findings. Check available tool capabilities before claiming measurements, crawling, database lookups, audits or exports. Never fabricate output, success, live measurements, keyword volumes or verified contacts. If a specialized engine is not installed, use a legitimate supported alternative if possible; otherwise state what is missing and give the best verified partial result.',
  'Keep the work scoped, respect source permissions and budgets, report limitations, and verify every claimed deliverable.',
  'My task details (complete these before starting if essential): '
 ].join('\n\n');
}
export function nativeSkillWorkspaceHref(id:string):string {
 return `/workspace?nativeSkill=${encodeURIComponent(id)}`;
}
