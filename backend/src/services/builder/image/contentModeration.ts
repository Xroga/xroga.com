/** Pre-generation safety filter — blocks prohibited content before any API call */

import { IMAGE_SAFETY_GUIDANCE } from './imageSafetyMessages.js';
import { extractOverlayText } from './concisePrompt.js';

const NUDE_PATTERNS =
  /\b(nude|naked|nsfw|porn|pornographic|xxx|sexual|erotic|hentai|vulgar|explicit sex|genitals|topless|bottomless|undressed|strip tease|onlyfans|adult content|x-?rated|lewd|obscene|fetish|bondage|intercourse|orgasm|masturbat)\b/i;

const ADULTERY_PATTERNS =
  /\b(adult(ery|erous)?|zina|fornicat|cheating (wife|husband|spouse)|affair with|mistress|lover in bed|illicit (relation|relationship)|haram (relation|relationship)|shameful (act|deed)|immoral (act|scene)|sinful (couple|scene))\b/i;

const SUGGESTIVE_PATTERNS =
  /\b(swimsuit|bikini|lingerie|underwear|bra\b|panties|thong|cleavage|see-?through|sheer outfit|micro bikini|wet t-?shirt|no clothes|without clothes|in bed|seductive|provocative|sensual pose|hot girl|sexy girl|sexy woman|tight dress|tight clothes|tight outfit|revealing outfit|skimpy|barely dressed|boobs|breasts exposed|ass exposed|butt naked|kissing passionately|making out|intimate couple|bedroom scene|miniskirt|mini skirt|short skirt|schoolgirl|waifu|anime girl|anime woman|magical girl|catgirl|bunny girl|maid outfit|crop top|midriff|bare legs|bare thighs|thigh gap|low cut|deep neckline|exposed chest|large breasts|big boobs|voluptuous|curvy body|pin-?up|ecchi|hentai girl|fanservice)\b/i;

