import type { VideoFormatId } from './videoFormat';

export type VideoSocialPlatformId =
  | 'youtube_shorts'
  | 'instagram_reels'
  | 'facebook_reels'
  | 'tiktok'
  | 'threads'
  | 'youtube'
  | 'facebook_video'
  | 'linkedin'
  | 'x';

export interface VideoPlatformPack {
  id: VideoSocialPlatformId;
  name: string;
  emoji: string;
  title: string;
  clipboardText: string;
  openUrl: string;
}

export function buildVideoPlatformPacks(
  title: string,
  format: VideoFormatId,
): VideoPlatformPack[] {
  const hook = title.slice(0, 80) || 'AI video';
  const hashtags = '#xroga #aivideo #fyp #viral';
  const caption = `🎬 ${hook}\n\n${hashtags}\n\nMade with Xroga AI`;
  const pageUrl = typeof window !== 'undefined' ? window.location.origin : 'https://xroga.com';

  const encode = (t: string) => encodeURIComponent(t);

  if (format === 'shorts_reels') {
    return [
      {
        id: 'youtube_shorts',
        name: 'YouTube Shorts',
        emoji: '▶️',
        title: hook,
        clipboardText: caption,
        openUrl: 'https://studio.youtube.com/channel/videos/upload',
      },
      {
        id: 'instagram_reels',
        name: 'Instagram Reels',
        emoji: '📸',
        title: hook,
        clipboardText: caption,
        openUrl: 'https://www.instagram.com/',
      },
      {
        id: 'facebook_reels',
        name: 'Facebook Reels',
        emoji: 'f',
        title: hook,
        clipboardText: caption,
        openUrl: 'https://www.facebook.com/reels/create',
      },
      {
        id: 'tiktok',
        name: 'TikTok',
        emoji: '♪',
        title: hook,
        clipboardText: `${caption}\n#fyp`,
        openUrl: 'https://www.tiktok.com/upload',
      },
      {
        id: 'threads',
        name: 'Threads',
        emoji: '@',
        title: hook,
        clipboardText: caption.slice(0, 450),
        openUrl: `https://www.threads.net/intent/post?text=${encode(caption.slice(0, 400))}`,
      },
    ];
  }

  return [
    {
      id: 'youtube',
      name: 'YouTube',
      emoji: '▶️',
      title: hook,
      clipboardText: `TITLE: ${hook}\n\nDESCRIPTION:\n${caption}\n\nTAGS: ai video, xroga`,
      openUrl: 'https://studio.youtube.com/channel/videos/upload',
    },
    {
      id: 'facebook_video',
      name: 'Facebook Video',
      emoji: 'f',
      title: hook,
      clipboardText: caption,
      openUrl: `https://www.facebook.com/sharer/sharer.php?u=${encode(pageUrl)}`,
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      emoji: 'in',
      title: hook,
      clipboardText: `🎬 ${hook}\n\nCreated with Xroga AI.\n\n${hashtags}`,
      openUrl: `https://www.linkedin.com/sharing/share-offsite/?url=${encode(pageUrl)}`,
    },
    {
      id: 'x',
      name: 'X',
      emoji: '𝕏',
      title: hook,
      clipboardText: `🎬 ${hook} ${hashtags}`,
      openUrl: `https://twitter.com/intent/tweet?text=${encode(`🎬 ${hook} ${hashtags}`.slice(0, 260))}`,
    },
  ];
}

export async function shareVideoToPlatform(pack: VideoPlatformPack, videoUrl?: string): Promise<void> {
  if (!videoUrl) {
    await navigator.clipboard.writeText(pack.clipboardText).catch(() => {});
    window.open(pack.openUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    const res = await fetch(videoUrl.startsWith('data:') ? videoUrl : videoUrl, { mode: 'cors' });
    const blob = await res.blob();
    const file = new File([blob], 'xroga-video.mp4', { type: 'video/mp4' });

    if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: pack.title, text: pack.clipboardText, files: [file] });
      return;
    }
  } catch {
    /* fall through */
  }

  try {
    await navigator.clipboard.writeText(pack.clipboardText);
  } catch {
    /* optional */
  }

  window.open(pack.openUrl, '_blank', 'noopener,noreferrer');
}
