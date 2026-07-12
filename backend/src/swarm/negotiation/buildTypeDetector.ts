/** Detect what kind of project the user wants Xroga to build. */

export type BuildProjectType =
  | 'website'
  | 'game'
  | 'software'
  | 'app'
  | 'api'
  | 'crypto'
  | 'chatbot'
  | 'saas'
  | 'dashboard'
  | 'marketplace'
  | 'automation';

const BUILD_VERB = /\b(build|create|make|develop|launch|design|scaffold|generate)\b/i;

const CRYPTO_TRIGGERS =
  /\b(crypto|blockchain|web3|defi|nft|token|wallet|dao|dapp|exchange|swap|bridge|staking|solidity|solana|ethereum|metamask|phantom|uniswap|jupiter|hackathon)\b/i;

const CHATBOT_TRIGGERS =
  /\b(chatbot|chat bot|ai assistant|ai agent|gpt|deepseek|cursor|coding agent|conversational ai|support bot|customer support bot|slack bot|discord bot|telegram bot|whatsapp bot|claude)\b/i;

const SAAS_TRIGGERS =
  /\b(saas|subscription|billing|paddle|stripe|enterprise|multi-tenant|onboarding|workspace)\b/i;

const DASHBOARD_TRIGGERS =
  /\b(dashboard|analytics|charts|kpi|metrics|admin panel|crm|hr dashboard|inventory|help desk)\b/i;

const MARKETPLACE_TRIGGERS = /\b(marketplace|multi-vendor|listing|booking platform|job board|course platform|membership)\b/i;

const AUTOMATION_TRIGGERS =
  /\b(automation|browser automation|scrape|workflow|zapier|playwright|email automation|data processing)\b/i;

const GAME_TRIGGERS =
  /\b(build|create|make|develop|code|design|prototype)\b[\s\S]{0,60}\b(game|pygame|phaser|unity|godot|platformer|rpg|arcade|puzzle game|deckbuilder)\b/i;

const GAME_IDEA =
  /\b(game idea|let'?s make a game|i want to (?:build|make|code) a game|game dev|help me make a game)\b/i;

const SOFTWARE_TRIGGERS =
  /\b(software|desktop app|cli tool|python script|tool|debugger|code builder|file converter|link shortener|invoice generator|time tracker|expense tracker)\b/i;

const APP_TRIGGERS =
  /\b(mobile app|react native|flutter app|ios app|android app|meditation app|health tracker|fitness|food delivery|travel app|event app)\b/i;

const API_TRIGGERS =
  /\b(api|rest api|graphql|backend|microservice|fastapi|express api)\b/i;

const WEBSITE_TRIGGERS =
  /\b(website|web\s*page|landing\s*page|site|store|shop|portfolio|homepage|blog|forum|messaging|social platform|video platform|image generation|coming soon|event page)\b/i;

const NICHE_BUSINESS =
  /\b(coffee|restaurant|bakery|salon|spa|gym|clinic|dental|lawyer|real estate|hotel|agency|nonprofit|church|school|ecommerce|boutique|barber|plumber|roofing|cleaning|photography|wedding|fitness|yoga|pet|veterinary|auto repair|construction|consulting|startup)\b/i;

export function detectBuildProjectType(prompt: string): BuildProjectType {
  if (CRYPTO_TRIGGERS.test(prompt)) return 'crypto';
  if (CHATBOT_TRIGGERS.test(prompt)) return 'chatbot';
  if (AUTOMATION_TRIGGERS.test(prompt)) return 'automation';
  if (MARKETPLACE_TRIGGERS.test(prompt)) return 'marketplace';
  if (DASHBOARD_TRIGGERS.test(prompt)) return 'dashboard';
  if (SAAS_TRIGGERS.test(prompt)) return 'saas';
  if (GAME_TRIGGERS.test(prompt) || GAME_IDEA.test(prompt) || (/\bgame\b/.test(prompt.toLowerCase()) && BUILD_VERB.test(prompt))) {
    return 'game';
  }
  if (API_TRIGGERS.test(prompt)) return 'api';
  if (APP_TRIGGERS.test(prompt)) return 'app';
  if (SOFTWARE_TRIGGERS.test(prompt)) return 'software';
  if (WEBSITE_TRIGGERS.test(prompt) || NICHE_BUSINESS.test(prompt)) return 'website';
  if (BUILD_VERB.test(prompt)) return 'website';
  return 'website';
}

export function isGameBuildPrompt(prompt: string): boolean {
  return detectBuildProjectType(prompt) === 'game';
}

export function isGamePhaseContinuation(prompt: string): boolean {
  const t = routingPromptLocal(prompt);
  return (
    /\b(next|continue|next phase|keep going|phase\s+\d+|yes.*start|build phase)\b/i.test(t) ||
    /\bNEXT\b/.test(prompt)
  );
}

export function isGameInterviewAnswer(prompt: string): boolean {
  const t = routingPromptLocal(prompt);
  if (t.length < 20) return false;
  if (GAME_TRIGGERS.test(t) && !/\b(favorite|genre|2d|3d|comfort)\b/i.test(t)) return false;
  return (
    /\b(favorite game|genre|2d|3d|platformer|rpg|puzzle|action|strategy|browser|python|pygame|beginner|experienced)\b/i.test(
      t
    ) || (t.includes(',') && t.split(',').length >= 2)
  );
}

export function hasGameBuildContext(prompt: string): boolean {
  return (
    /\[Previous conversation for context/i.test(prompt) ||
    /GAME DESIGN DOC|Dream Pitch|Phase 0|Phase 1.*Bare Bones|🎮|game alchemist/i.test(prompt) ||
    isGamePhaseContinuation(prompt) ||
    isGameInterviewAnswer(prompt)
  );
}

export function needsGameDreamInterview(_prompt: string): boolean {
  return false;
}

function routingPromptLocal(prompt: string): string {
  const idx = prompt.indexOf('[Current message]');
  if (idx === -1) return prompt.trim();
  return prompt.slice(idx + '[Current message]'.length).trim();
}
