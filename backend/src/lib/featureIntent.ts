import type { FeatureCategory } from '../types/features.js';
import { routingPrompt } from './promptRouting.js';

/** Strong intent detection — never route these through text-only chat */

const IMAGE_EDIT_INTENT = /\[Image(?:\s+Edit)?\]/i;

const IMAGE_INTENT =
  /\b(generate|create|make|draw|design)\b[\s\S]{0,40}\b(image|picture|logo|illustration|artwork|poster|thumbnail|graphic|photo|avatar|icon)\b|\bimage\s+of\b/i;

/** Video removed — detect so we can decline politely (not route to production) */
export const VIDEO_INTENT =
  /\b(generate|create|make|produce|film|shoot|animate|turn)\b[\s\S]{0,60}\b(video|movie|film|trailer|clip|animation|gif)\b|\b(video|movie|clip)\b[\s\S]{0,30}\b(of|about)\b|\b\d+\s*(?:second|seconds|sec|s)\b[\s\S]{0,40}\bvideo\b|\bimage\s+to\s+video\b|\bphoto\s+to\s+video\b/i;

const BROWSER_INTENT =
  /\b(automate|scrape|scraping|screenshot|playwright|puppeteer)\b|\b(go\s+to|navigate\s+to|visit|open)\b[\s\S]{0,30}(https?:\/\/|www\.|\.com\b)/i;

const LANDING_INTENT =
  /\b(build|create|make|design|develop|launch|scaffold)\b[\s\S]{0,80}\b(landing\s*page|website|web\s*page|homepage|portfolio\s*site|coffee\s*shop|shop|store|restaurant|bakery|crm|dashboard|saas|crypto|blockchain|web3|chatbot|bot|software|app|api|platform|dapp|defi|nft|game|tool)\b/i;

const RESEARCH_INTENT = /\b(deep\s+research|research\s+report|write\s+a\s+report\s+on)\b/i;
const DEBUG_INTENT = /\b(debug|fix)\b[\s\S]{0,30}\b(code|bug|error)\b/i;
const SOCIAL_INTENT = /\b(post|share|cross.?post)\b[\s\S]{0,30}\b(twitter|linkedin|instagram|facebook|x\.com)\b/i;

/** Explicit still-image edit */
const IMAGE_STYLE_EDIT_INTENT =
  /\b(style\s+transfer|change\s+style|apply\s+filter|remove\s+background|change\s+background|upscale|enhance\s+photo|make\s+it\s+look\s+like|edit\s+this\s+image|transform\s+this\s+image\s+with)\b/i;

const INTENT_RULES: Array<{ category: FeatureCategory; test: RegExp }> = [
  { category: 'image_generation', test: IMAGE_EDIT_INTENT },
  { category: 'image_generation', test: IMAGE_INTENT },
  { category: 'browser_automation', test: BROWSER_INTENT },
  { category: 'landing_page', test: LANDING_INTENT },
  { category: 'deep_research', test: RESEARCH_INTENT },
  { category: 'code_debug', test: DEBUG_INTENT },
  { category: 'cross_post', test: SOCIAL_INTENT },
];

export function isVideoIntent(prompt: string): boolean {
  return VIDEO_INTENT.test(routingPrompt(prompt).trim());
}

export const VIDEO_REMOVED_MESSAGE =
  'Video generation is not available on Xroga. I **can generate images** — logos, thumbnails, artwork, mockups, and photo edits. Describe the visual you want, or ask me to build a website or app.';

export function detectFeatureIntent(prompt: string): FeatureCategory | 'chat' {
  const t = routingPrompt(prompt).trim();
  if (!t) return 'chat';
  if (isVideoIntent(t)) return 'chat';
  for (const { category, test } of INTENT_RULES) {
    if (test.test(t)) return category;
  }
  return 'chat';
}

export function requiresFeaturePipeline(prompt: string): boolean {
  return detectFeatureIntent(prompt) !== 'chat';
}

export function isImageToVideoIntent(_prompt: string): boolean {
  return false;
}

export function isGifOutputIntent(_prompt: string): boolean {
  return false;
}

export function isImageStyleEditIntent(prompt: string): boolean {
  const t = routingPrompt(prompt).trim();
  return IMAGE_STYLE_EDIT_INTENT.test(t);
}

/** Route chat attachment: style edit → image; otherwise image generation (not video). */
export function resolveAttachmentFeatureCategory(
  prompt: string,
  classified?: FeatureCategory
): FeatureCategory {
  const t = routingPrompt(prompt).trim();
  if (isVideoIntent(t)) return 'chat';
  if (isImageStyleEditIntent(t)) return 'image_generation';
  if (!t || t.length < 4) return 'image_generation';
  const intent = detectFeatureIntent(prompt);
  if (intent !== 'chat') return intent;
  if (classified === 'image_generation') return 'image_generation';
  return 'image_generation';
}

/** Block LLM-hallucinated image links (ibb.co, fake placeholders, etc.) */
const FAKE_IMAGE_MARKDOWN = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/gi;

export function stripFakeImageMarkdown(text: string): string {
  return text.replace(FAKE_IMAGE_MARKDOWN, (_match, url: string) => {
    if (/ibb\.co|imgbb|placeholder|example\.com|placehold/i.test(url)) {
      return '';
    }
    return _match;
  }).replace(/\n{3,}/g, '\n\n').trim();
}

export function formatImageReply(imageUrl: string, prompt: string, provider?: string): string {
  const alt = prompt.slice(0, 80) || 'Generated image';
  const providerLine = provider ? `\n\n*Generated via ${provider}*` : '';
  return `![${alt}](${imageUrl})${providerLine}`;
}

export function formatFeatureOutput(output: unknown): string {
  if (!output || typeof output !== 'object') return 'Task complete.';
  const o = output as Record<string, unknown>;

  if (o.type === 'image_blocked') {
    const safety = o.safety as { title?: string; quranReference?: string; quranTranslation?: string } | undefined;
    const title = safety?.title ?? 'Image blocked for your protection';
    const ref = safety?.quranReference ?? "Qur'an 17:32";
    const verse = safety?.quranTranslation ?? 'And do not approach unlawful sexual intercourse.';
    const detail = typeof o.detail === 'string' ? `\n\n${o.detail}` : '';
    return `${title}\n\n${ref}: "${verse}"${detail}\n\nPlease try a modest, family-safe creative image instead.`;
  }
  if (o.type === 'image' && typeof o.imageUrl === 'string') {
    return formatImageReply(o.imageUrl, String(o.prompt ?? ''), String(o.provider ?? ''));
  }
  if (o.type === 'chat' && typeof o.content === 'string') return o.content;
  if (typeof o.message === 'string') return o.message;
  if (o.type === 'landing_page' && typeof o.deployUrl === 'string') {
    return `Your website is live: ${o.deployUrl}`;
  }
  if (o.type === 'video_studio' || o.type === 'video_job_pending') {
    return VIDEO_REMOVED_MESSAGE;
  }
  if (o.type === 'browser_automation') {
    const screenshot = typeof o.screenshotUrl === 'string' ? `\n\nScreenshot: ${o.screenshotUrl}` : '';
    return `Browser automation complete.${screenshot}`;
  }
  if (o.type === 'deep_research' && typeof o.pdfUrl === 'string') {
    return `Research report ready: ${o.pdfUrl}`;
  }
  return JSON.stringify(o).slice(0, 500);
}
