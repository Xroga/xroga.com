export type VideoFormatId = 'shorts_reels' | 'youtube_video';

export const VIDEO_FORMAT_TAG = /\[xroga-video-format:(shorts_reels|youtube_video)\]/i;

export function injectVideoFormatTag(prompt: string, format: VideoFormatId): string {
  const cleaned = prompt.replace(VIDEO_FORMAT_TAG, '').trim();
  return `${cleaned} [xroga-video-format:${format}]`;
}

export function parseVideoFormatFromPrompt(prompt: string): VideoFormatId {
  const m = prompt.match(VIDEO_FORMAT_TAG);
  if (m?.[1]?.toLowerCase() === 'youtube_video') return 'youtube_video';
  if (m?.[1]?.toLowerCase() === 'shorts_reels') return 'shorts_reels';
  if (/\b(shorts?|reels?|tiktok|vertical|9:16|mobile|instagram)\b/i.test(prompt)) return 'shorts_reels';
  if (/\b(youtube video|landscape|16:9|widescreen|facebook video)\b/i.test(prompt)) return 'youtube_video';
  return 'youtube_video';
}

export function videoAspectClass(format: VideoFormatId): string {
  return format === 'shorts_reels' ? 'aspect-[9/16] max-h-[min(70vh,520px)]' : 'aspect-video max-h-[min(50vh,400px)]';
}

export function formatLabel(format: VideoFormatId): string {
  return format === 'shorts_reels' ? 'Shorts / Reels (9:16)' : 'YouTube Video (16:9)';
}
