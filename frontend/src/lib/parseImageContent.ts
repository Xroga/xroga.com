export interface ParsedImageBlock {
  alt: string;
  url: string;
  fullMatch: string;
}

const IMAGE_MARKDOWN = /!\[([^\]]*)\]\(([^)]+)\)/g;

export function extractImagesFromContent(content: string): ParsedImageBlock[] {
  const images: ParsedImageBlock[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(IMAGE_MARKDOWN.source, 'g');
  while ((match = re.exec(content)) !== null) {
    images.push({ alt: match[1], url: match[2], fullMatch: match[0] });
  }
  return images;
}

export function stripImageMarkdown(content: string): string {
  return content
    .replace(IMAGE_MARKDOWN, '')
    .replace(/\*Generated via [^*]+\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isImageGenerationPrompt(text: string): boolean {
  return /\b(generate|create|make|draw|design)\b[\s\S]{0,40}\b(image|picture|logo|illustration|artwork|poster|photo)\b|\bimage\s+of\b/i.test(
    text
  );
}

export function isVideoGenerationPrompt(text: string): boolean {
  return /\b(generate|create|make|produce|film|shoot|animate|turn)\b[\s\S]{0,50}\b(video|movie|film|trailer|clip|scene|episode|series|gif|animation)\b|\bvideo\s+of\b|\bimage\s+to\s+video\b|\bphoto\s+to\s+video\b/i.test(
    text
  );
}

export function isImageToVideoPrompt(text: string): boolean {
  return /\b(animate|animation|turn\s+(?:this\s+)?(?:image|photo|picture)\s+(?:into|to)|image\s+to\s+video|photo\s+to\s+video|make\s+(?:this|the)\s+(?:image|photo)\s+(?:move|alive)|bring\s+(?:this|the)\s+(?:image|photo)\s+to\s+life)\b/i.test(
    text
  );
}

export function isGifPrompt(text: string): boolean {
  return /\b(gif|animated\s+gif|image\s+to\s+gif|make\s+a\s+gif)\b/i.test(text);
}

/** Rough ETA for video generation UI (seconds) */
export function estimateVideoSeconds(prompt: string): number {
  const cleaned = prompt.replace(/\[xroga-video-format:[^\]]+\]/gi, '');
  const secMatch = cleaned.match(/(\d+)\s*(?:second|seconds|sec|s)\b/i);
  const dur = secMatch ? Math.min(parseInt(secMatch[1], 10), 300) : 5;
  if (dur <= 5) return 90;
  if (dur <= 10) return 120;
  if (dur <= 15) return 180;
  return 240;
}

/** Default chat prompt when user attaches image only */
export function defaultImageAttachmentPrompt(text: string, hasVideoIntent: boolean): string {
  if (text.trim()) return text;
  return hasVideoIntent
    ? 'Turn this image into a cinematic animated video'
    : 'Turn this image into a cinematic animated video';
}

export function parseProviderFromContent(content: string): string | undefined {
  const m = content.match(/\*Generated via ([^*]+)\*/);
  return m?.[1]?.trim();
}

export function isPlaceholderImage(url: string): boolean {
  return /placehold\.co|placeholder|via\.placeholder/i.test(url);
}

export function isFailedImageContent(content: string): boolean {
  if (isPlaceholderImage(content)) return true;
  return /IMAGE_GEN_FAILED|No image API keys configured|All image providers failed|Image generation failed/i.test(
    content
  );
}
