/** Compact beginner-friendly phase progress (Phases 0–9) */

import type { NegotiationPhase } from './types.js';
import { userPhaseNumber } from './types.js';

/** Infer project defaults from the build request — no user questions needed. */
export function inferDefaultBuildBrief(prompt: string, memoryNote?: string): string {
  const lower = prompt.toLowerCase();
  let projectName = 'My Website';
  let theme = 'Modern, clean design';
  let ordering = true;
  let businessType = 'website';

  if (/\bcoffee|caf[eé]|espresso|latte\b/.test(lower)) {
    projectName = 'Cozy Cup Coffee';
    theme = 'Warm brown & gold, cozy atmosphere';
    businessType = 'coffee shop';
    ordering = true;
  } else if (/\bbakery|bake|pastry|bread\b/.test(lower)) {
    projectName = 'Sunrise Bakery';
    theme = 'Light pastels, warm and inviting';
    businessType = 'bakery';
    ordering = true;
  } else if (/\brestaurant|dining|bistro|pizza\b/.test(lower)) {
    projectName = 'The Hearth Restaurant';
    theme = 'Elegant dark theme with gold accents';
    businessType = 'restaurant';
    ordering = true;
  } else if (/\bshop|store|boutique|retail|ecommerce\b/.test(lower)) {
    projectName = 'Urban Boutique';
    theme = 'Minimalist black & white, modern';
    businessType = 'retail shop';
    ordering = true;
  } else if (/\bsalon|spa|beauty|barber\b/.test(lower)) {
    projectName = 'Luxe Salon & Spa';
    theme = 'Soft neutrals, elegant typography';
    businessType = 'salon / spa';
    ordering = false;
  } else if (/\bgym|fitness|yoga|crossfit\b/.test(lower)) {
    projectName = 'Peak Fitness Studio';
    theme = 'Bold energetic dark theme';
    businessType = 'fitness studio';
    ordering = false;
  } else if (/\bdental|clinic|medical|doctor|health\b/.test(lower)) {
    projectName = 'Bright Smile Dental';
    theme = 'Clean white & teal, trustworthy';
    businessType = 'healthcare clinic';
    ordering = false;
  } else if (/\blawyer|legal|attorney\b/.test(lower)) {
    projectName = 'Summit Legal Group';
    theme = 'Professional navy & gold';
    businessType = 'law firm';
    ordering = false;
  } else if (/\breal estate|realtor|property\b/.test(lower)) {
    projectName = 'Horizon Realty';
    theme = 'Modern luxury listings';
    businessType = 'real estate';
    ordering = false;
  } else if (/\bhotel|resort|hospitality\b/.test(lower)) {
    projectName = 'Grand Vista Hotel';
    theme = 'Luxury hospitality';
    businessType = 'hotel';
    ordering = true;
  } else if (/\bportfolio|photographer|designer|freelance\b/.test(lower)) {
    projectName = 'Creative Portfolio';
    theme = 'Minimal showcase';
    businessType = 'portfolio';
    ordering = false;
  } else if (/\bchurch|nonprofit|charity\b/.test(lower)) {
    projectName = 'Community Hope';
    theme = 'Warm welcoming';
    businessType = 'nonprofit';
    ordering = false;
  } else if (/\bstartup|saas|tech\b/.test(lower)) {
    projectName = 'LaunchPad SaaS';
    theme = 'Modern tech gradient';
    businessType = 'SaaS startup';
    ordering = false;
  } else if (/\b(crypto|blockchain|web3|defi|nft|token|wallet|dao|dapp|exchange)\b/.test(lower)) {
    projectName = 'ChainVault DeFi';
    theme = 'Dark Web3 gradient, neon accents';
    businessType = 'crypto / Web3 platform';
    ordering = false;
  } else if (/\b(chatbot|chat bot|ai assistant|ai agent|support bot)\b/.test(lower)) {
    projectName = 'XROGA AI Assistant';
    theme = 'Clean AI chat interface';
    businessType = 'AI chatbot';
    ordering = false;
  } else {
    const match = prompt.match(/\b(build|create|make)\s+(?:a\s+)?(.+?)\s+(website|site|shop|store)/i);
    if (match?.[2]) {
      const raw = match[2].trim();
      projectName = raw.replace(/\b\w/g, (c) => c.toUpperCase());
      if (!/website|site/i.test(projectName)) projectName += ' Website';
      businessType = raw;
    }
  }

  const features = [
    'Homepage with hero & navigation',
    'Menu / products with pricing',
    ...(ordering ? ['Online ordering & cart'] : []),
    'Photo gallery',
    'Contact form & footer',
    'Responsive mobile design',
  ];

  const lines = [
    'Fully Clarified Project Brief',
    '',
    `Project name: ${projectName}`,
    `Business type: ${businessType}`,
    `Design theme: ${theme}`,
    `Features: ${features.join(', ')}`,
    'Tech: Plain HTML/CSS/JS, mobile-first',
  ];
  if (memoryNote) lines.push('', `Prior builds remembered: ${memoryNote}`);
  return lines.join('\n');
}

