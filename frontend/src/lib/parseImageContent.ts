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
