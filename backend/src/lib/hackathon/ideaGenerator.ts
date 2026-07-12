import { buildModelCall } from '../../swarm/negotiation/buildModelRouter.js';
import type { HackathonBrief, HackathonIdeaRecommendation } from './types.js';

const IDEA_SYSTEM = `You are XROGA Hackathon Strategist. Generate winning ASP/product ideas for hackathon judges.

Rules:
- Ideas must be NOVEL but not science-fiction — fill the sponsor's marketplace/ecosystem gap
- Reject patterns: generic DeFi dashboards, basic ChatGPT wrappers, 2023 templates, over-engineered unrelated tech
- Each idea must name a target prize track and explain why judges would pick it
- ASP ideas need: agent workflow steps, monetization, 90s demo story
- Output ONLY valid JSON array of 2-3 ideas`;

function fallbackOkxIdeas(): HackathonIdeaRecommendation[] {
  return [
    {
      name: 'InvoiceFlow ASP',
      tagline: 'AI agent that turns messy receipts + bank exports into tax-ready books for freelancers',
      targetTrack: 'Finance Copilot',
      whyNovel: 'Combines OCR, categorization, and compliance checks as one agent workflow — not another portfolio tracker',
      sponsorGapFilled: 'OKX.AI lacks practical finance workflow ASPs beyond crypto trading',
      whatToBuild: [
        'Upload receipts/CSV → agent categorizes → export report',
        'Pricing: per-export or monthly subscription',
        'OKX.AI listing page with clear service tiers',
      ],
      whatNotToBuild: ['Generic DeFi dashboard', 'Crypto price ticker', 'Blank chatbot'],
      demoStory90s:
        'Show freelancer with 40 receipts → agent processes in 30s → tax summary PDF → pay $2 for export',
      revenuePath: 'Pay-per-export + Pro monthly plan for Revenue Rocket track',
    },
    {
      name: 'DeployGuard ASP',
      tagline: 'Pre-release agent that audits your web app for accessibility, SEO, and security before ship',
      targetTrack: 'Software Utility',
      whyNovel: 'Agent runs checklist across live URL and returns prioritized fix list — devs pay per audit',
      sponsorGapFilled: 'Software Utility category needs dev-tool ASPs, not consumer lifestyle apps',
      whatToBuild: [
        'URL input → agent crawls → scored report with fixes',
        'GitHub/Vercel integration optional',
        'Clear per-audit pricing on OKX.AI',
      ],
      whatNotToBuild: ['Full CI/CD platform', 'Another linter CLI only', 'Crypto wallet'],
      demoStory90s: 'Paste staging URL → agent finds 12 issues ranked → one-click fix suggestions → purchase full report',
      revenuePath: '$5 per audit, bundle packs for teams',
    },
    {
      name: 'MealMind ASP',
      tagline: 'Lifestyle agent that plans weekly meals from pantry photo + dietary goals + local grocery prices',
      targetTrack: 'Lifestyle Companion',
      whyNovel: 'Multimodal input (pantry photo) + structured meal plan output — actionable not inspirational',
      sponsorGapFilled: 'Lifestyle ASPs on agent marketplaces skew generic; this is a complete weekly workflow',
      whatToBuild: [
        'Photo/upload pantry → agent generates 7-day plan + shopping list',
        'Save preferences, export to notes',
        'Social share hook for #OKXAI traction',
      ],
      whatNotToBuild: ['Recipe blog clone', 'Calorie counter only', 'NFT food art'],
      demoStory90s: 'Snap pantry → agent lists meals for the week → shopping list under budget → share on X',
      revenuePath: 'Free 3-day plan, paid full week + grocery optimizer',
    },
  ];
}

function parseIdeasJson(raw: string): HackathonIdeaRecommendation[] | null {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[0]) as HackathonIdeaRecommendation[];
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.slice(0, 3).map((idea) => ({
      name: idea.name ?? 'Untitled ASP',
      tagline: idea.tagline ?? '',
      targetTrack: idea.targetTrack ?? 'Best Product',
      whyNovel: idea.whyNovel ?? '',
      sponsorGapFilled: idea.sponsorGapFilled ?? '',
      whatToBuild: Array.isArray(idea.whatToBuild) ? idea.whatToBuild : [],
      whatNotToBuild: Array.isArray(idea.whatNotToBuild) ? idea.whatNotToBuild : [],
      demoStory90s: idea.demoStory90s ?? '',
      revenuePath: idea.revenuePath,
    }));
  } catch {
    return null;
  }
}

export async function generateHackathonIdeas(
  brief: HackathonBrief,
  userPrompt: string
): Promise<HackathonIdeaRecommendation[]> {
  const user = `Hackathon: ${brief.name}
Sponsor: ${brief.sponsor}
Product type: ${brief.productType}
Crypto required: ${brief.cryptoRequired}
Summary: ${brief.summary}

Sponsor gaps to fill:
${brief.sponsorGaps.map((g) => `- ${g}`).join('\n')}

Reject if you build:
${brief.rejectReasons.map((r) => `- ${r}`).join('\n')}

Innovation sweet spot: ${brief.innovationSweetSpot}

Prize tracks:
${brief.prizeTracks.map((t) => `- ${t.name}: ${t.criteria}`).join('\n') || '(see official page)'}

User request: ${userPrompt.slice(0, 500)}

Return JSON array with objects:
{ "name", "tagline", "targetTrack", "whyNovel", "sponsorGapFilled", "whatToBuild": [], "whatNotToBuild": [], "demoStory90s", "revenuePath" }`;

  try {
    const { text } = await buildModelCall('grok', IDEA_SYSTEM, user, 4096);
    const parsed = parseIdeasJson(text);
    if (parsed?.length) return parsed;
  } catch (err) {
    console.warn('[HackathonIdeas] Grok failed:', (err as Error).message);
  }

  if (brief.id === 'okx-build-x-series') return fallbackOkxIdeas();
  return fallbackOkxIdeas().slice(0, 2);
}

export function pickRecommendedIdea(
  ideas: HackathonIdeaRecommendation[],
  userPrompt: string
): HackathonIdeaRecommendation | undefined {
  if (!ideas.length) return undefined;
  const lower = userPrompt.toLowerCase();
  const trackMatch = ideas.find((i) => lower.includes(i.targetTrack.toLowerCase().split(' ')[0]!));
  if (trackMatch) return trackMatch;
  const finance = /\b(finance|tax|invoice|accounting)\b/i.test(lower);
  if (finance) return ideas.find((i) => /finance/i.test(i.targetTrack)) ?? ideas[0];
  const software = /\b(software|dev|code|audit|deploy)\b/i.test(lower);
  if (software) return ideas.find((i) => /software/i.test(i.targetTrack)) ?? ideas[0];
  return ideas[0];
}