/** Short label for Phase 1 kickoff message */
export function inferBusinessLabel(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\bgame\b/.test(lower) && /\b(build|create|make|code)\b/.test(lower)) return 'game project';
  if (/\bcoffee|caf[eé]|espresso|latte\b/.test(lower)) return 'coffee shop website';
  if (/\bbakery|bake|pastry\b/.test(lower)) return 'bakery website';
  if (/\brestaurant|dining|bistro|pizza\b/.test(lower)) return 'restaurant website';
  if (/\bsalon|spa|beauty|barber\b/.test(lower)) return 'salon website';
  if (/\bgym|fitness|yoga\b/.test(lower)) return 'fitness website';
  if (/\bdental|clinic|medical\b/.test(lower)) return 'clinic website';
  if (/\blawyer|legal|attorney\b/.test(lower)) return 'law firm website';
  if (/\breal estate|realtor\b/.test(lower)) return 'real estate website';
  if (/\bportfolio|photographer\b/.test(lower)) return 'portfolio website';
  if (/\bshop|store|boutique|ecommerce\b/.test(lower)) return 'shop website';
  if (/\b(crypto|blockchain|web3|defi|nft|wallet|dao|dapp)\b/.test(lower)) return 'crypto / Web3 platform';
  if (/\b(chatbot|chat bot|ai assistant|ai agent)\b/.test(lower)) return 'AI chatbot application';
  const match = prompt.match(/\b(build|create|make)\s+(?:a\s+)?(.+?)\s+(website|site)/i);
  if (match?.[2]) return `${match[2].trim()} website`;
  return 'website';
}

export interface BuildSummaryData {
  projectName: string;
  pages: string[];
  features: string[];
  designTheme: string;
  liveUrl?: string;
  repoUrl?: string;
  memoryNote?: string;
  needsPayment?: boolean;
}

export function phaseLine(phase: NegotiationPhase, detail: string): string {
  return `[Phase ${userPhaseNumber(phase)}] ${detail}`;
}

export const PHASE_UI = {
  githubConnect: '[Phase 0] Connect GitHub to save your work.',
  discovery: (label?: string) => `🚀 [Phase 1] Starting your ${label ?? 'website'}...`,
  briefReady: () => '[Phase 1] Build plan ready.',
  planning: () => '📝 [Phase 1] Planning your build steps...',
  planReady: (steps: number) => `📝 [Phase 1] ${steps} steps planned — starting build`,
  planReview: () => '[Phase 3] XROGA Architect reviews the plan.',
  planApproved: () => '[Phase 3] Plan approved.',
  execute: (step: number, total: number, label: string) =>
    `⚙️ [Phase 3] Building... Step ${step}/${total} ${label}`,
  verify: () => '🔍 [Phase 4] Verifying...',
  verifyPass: () => '🔍 [Phase 4] Verifying... ✅ All checks passed.',
  correct: () => '[Phase 4] Fixing issues behind the scenes...',
  finalReview: () => '[Phase 4] Final verification...',
  finalPass: () => '✅ All checks passed.',
  emit: () => '[Phase 5] Preparing your summary...',
  deploy: () => '🚀 [Phase 5] Deploying...',
  deployGithub: () => '🚀 [Phase 5] Creating GitHub repo...',
  deployPush: () => '🚀 [Phase 5] Pushing files...',
  deployVercel: () => '🚀 [Phase 5] Deploying to Vercel...',
  deployDone: () => '🚀 [Phase 5] Deploying... ✅ Live!',
  githubRequired: '🔗 [Phase 0] Connect GitHub to save your work.',
  githubVerified: '✅ GitHub connected — your builds will be saved automatically.',
} as const;

export function formatBuildSummaryCard(data: BuildSummaryData): string {
  const lines = [
    `Project: ${data.projectName}`,
    `Pages: ${data.pages.join(', ')}`,
    `Features: ${data.features.join(', ')}`,
    `Design: ${data.designTheme}`,
  ];
  if (data.liveUrl) lines.push(`Live: ${data.liveUrl}`);
  if (data.repoUrl) lines.push(`GitHub: ${data.repoUrl}`);
  return lines.join('\n');
}

/** Friendly step label for progress UI (Homepage, Menu, etc.) */
export function friendlyStepLabel(step: string, index: number): string {
  const lower = step.toLowerCase();
  if (/homepage|hero|header|scaffold|structure/i.test(lower)) return '✅ Homepage';
  if (/menu|drink|food|pricing/i.test(lower)) return '✅ Menu';
  if (/order|cart|checkout|payment/i.test(lower)) return '✅ Ordering';
  if (/gallery|photo|image/i.test(lower)) return '✅ Gallery';
  if (/contact|footer|form/i.test(lower)) return '✅ Contact';
  if (/responsive|mobile|polish/i.test(lower)) return '✅ Responsive Design';
  if (/css|style|theme/i.test(lower)) return '✅ Styling';
  if (/javascript|js|interactiv/i.test(lower)) return '✅ Interactivity';
  return `✅ Step ${index + 1}`;
}

