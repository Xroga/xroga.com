/** Detect what kind of project the user wants DeepSeek Code to build. */

export type BuildProjectType = 'website' | 'game' | 'software' | 'app' | 'api';

const GAME_TRIGGERS =
  /\b(build|create|make|develop|code|design|prototype)\b[\s\S]{0,60}\b(game|pygame|phaser|unity|godot|platformer|rpg|arcade|puzzle game|deckbuilder)\b/i;

const GAME_IDEA =
  /\b(game idea|let'?s make a game|i want to (?:build|make|code) a game|game dev|help me make a game)\b/i;

const SOFTWARE_TRIGGERS =
  /\b(build|create|make|develop)\b[\s\S]{0,60}\b(software|desktop app|cli tool|python script|automation tool|saas|dashboard app)\b/i;

const APP_TRIGGERS =
  /\b(build|create|make|develop)\b[\s\S]{0,60}\b(mobile app|react native|flutter app|ios app|android app)\b/i;

const API_TRIGGERS =
  /\b(build|create|make|develop)\b[\s\S]{0,60}\b(api|rest api|graphql|backend|microservice|fastapi|express api)\b/i;

const WEBSITE_TRIGGERS =
  /\b(build|create|make|design|develop)\b[\s\S]{0,80}\b(website|web\s*page|landing\s*page|site|store|shop|portfolio|homepage)\b/i;

const NICHE_BUSINESS =
  /\b(build|create|make)\b[\s\S]{0,50}\b(coffee|restaurant|bakery|salon|spa|gym|clinic|dental|lawyer|real estate|hotel|agency|nonprofit|church|school|portfolio|ecommerce|boutique|barber|plumber|roofing|cleaning|photography|wedding|fitness|yoga|pet|veterinary|auto repair|construction|consulting|startup|saas)\b/i;

export function detectBuildProjectType(prompt: string): BuildProjectType {
  const t = prompt.toLowerCase();
  if (GAME_TRIGGERS.test(prompt) || GAME_IDEA.test(prompt) || /\bgame\b/.test(t) && /\b(build|create|make)\b/.test(t)) {
    return 'game';
  }
  if (API_TRIGGERS.test(prompt)) return 'api';
  if (APP_TRIGGERS.test(prompt)) return 'app';
  if (SOFTWARE_TRIGGERS.test(prompt)) return 'software';
  if (WEBSITE_TRIGGERS.test(prompt) || NICHE_BUSINESS.test(prompt)) return 'website';
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

function hasThreadWrapper(prompt: string): boolean {
  return /\[Previous conversation for context/i.test(prompt);
}

function routingPromptLocal(prompt: string): string {
  const idx = prompt.indexOf('[Current message]');
  if (idx === -1) return prompt.trim();
  return prompt.slice(idx + '[Current message]'.length).trim();
}
