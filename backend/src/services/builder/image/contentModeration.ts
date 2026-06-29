/** Pre-generation safety filter — blocks prohibited content before any API call */

const NUDE_PATTERNS =
  /\b(nude|naked|nsfw|porn|pornographic|xxx|sexual|erotic|hentai|vulgar|explicit sex|genitals|topless|bottomless|undressed|strip tease|onlyfans|adult content|x-?rated|lewd|obscene|fetish|bondage)\b/i;

const SUGGESTIVE_PATTERNS =
  /\b(swimsuit|bikini|lingerie|underwear|bra\b|panties|thong|cleavage|see-?through|sheer outfit|micro bikini|wet t-?shirt|no clothes|without clothes|in bed|seductive|provocative|sensual pose|hot girl|sexy girl|sexy woman|tight dress|tight clothes|tight outfit|revealing outfit|skimpy|barely dressed|boobs|breasts exposed|ass exposed|butt naked)\b/i;

const PROPHET_GOD_PATTERNS =
  /\b(prophet\s+muhammad|muhammad\s+s\.?a\.?w|mohammed\s+s\.?a\.?w|depict(ion|ing)?\s+of\s+(the\s+)?prophet|image\s+of\s+(the\s+)?prophet|picture\s+of\s+(the\s+)?prophet|draw\s+(the\s+)?prophet|prophet\s+isa\b|prophet\s+musa\b|god\s+face|face\s+of\s+god|depict(ion|ing)?\s+of\s+god|allah\s+face|jesus\s+portrait|christ\s+portrait|religious\s+figure\s+depiction)\b/i;

const RELIGIOUS_NAME_ONLY =
  /\b(muhammad|mohammed|mohamed)\s+s\.?a\.?w\.?\b/i;

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  sanitizedPrompt?: string;
  blockedCategory?: 'nude' | 'suggestive' | 'prophet' | 'religious';
}

export function moderateImagePrompt(prompt: string): ModerationResult {
  const text = prompt.trim();
  if (!text) return { allowed: false, reason: 'Please describe what you want to generate.' };

  if (NUDE_PATTERNS.test(text)) {
    return {
      allowed: false,
      blockedCategory: 'nude',
      reason:
        'Xroga cannot generate nude, sexual, or adult content. Please request a safe-for-work image instead.',
    };
  }

  if (SUGGESTIVE_PATTERNS.test(text)) {
    return {
      allowed: false,
      blockedCategory: 'suggestive',
      reason:
        'Xroga cannot generate suggestive, revealing, or swimwear-focused images. Please request modest, professional, or family-safe imagery.',
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

  return { allowed: true, sanitizedPrompt: enhanceSafePrompt(text) };
}

function enhanceSafePrompt(prompt: string): string {
  const lower = prompt.toLowerCase();
  const safeSuffix =
    'Family-safe, modest professional attire, fully clothed, no nudity, no swimwear, no lingerie, no suggestive poses, photorealistic, natural lighting';

  const pakistaniLeaders = ['shahbaz sharif', 'shabaz sharif', 'shehbaz sharif', 'imran khan', 'asif ali zardari'];
  for (const name of pakistaniLeaders) {
    if (lower.includes(name)) {
      return `${prompt}. Official photorealistic news portrait, accurate facial likeness of ${name}, Pakistani politician, professional press photo, correct identity, green Pakistani flag in background if appropriate, ultra realistic, not cartoon, not AI-looking. ${safeSuffix}`;
    }
  }

  if (/\bthumbnail\b/i.test(prompt) || /\byoutube\b/i.test(prompt)) {
    return `${prompt}. Professional YouTube thumbnail, bold composition, high contrast, click-worthy, 16:9, sharp text-safe areas, photorealistic, cinematic lighting. ${safeSuffix}`;
  }

  if (/\b(superhero|iron man|batman|spider-?man|superman|wonder woman|captain america|thor|hulk)\b/i.test(prompt)) {
    return `${prompt}. Official cinematic movie still, photorealistic, accurate costume and character design, dramatic lighting, Marvel/DC film quality, not cartoon. ${safeSuffix}`;
  }

  return `${prompt}. ${safeSuffix}`;
}

export type ImageAspectFormat = '1:1' | '4:5' | '16:9' | '9:16' | '3:4' | '4:3';

/** Parse desired output format from prompt — default Instagram post (1:1) */
export function parseImageAspectFormat(prompt: string): ImageAspectFormat {
  const p = prompt.toLowerCase();
  if (/\b(story|reel|tiktok|vertical video|9:16|9\s*:\s*16)\b/.test(p)) return '9:16';
  if (/\b(youtube|banner|landscape|16:9|16\s*:\s*9|widescreen)\b/.test(p)) return '16:9';
  if (/\b(portrait|3:4|3\s*:\s*4|pinterest)\b/.test(p)) return '3:4';
  if (/\b(4:3|4\s*:\s*3)\b/.test(p)) return '4:3';
  if (/\b(4:5|4\s*:\s*5|instagram portrait)\b/.test(p)) return '4:5';
  if (/\b(square|1:1|1\s*:\s*1|post|instagram post|ig post)\b/.test(p)) return '1:1';
  return '1:1';
}

export function aspectFormatLabel(format: ImageAspectFormat): string {
  const labels: Record<ImageAspectFormat, string> = {
    '1:1': 'Post (1:1)',
    '4:5': 'Portrait post (4:5)',
    '16:9': 'Landscape (16:9)',
    '9:16': 'Story (9:16)',
    '3:4': 'Portrait (3:4)',
    '4:3': 'Standard (4:3)',
  };
  return labels[format];
}

export function aspectFormatPromptSuffix(format: ImageAspectFormat): string {
  const map: Record<ImageAspectFormat, string> = {
    '1:1': 'Square composition, Instagram post format 1:1 aspect ratio',
    '4:5': 'Vertical Instagram portrait post, 4:5 aspect ratio',
    '16:9': 'Wide landscape banner, 16:9 aspect ratio',
    '9:16': 'Vertical story format, 9:16 aspect ratio, mobile-first',
    '3:4': 'Portrait orientation, 3:4 aspect ratio',
    '4:3': 'Classic photo orientation, 4:3 aspect ratio',
  };
  return map[format];
}
