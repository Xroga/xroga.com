import { deepSeekChat } from '../../lib/deepseek.js';

export interface VideoReviewScore {
  provider: string;
  videoUrl: string;
  physics: number;
  lighting: number;
  consistency: number;
  total: number;
}

export async function reviewVideoOutputs(
  videos: Array<{ provider: string; videoUrl: string }>,
  scenePrompt: string
): Promise<VideoReviewScore> {
  const reviewPrompt = `You are DeepSeek-R1 video reviewer. Score each video 0-10 on physics, lighting, character consistency.
Scene: ${scenePrompt}
Videos: ${JSON.stringify(videos)}
Return JSON: {"winner":"provider_name","scores":[{"provider":"","physics":0,"lighting":0,"consistency":0}]}`;

  try {
    const raw = await deepSeekChat(
      [{ role: 'user', content: reviewPrompt }],
      { model: 'deepseek-reasoner', maxTokens: 1024 }
    );

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        winner?: string;
        scores?: Array<{ provider: string; physics: number; lighting: number; consistency: number }>;
      };

      const scores = parsed.scores ?? [];
      const ranked = scores.map((s) => ({
        provider: s.provider,
        videoUrl: videos.find((v) => v.provider === s.provider)?.videoUrl ?? videos[0].videoUrl,
        physics: s.physics,
        lighting: s.lighting,
        consistency: s.consistency,
        total: s.physics + s.lighting + s.consistency,
      }));

      if (ranked.length > 0) {
        ranked.sort((a, b) => b.total - a.total);
        return ranked[0];
      }
    }
  } catch (err) {
    console.error('[VideoReviewer] DeepSeek-R1 review failed:', (err as Error).message);
  }

  return {
    provider: videos[0].provider,
    videoUrl: videos[0].videoUrl,
    physics: 7,
    lighting: 7,
    consistency: 7,
    total: 21,
  };
}

export type VideoFormatId = 'shorts_reels' | 'youtube_video';

export function parseVideoFormat(prompt: string): VideoFormatId {
  const tag = prompt.match(/\[xroga-video-format:(shorts_reels|youtube_video)\]/i);
  if (tag?.[1] === 'shorts_reels') return 'shorts_reels';
  if (tag?.[1] === 'youtube_video') return 'youtube_video';
  if (/\b(youtube video|landscape|16:9|widescreen|facebook video|horizontal)\b/i.test(prompt)) {
    return 'youtube_video';
  }
  if (/\b(shorts?|reels?|tiktok|vertical|9:16|mobile|instagram reel)\b/i.test(prompt)) return 'shorts_reels';
  return 'shorts_reels';
}

export function stripVideoFormatTag(prompt: string): string {
  return prompt.replace(/\[xroga-video-format:(shorts_reels|youtube_video)\]/gi, '').trim();
}

export function videoAspectSuffix(format: VideoFormatId): string {
  return format === 'shorts_reels'
    ? 'Vertical 9:16 mobile video, portrait orientation, TikTok Reels Shorts style'
    : 'Landscape 16:9 widescreen YouTube video, cinematic horizontal format';
}

export function parseVideoDuration(prompt: string): number {
  const cleaned = prompt.replace(/\[xroga-video-format:[^\]]+\]/gi, '');
  const secMatch = cleaned.match(/(\d+)\s*(?:second|seconds|sec|s)\b/i);
  if (secMatch) return Math.min(parseInt(secMatch[1], 10), 300);

  const clipMatch = cleaned.match(/(\d+)\s*(?:second|sec|s)?\s*clip\b/i);
  if (clipMatch) return Math.min(parseInt(clipMatch[1], 10), 300);

  const minMatch = prompt.match(/(\d+)\s*(?:minute|min|m)\b/i);
  if (minMatch) return Math.min(parseInt(minMatch[1], 10) * 60, 300);

  if (/\b(movie|film|feature)\b/i.test(prompt)) return 30;
  if (/\btrailer\b/i.test(prompt)) return 15;
  return 5;
}

export function computeVideoActionCost(durationSeconds: number): number {
  if (durationSeconds <= 5) return 10;
  if (durationSeconds <= 15) return 25;
  return Math.min(50, Math.ceil(durationSeconds / 10) * 25);
}
