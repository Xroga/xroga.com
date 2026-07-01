import type { FeatureCategory } from '../types/features.js';
import { routingPrompt } from './promptRouting.js';

/** Strong intent detection — never route these through text-only chat */

const IMAGE_EDIT_INTENT = /\[Image(?:\s+Edit)?\]/i;

const IMAGE_INTENT =
  /\b(generate|create|make|draw|design)\b[\s\S]{0,40}\b(image|picture|logo|illustration|artwork|poster|thumbnail|graphic|photo|avatar|icon)\b|\bimage\s+of\b/i;

const VIDEO_INTENT =
  /\b(generate|create|make|produce)\b[\s\S]{0,40}\b(video|movie|film|trailer|clip|animation)\b|\bvideo\s+(about|of)\b/i;

/** User uploaded image → animate / image-to-video / gif */
const IMAGE_TO_VIDEO_INTENT =
  /\b(animate|animation|turn\s+(?:this\s+)?(?:image|photo|picture)\s+(?:into|to)|image\s+to\s+video|photo\s+to\s+video|picture\s+to\s+video|make\s+(?:this|the)\s+(?:image|photo)\s+(?:move|alive)|bring\s+(?:this|the)\s+(?:image|photo)\s+to\s+life|convert\s+(?:this\s+)?(?:image|photo)\s+to\s+(?:a\s+)?(?:video|gif)|image\s+to\s+gif|gif\s+from\s+(?:this\s+)?image)\b/i;

const GIF_INTENT = /\b(gif|animated\s+gif|make\s+a\s+gif|as\s+a\s+gif)\b/i;

/** Explicit still-image edit — not video */
const IMAGE_STYLE_EDIT_INTENT =
  /\b(style\s+transfer|change\s+style|apply\s+filter|remove\s+background|change\s+background|upscale|enhance\s+photo|make\s+it\s+look\s+like|edit\s+this\s+image|transform\s+this\s+image\s+with)\b/i;

const BROWSER_INTENT =
  /\b(automate|scrape|scraping|screenshot|playwright|puppeteer)\b|\b(go\s+to|navigate\s+to|visit|open)\b[\s\S]{0,30}(https?:\/\/|www\.|\.com\b)/i;

const LANDING_INTENT =
  /\b(build|create|make|design)\b[\s\S]{0,40}\b(landing\s*page|website|web\s*page|homepage|portfolio\s*site)\b/i;

const RESEARCH_INTENT = /\b(deep\s+research|research\s+report|write\s+a\s+report\s+on)\b/i;
const DEBUG_INTENT = /\b(debug|fix)\b[\s\S]{0,30}\b(code|bug|error)\b/i;
const SOCIAL_INTENT = /\b(post|share|cross.?post)\b[\s\S]{0,30}\b(twitter|linkedin|instagram|facebook|x\.com)\b/i;

const INTENT_RULES: Array<{ category: FeatureCategory; test: RegExp }> = [
  { category: 'image_generation', test: IMAGE_EDIT_INTENT },
  { category: 'video_studio', test: IMAGE_TO_VIDEO_INTENT },
  { category: 'video_studio', test: VIDEO_INTENT },
  { category: 'image_generation', test: IMAGE_INTENT },
  { category: 'browser_automation', test: BROWSER_INTENT },
  { category: 'landing_page', test: LANDING_INTENT },
  { category: 'deep_research', test: RESEARCH_INTENT },
  { category: 'code_debug', test: DEBUG_INTENT },
  { category: 'cross_post', test: SOCIAL_INTENT },
];

export function detectFeatureIntent(prompt: string): FeatureCategory | 'chat' {
  const t = routingPrompt(prompt).trim();
  if (!t) return 'chat';
  for (const { category, test } of INTENT_RULES) {
    if (test.test(t)) return category;
  }
  return 'chat';
}

export function requiresFeaturePipeline(prompt: string): boolean {
  return detectFeatureIntent(prompt) !== 'chat';
}

export function isImageToVideoIntent(prompt: string): boolean {
  const t = routingPrompt(prompt).trim();
  return IMAGE_TO_VIDEO_INTENT.test(t) || VIDEO_INTENT.test(t) || GIF_INTENT.test(t);
}

export function isGifOutputIntent(prompt: string): boolean {
  return GIF_INTENT.test(routingPrompt(prompt));
}

export function isImageStyleEditIntent(prompt: string): boolean {
  const t = routingPrompt(prompt).trim();
  return IMAGE_STYLE_EDIT_INTENT.test(t) && !isImageToVideoIntent(t);
}

/** Route chat attachment: image-to-video unless user clearly wants style edit only */
export function resolveAttachmentFeatureCategory(
  prompt: string,
  classified?: FeatureCategory
): FeatureCategory {
  const t = routingPrompt(prompt).trim();
  if (isImageStyleEditIntent(t)) return 'image_generation';
  if (isImageToVideoIntent(t)) return 'video_studio';
  if (!t || t.length < 4) return 'video_studio';
  const intent = detectFeatureIntent(prompt);
  if (intent === 'image_generation' && !isImageToVideoIntent(t)) return 'image_generation';
  return 'video_studio';
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
  if (o.type === 'video_studio' && typeof o.streamingUrl === 'string') {
    return `Your video is ready: ${o.streamingUrl}`;
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
