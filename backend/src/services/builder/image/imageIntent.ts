/** Detect image content type, style vibe, and aspect from user prompts */

import type { ImageAspectFormat } from './contentModeration.js';

export type ImageStyleVibe =
  | 'photorealistic'
  | '3d'
  | 'pixel'
  | 'minecraft'
  | 'cartoon'
  | 'anime'
  | 'logo'
  | 'illustration'
  | 'general';

export type ImageContentType =
  | 'thumbnail'
  | 'logo'
  | 'avatar'
  | 'og'
  | 'post'
  | 'story'
  | 'banner'
  | 'wallpaper'
  | 'general';

export interface ParsedImageIntent {
  aspectFormat: ImageAspectFormat;
  contentType: ImageContentType;
  styleVibe: ImageStyleVibe;
}

export function parseImageContentType(prompt: string): ImageContentType {
  const p = prompt.toLowerCase();
  if (/\b(youtube|thumbnail|thumb|video cover|yt thumb)\b/.test(p)) return 'thumbnail';
  if (/\b(logo|brand mark|brand logo|logotype|wordmark|icon design)\b/.test(p)) return 'logo';
  if (/\b(avatar|profile pic|profile picture|pfp|headshot|user photo)\b/.test(p)) return 'avatar';
  if (/\b(og image|open graph|social preview|link preview|meta image)\b/.test(p)) return 'og';
  if (/\b(story|reel|tiktok|shorts)\b/.test(p)) return 'story';
  if (/\b(wallpaper|phone background|mobile background)\b/.test(p)) return 'wallpaper';
  if (/\b(banner|cover photo|header image|facebook cover|twitter header|linkedin banner)\b/.test(p)) return 'banner';
  if (/\b(instagram post|ig post|social post|feed post)\b/.test(p)) return 'post';
  return 'general';
}

export function parseImageStyleVibe(prompt: string): ImageStyleVibe {
  const p = prompt.toLowerCase();
  if (/\b(logo|logotype|brand mark|minimal logo|modern logo)\b/.test(p)) return 'logo';
  if (/\b(minecraft|blocky|voxel|cube world)\b/.test(p)) return 'minecraft';
  if (/\b(pixel art|pixelated|8-?bit|retro game|16-?bit)\b/.test(p)) return 'pixel';
  if (/\b(3d render|3d model|pixar|blender|cinema 4d|octane)\b/.test(p)) return '3d';
  if (/\b(cartoon|disney|animated|toon|comic style)\b/.test(p)) return 'cartoon';
  if (/\b(anime|manga|ghibli|cel shaded)\b/.test(p)) return 'anime';
  if (/\b(illustration|vector|flat design|digital art)\b/.test(p)) return 'illustration';
  if (/\b(photorealistic|photo realistic|hyperreal|cinematic photo|dslr)\b/.test(p)) return 'photorealistic';
  return 'general';
}

/** Refine aspect using content type when user did not specify ratio explicitly */
export function resolveAspectFormat(prompt: string, base: ImageAspectFormat): ImageAspectFormat {
  const p = prompt.toLowerCase();
  const hasExplicitRatio =
    /\b(1:1|4:5|16:9|9:16|3:4|4:3|square|portrait|landscape|widescreen)\b/.test(p);

  if (hasExplicitRatio) return base;

  const content = parseImageContentType(prompt);
  switch (content) {
    case 'thumbnail':
    case 'og':
    case 'banner':
      return '16:9';
    case 'story':
    case 'wallpaper':
      return '9:16';
    case 'logo':
    case 'avatar':
      return '1:1';
    case 'post':
      return /\b(portrait|4:5)\b/.test(p) ? '4:5' : '1:1';
    default:
      return base;
  }
}

export function parseFullImageIntent(prompt: string, aspectFromPrompt: ImageAspectFormat): ParsedImageIntent {
  return {
    aspectFormat: resolveAspectFormat(prompt, aspectFromPrompt),
    contentType: parseImageContentType(prompt),
    styleVibe: parseImageStyleVibe(prompt),
  };
}

export function contentTypeLabel(type: ImageContentType): string {
  const labels: Record<ImageContentType, string> = {
    thumbnail: 'YouTube Thumbnail',
    logo: 'Logo',
    avatar: 'Avatar',
    og: 'OG / Social Preview',
    post: 'Social Post',
    story: 'Story / Reel',
    banner: 'Banner',
    wallpaper: 'Mobile Wallpaper',
    general: 'Image',
  };
  return labels[type];
}

export function styleVibePromptSuffix(vibe: ImageStyleVibe): string {
  const map: Record<ImageStyleVibe, string> = {
    photorealistic: 'Photorealistic, ultra detailed, natural lighting, DSLR quality, sharp focus',
    '3d': '3D rendered, volumetric lighting, soft shadows, Pixar-quality 3D art, depth and dimension',
    pixel: 'Pixel art style, crisp pixels, retro game aesthetic, limited color palette, 8-bit charm',
    minecraft: 'Minecraft voxel style, blocky cubic world, game screenshot aesthetic, vibrant blocks',
    cartoon: 'Cartoon illustration, bold outlines, vibrant colors, playful animated style',
    anime: 'Anime art style, cel shading, expressive eyes, manga-inspired composition',
    logo: 'Modern minimalist logo design, clean vector shapes, professional branding, flat design, centered on plain background',
    illustration: 'Digital illustration, artistic composition, stylized rendering, creative flair',
    general: 'High quality, detailed, professional composition',
  };
  return map[vibe];
}

export function contentTypePromptSuffix(type: ImageContentType, overlayText?: string): string {
  const textPart = overlayText
    ? ` Bold readable text "${overlayText}" prominently displayed, high contrast lettering.`
    : '';
  const map: Record<ImageContentType, string> = {
    thumbnail: `Professional YouTube thumbnail, click-worthy, high contrast, dramatic composition.${textPart}`,
    logo: 'Clean logo on solid or gradient background, scalable brand mark, no clutter, professional identity design.',
    avatar: 'Profile picture, centered face or character, clean background, social media ready, friendly and recognizable.',
    og: 'Open Graph social share image, bold headline area, clean layout for link previews, readable at small sizes.',
    post: 'Instagram-style social media post, eye-catching feed composition, balanced layout.',
    story: 'Vertical mobile story format, bold focal point, swipe-stopping visual.',
    banner: 'Wide banner header, text-safe zones, professional cover image layout.',
    wallpaper: 'Mobile phone wallpaper, vertical composition, aesthetic and immersive.',
    general: 'Polished finished artwork, balanced composition.',
  };
  return map[type];
}
