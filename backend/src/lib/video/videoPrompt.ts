import { stripVideoFormatTag } from '../../services/media/videoUtils.js';

/** Strip UI tags and command prefixes before sending to video APIs */
export function sanitizeVideoPrompt(prompt: string): string {
  let p = stripVideoFormatTag(prompt);
  p = p.replace(/\[xroga-[^\]]+\]/gi, '');
  p = p.replace(/^\s*(?:generate|create|make|produce|render)\s+(?:an?\s+)?/i, '');
  p = p.replace(/\b(?:youtube_video|shorts_reels|xroga-video-format)\b/gi, '');
  p = p.replace(/\s{2,}/g, ' ').trim();
  return p || 'cinematic scene with smooth camera motion';
}