export function stepTargetLabel(step: string, index: number): string {
  const label = friendlyStepLabel(step, index).replace(/^✅\s*/, '');
  return label;
}

/** Slug for GitHub repo: xroga-cozy-cup */
export function slugFromProjectName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return slug ? `xroga-${slug}` : `xroga-build-${Date.now()}`;
}

/** Parse project name from user answer or brief. */
export function parseProjectName(prompt: string, brief?: string): string {
  const source = brief ?? prompt;
  const briefMatch = source.match(/Project name[:\s]+([^\n,]+)/i);
  if (briefMatch?.[1]) return briefMatch[1].trim();

  const current = prompt.match(/\[Current message\]\n([^,\n]+)/)?.[1]?.trim();
  if (current && current.length >= 2 && current.length < 60) return current;

  const coffee = prompt.match(/\b(build|create|make)\s+(?:a\s+)?(.+?)\s+(website|site|shop)/i);
  if (coffee?.[2]) return `${coffee[2].trim()} Website`;

  return 'My Website';
}

/** Parse design theme from user answer or brief. */
export function parseDesignTheme(prompt: string, brief?: string): string {
  const source = `${brief ?? ''} ${prompt}`;
  const themeMatch = source.match(
    /\b(warm\s+[\w\s&]+|minimalist\s+[\w/]+|dark\s+theme|light\s+theme|colorful|black\/white)[^,\n]*/i
  );
  if (themeMatch?.[0]) return themeMatch[0].trim();

  const colorWords = source.match(/\b(brown|gold|blue|green|pastel|neon|modern|elegant)\b[^,\n]*/i);
  if (colorWords?.[0]) return colorWords[0].trim();

  return 'Modern, clean design';
}

/** Parse whether user wants online ordering / payments. */
export function parseNeedsPayment(prompt: string, brief?: string): boolean {
  const source = `${brief ?? ''} ${prompt}`.toLowerCase();
  if (/\b(no payment|without payment|no ordering)\b/.test(source)) return false;
  if (/\b(yes|ordering|payment|stripe|checkout|cart)\b/.test(source)) return true;
  return false;
}

/** True when user answered name + colors + payment (beginner 3-question flow). */
export function hasClarifiedBuildBrief(prompt: string): boolean {
  if (/Fully Clarified Project Brief/i.test(prompt)) return true;

  const lower = prompt.toLowerCase();
  if (/\b(use defaults|just build|go ahead|proceed|build it now)\b/i.test(lower)) {
    return true;
  }

  const currentMsg = prompt.match(/\[Current message\]\n([\s\S]+)$/)?.[1]?.trim() ?? prompt.trim();

  const hasColors =
    /\b(brown|gold|dark|light|colorful|black|white|blue|green|warm|minimal|vibrant|pastel|theme)\b/i.test(
      lower
    );
  const hasPaymentAnswer =
    /\b(yes|no)\b/i.test(currentMsg) || /\b(ordering|payment|stripe|checkout)\b/i.test(lower);
  const hasName =
    currentMsg.length >= 4 &&
    (currentMsg.includes(',') || /\b(called|named)\b/i.test(currentMsg) || currentMsg.split(/\s+/).length >= 2);

  if (/\[Previous conversation for context/i.test(prompt)) {
    return (hasName && hasColors) || (hasColors && hasPaymentAnswer);
  }

  return hasName && hasColors && hasPaymentAnswer;
}

export function isWebsiteBuildPrompt(prompt: string, category?: string): boolean {
  if (category === 'landing_page') return true;
  return /\b(website|web\s*page|landing|site|coffee|shop|store|restaurant|bakery|crm|dashboard|saas|marketplace|crypto|blockchain|web3|defi|nft|wallet|chatbot|chat\s*bot|software|app|api|tool|platform|dapp|exchange)\b/i.test(
    prompt
  );
}

/** Build summary metadata from brief and plan for the summary card. */
export function buildSummaryFromBrief(
  prompt: string,
  brief: string,
  liveUrl?: string,
  repoUrl?: string,
  memoryNote?: string
): BuildSummaryData {
  const projectName = parseProjectName(prompt, brief);
  const designTheme = parseDesignTheme(prompt, brief);
  const needsPayment = parseNeedsPayment(prompt, brief);

  const pages = ['Home', 'Menu', 'Gallery', 'Contact'];
  if (needsPayment) pages.splice(2, 0, 'Order');

  const features = ['Responsive design', designTheme];
  if (needsPayment) features.unshift('Online ordering');

  return {
    projectName,
    pages,
    features,
    designTheme,
    liveUrl,
    repoUrl,
    memoryNote,
    needsPayment,
  };
}
