/** Pre-generation safety filter — blocks prohibited content before any API call */

const NUDE_PATTERNS =
  /\b(nude|naked|nsfw|porn|pornographic|xxx|sexual|erotic|hentai|vulgar|explicit sex|genitals|topless|bottomless|undressed|strip tease|onlyfans)\b/i;

const PROPHET_GOD_PATTERNS =
  /\b(prophet\s+muhammad|muhammad\s+s\.?a\.?w|mohammed\s+s\.?a\.?w|depict(ion|ing)?\s+of\s+(the\s+)?prophet|image\s+of\s+(the\s+)?prophet|picture\s+of\s+(the\s+)?prophet|draw\s+(the\s+)?prophet|prophet\s+isa\b|prophet\s+musa\b|god\s+face|face\s+of\s+god|depict(ion|ing)?\s+of\s+god|allah\s+face|jesus\s+portrait|christ\s+portrait|religious\s+figure\s+depiction)\b/i;

const RELIGIOUS_NAME_ONLY =
  /\b(muhammad|mohammed|mohamed)\s+s\.?a\.?w\.?\b/i;

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  sanitizedPrompt?: string;
  blockedCategory?: 'nude' | 'prophet' | 'religious';
}

export function moderateImagePrompt(prompt: string): ModerationResult {
  const text = prompt.trim();
  if (!text) return { allowed: false, reason: 'Please describe what you want to generate.' };

  if (NUDE_PATTERNS.test(text)) {
    return {
      allowed: false,
      blockedCategory: 'nude',
      reason:
        'Xroga cannot generate nude, sexual, or explicit content. Please request a safe-for-work image instead.',
    };
  }

  if (PROPHET_GOD_PATTERNS.test(text) || RELIGIOUS_NAME_ONLY.test(text)) {
    return {
      allowed: false,
      blockedCategory: 'prophet',
      reason:
        'Xroga does not generate images of prophets, religious figures, or deities. We respect all faiths — please request a different subject.',
    };
  }

  if (/\b(god|allah|deity|divine being)\b/i.test(text) && /\b(image|picture|portrait|draw|generate|depict)/i.test(text)) {
    return {
      allowed: false,
      blockedCategory: 'religious',
      reason: 'Xroga does not generate depictions of God or deities. Please choose another subject.',
    };
  }

  return { allowed: true, sanitizedPrompt: enhancePublicFigurePrompt(text) };
}

function enhancePublicFigurePrompt(prompt: string): string {
  const lower = prompt.toLowerCase();

  const pakistaniLeaders = ['shahbaz sharif', 'shabaz sharif', 'shehbaz sharif', 'imran khan', 'asif ali zardari'];
  for (const name of pakistaniLeaders) {
    if (lower.includes(name)) {
      return `${prompt}. Official photorealistic news portrait, accurate facial likeness of ${name}, Pakistani politician, professional press photo, correct identity, green Pakistani flag in background if appropriate, ultra realistic, not cartoon, not AI-looking`;
    }
  }

  if (/\bthumbnail\b/i.test(prompt) || /\byoutube\b/i.test(prompt)) {
    return `${prompt}. Professional YouTube thumbnail, bold composition, high contrast, click-worthy, 16:9, sharp text-safe areas, photorealistic, cinematic lighting`;
  }

  if (/\b(superhero|iron man|batman|spider-?man|superman|wonder woman|captain america|thor|hulk)\b/i.test(prompt)) {
    return `${prompt}. Official cinematic movie still, photorealistic, accurate costume and character design, dramatic lighting, Marvel/DC film quality, not cartoon`;
  }

  return `${prompt}. Photorealistic, natural lighting, real camera photograph style, high detail, not AI art style, not illustration`;
}