/** Female anime/character requests that often produce immodest output — require family-safe redirect */
const ANIME_FEMALE_CHARACTER =
  /\b(anime\s+(girl|woman|female|lady)|waifu|schoolgirl|magical\s+girl|cat\s*girl|bunny\s+girl|girl\s+in\s+(skirt|dress|uniform)|woman\s+in\s+(skirt|dress|uniform)|female\s+anime\s+character)\b/i;

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

  if (NUDE_PATTERNS.test(text) || ADULTERY_PATTERNS.test(text)) {
    return {
      allowed: false,
      blockedCategory: 'nude',
      reason: `${IMAGE_SAFETY_GUIDANCE.title}. ${IMAGE_SAFETY_GUIDANCE.quranReference}: "${IMAGE_SAFETY_GUIDANCE.quranTranslation}" Xroga does not generate nude, sexual, adulterous, or adult content. Shaitan beautifies such acts — please request a modest, family-safe image instead.`,
    };
  }

  if (SUGGESTIVE_PATTERNS.test(text)) {
    return {
      allowed: false,
      blockedCategory: 'suggestive',
      reason: `${IMAGE_SAFETY_GUIDANCE.title}. ${IMAGE_SAFETY_GUIDANCE.quranReference}: "${IMAGE_SAFETY_GUIDANCE.quranTranslation}" Xroga cannot generate suggestive, revealing, or swimwear-focused images. Please request modest, professional, or family-safe imagery.`,
    };
  }

  if (ANIME_FEMALE_CHARACTER.test(text)) {
    return {
      allowed: false,
      blockedCategory: 'suggestive',
      reason:
        'Xroga does not generate anime girls, waifu, schoolgirl, or other female character images that may be immodest. Try: anime landscape, mecha, Ben 10 aliens, cartoon action scene, or a modest professional portrait instead.',
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
  const anatomySuffix =
    'Correct human anatomy, exactly two hands with five fingers each, exactly two feet, no extra limbs, no duplicated body parts, no deformities';
  const safeSuffix =
    `Family-safe, modest professional attire, fully clothed, no nudity, no swimwear, no lingerie, no suggestive poses, photorealistic, natural lighting. ${anatomySuffix}`;

  if (/\bben\s*10\b|\bomnitrix\b|\bheatblast\b|\bfour\s*arms\b|\bdiamondhead\b|\bwildmutt\b|\bxlr8\b|\bgrey\s*matter\b|\bupgrade\b|\bghostfreak\b|\bripjaws\b|\bstinkfly\b/i.test(prompt)) {
    return `${prompt}. Cartoon Network Ben 10 animation style, accurate Ben 10 character or Omnitrix alien design, vibrant cel-shaded colors, dynamic action pose, family-friendly adventure scene, clean linework. ${safeSuffix}`;
  }

  if (/\banime\b/i.test(prompt) && !/\b(girl|woman|female|waifu|schoolgirl|skirt|bikini)\b/i.test(prompt)) {
    return `${prompt}. High-quality anime art style, Studio Ghibli / modern anime aesthetic, detailed backgrounds, family-safe, no suggestive content, landscape or character in modest full clothing. ${anatomySuffix}`;
  }

  const pakistaniLeaders = ['shahbaz sharif', 'shabaz sharif', 'shehbaz sharif', 'imran khan', 'asif ali zardari'];
  for (const name of pakistaniLeaders) {
    if (lower.includes(name)) {
      return `${prompt}. Official photorealistic news portrait, accurate facial likeness of ${name}, Pakistani politician, professional press photo, correct identity, green Pakistani flag in background if appropriate, ultra realistic, not cartoon, not AI-looking. ${safeSuffix}`;
    }
  }

  if (/\bthumbnail\b/i.test(prompt) || /\byoutube\b/i.test(prompt)) {
    const overlay = extractOverlayText(prompt);
    const textPart = overlay
      ? ` Large bold readable text overlay "${overlay}" prominently displayed, high contrast lettering, text-safe layout.`
      : ' Clear text-safe areas for bold title text.';
    return `${prompt}. Professional YouTube thumbnail, bold composition, high contrast, click-worthy, 16:9, sharp details, photorealistic, cinematic lighting.${textPart} ${safeSuffix}`;
  }

  if (/\b(superhero|iron man|batman|spider-?man|superman|wonder woman|captain america|thor|hulk)\b/i.test(prompt)) {
    return `${prompt}. Official cinematic movie still, photorealistic, accurate costume and character design, dramatic lighting, Marvel/DC film quality, not cartoon. ${safeSuffix}`;
  }

  const flagMatch =
    prompt.match(/\b(?:flag of|national flag of|country flag of)\s+([a-z][a-z\s-]{1,40})/i) ??
    prompt.match(/\b([a-z][a-z\s-]{1,30})\s+(?:national\s+)?flag\b/i) ??
    (/\bflag\b/i.test(prompt) && /\bpakistan\b/i.test(prompt) ? ['', 'pakistan'] : null) ??
    (/\bflag\b/i.test(prompt) && /\bpalestine\b/i.test(prompt) ? ['', 'palestine'] : null);
  if (flagMatch) {
    const country = flagMatch[1].trim().toLowerCase();
    const spec = NATIONAL_FLAG_SPECS[country] ?? NATIONAL_FLAG_SPECS[country.replace(/\s+/g, ' ')];
    if (spec) {
      return `Official national flag of ${spec.name}. ${spec.description} Accurate official colors and proportions, entire flag visible, centered, flat vector clarity, no wrong country, no extra symbols. ${safeSuffix}`;
    }
    return `${prompt}. Official accurate national flag of ${flagMatch[1].trim()}, correct colors symbols and proportions, entire flag visible, centered, photorealistic fabric texture optional. ${safeSuffix}`;
  }

  return `${prompt}. ${safeSuffix}`;
}

const NATIONAL_FLAG_SPECS: Record<string, { name: string; description: string }> = {
  pakistan: {
    name: 'Pakistan',
    description:
      'Green field (#01411C) with white vertical stripe at the hoist (one-quarter width), white crescent moon and five-pointed star in the green field, official Pakistan flag layout.',
  },
  palestine: {
    name: 'Palestine',
    description:
      'Black, white, and green horizontal stripes with red triangle at the hoist, official Palestine flag.',
  },
  turkey: {
    name: 'Turkey',
    description: 'Red field with white crescent moon and star, official Turkey flag.',
  },
  'united states': {
    name: 'United States',
    description: 'Stars and stripes, 50 white stars on blue canton, 13 red and white stripes, official US flag.',
  },
  usa: {
    name: 'United States',
    description: 'Stars and stripes, 50 white stars on blue canton, 13 red and white stripes, official US flag.',
  },
  india: {
    name: 'India',
    description: 'Saffron, white, green horizontal stripes with navy blue Ashoka Chakra in center, official India flag.',
  },
  'saudi arabia': {
    name: 'Saudi Arabia',
    description: 'Green field with white Arabic shahada and sword, official Saudi Arabia flag.',
  },
};

export type ImageAspectFormat = '1:1' | '4:5' | '16:9' | '9:16' | '3:4' | '4:3';

/** Parse desired output format from prompt — default Instagram post (1:1) */
export function parseImageAspectFormat(prompt: string): ImageAspectFormat {
  const p = prompt.toLowerCase();
  if (/\b(story|reel|tiktok|vertical video|9:16|9\s*:\s*16|mobile wallpaper|phone wallpaper)\b/.test(p)) return '9:16';
  if (/\b(youtube|thumbnail|banner|landscape|16:9|16\s*:\s*9|widescreen|og image|open graph|cover photo|header image|facebook cover|twitter header)\b/.test(p)) return '16:9';
  if (/\b(portrait|3:4|3\s*:\s*4|pinterest)\b/.test(p)) return '3:4';
  if (/\b(4:3|4\s*:\s*3)\b/.test(p)) return '4:3';
  if (/\b(4:5|4\s*:\s*5|instagram portrait)\b/.test(p)) return '4:5';
  if (/\b(square|1:1|1\s*:\s*1|post|instagram post|ig post|logo|avatar|profile pic|pfp)\b/.test(p)) return '1:1';
  return '1:1';
}

export function aspectFormatLabel(format: ImageAspectFormat): string {
  const labels: Record<ImageAspectFormat, string> = {
    '1:1': 'Post (1:1)',
    '4:5': 'Portrait post (4:5)',
    '16:9': 'YouTube Thumbnail (16:9)',
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
    '16:9': 'YouTube thumbnail, wide horizontal 16:9 landscape banner, NOT square, cinematic widescreen composition',
    '9:16': 'Vertical story format, 9:16 aspect ratio, mobile-first',
    '3:4': 'Portrait orientation, 3:4 aspect ratio',
    '4:3': 'Classic photo orientation, 4:3 aspect ratio',
  };
  return map[format];
}
