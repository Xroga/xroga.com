export type SocialPlatformId =
  | 'youtube'
  | 'x'
  | 'facebook'
  | 'instagram'
  | 'pinterest'
  | 'linkedin'
  | 'tiktok'
  | 'threads';

export interface SocialPlatformPack {
  id: SocialPlatformId;
  name: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string;
  clipboardText: string;
  openUrl: string;
  emoji: string;
}

export interface SocialShareInput {
  prompt?: string;
  concisePrompt?: string;
  overlayText?: string;
  imageUrls: string[];
  primaryImageUrl?: string;
  contentType?: string;
}

function shortHook(input: SocialShareInput): string {
  const overlay = input.overlayText?.trim();
  if (overlay) return overlay;

  const raw = (input.concisePrompt || input.prompt || 'AI art').trim();
  const cleaned = raw
    .replace(/^(generate|create|make|draw|design)\s+(an?\s+)?(image|picture|thumbnail|logo|avatar|poster)\s+(of\s+)?/i, '')
    .replace(/\[.*?\]/g, '')
    .trim();

  const first = cleaned.split(/[,.!?]/)[0]?.trim() || cleaned;
  const words = first.split(/\s+/).slice(0, 6).join(' ');
  return words.slice(0, 55) || 'AI creation';
}

function subjectWords(input: SocialShareInput): string[] {
  const hook = shortHook(input);
  return hook
    .replace(/[^\w\s'-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);
}

function hashTagsFromSubject(input: SocialShareInput, extra: string[] = []): string {
  const words = subjectWords(input);
  const tags = Array.from(
    new Set([...words, ...extra, 'xroga', 'aiart', 'aigenerated'].map((t) => t.toLowerCase())),
  );
  return tags
    .slice(0, 8)
    .map((t) => `#${t.replace(/\s/g, '')}`)
    .join(' ');
}

function tagList(input: SocialShareInput): string[] {
  const words = subjectWords(input);
  return Array.from(new Set([...words, 'ai art', 'xroga', 'digital art', 'creative']));
}

function imageBlock(urls: string[]): string {
  const publicUrls = urls.filter((u) => u.startsWith('http'));
  if (!publicUrls.length) {
    return 'Image: use Download in Xroga, then upload to this platform.';
  }
  if (publicUrls.length === 1) return `Image: ${publicUrls[0]}`;
  return `Images:\n${publicUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`;
}

function encode(text: string): string {
  return encodeURIComponent(text);
}

export function buildSocialPlatformPacks(input: SocialShareInput): SocialPlatformPack[] {
  const hook = shortHook(input);
  const overlay = input.overlayText?.trim();
  const tags = tagList(input);
  const hashtags = hashTagsFromSubject(input, overlay ? [overlay.replace(/\s+/g, '')] : []);
  const images = input.imageUrls.filter(Boolean);
  const primary = input.primaryImageUrl || images[0] || '';
  const imgBlock = imageBlock(images);
  const isThumb = input.contentType === 'thumbnail' || /\bthumbnail|youtube\b/i.test(input.prompt ?? '');

  const ytTitle = overlay
    ? `${overlay.toUpperCase()} — ${hook} 🔥`
    : isThumb
      ? `${hook} | YouTube Thumbnail 🔥`
      : `${hook} — Must Watch ✨`;

  const xPost = [`🔥 ${hook}`, hashtags, primary.startsWith('http') ? primary : ''].filter(Boolean).join('\n\n').slice(0, 260);

  const instaCaption = [`✨ ${hook}`, '', overlay ? `"${overlay}"` : input.prompt?.slice(0, 120) ?? '', '', hashtags, '', imgBlock]
    .filter(Boolean)
    .join('\n');

  const fbPost = [`🎬 ${hook}`, '', overlay ? `Text on image: "${overlay}"` : '', hashtags, '', imgBlock].filter(Boolean).join('\n');

  const pinTitle = overlay ? `${overlay} — ${hook}` : hook;
  const pinterestDesc = [pinTitle, input.prompt?.slice(0, 160) ?? hook, hashtags, imgBlock].filter(Boolean).join('\n');

  const linkedInPost = [
    `🎨 ${hook}`,
    '',
    `Created with Xroga AI — ${isThumb ? 'YouTube thumbnail design' : 'AI image generation'}.`,
    overlay ? `Featured text: "${overlay}"` : '',
    '',
    'What would you create?',
    '',
    hashtags,
    imgBlock,
  ]
    .filter(Boolean)
    .join('\n');

  const tiktokCaption = [`🔥 ${hook}`, '#fyp #viral #ai #xroga', hashtags, imgBlock].filter(Boolean).join('\n');

  const threadsText = [`🔥 ${hook}`, hashtags].filter(Boolean).join('\n\n').slice(0, 450);

  const youtubeDesc = [
    ytTitle,
    '',
    overlay ? `On-image text: "${overlay}"` : '',
    `Made with Xroga AI`,
    '',
    '👍 Like · 💬 Comment · 🔔 Subscribe!',
    '',
    `Tags: ${tags.join(', ')}`,
    imgBlock,
  ]
    .filter(Boolean)
    .join('\n');

  const pageUrl = typeof window !== 'undefined' ? window.location.origin : 'https://xroga.com';
  const pinMedia = primary.startsWith('http') ? primary : pageUrl;

  return [
    {
      id: 'youtube',
      name: 'YouTube',
      emoji: '▶️',
      title: ytTitle.slice(0, 100),
      description: youtubeDesc,
      tags,
      hashtags,
      clipboardText: `TITLE:\n${ytTitle.slice(0, 100)}\n\nDESCRIPTION:\n${youtubeDesc}\n\nTAGS:\n${tags.join(', ')}`,
      openUrl: 'https://studio.youtube.com/channel/videos/upload',
    },
    {
      id: 'x',
      name: 'X',
      emoji: '𝕏',
      title: hook.slice(0, 70),
      description: xPost,
      tags,
      hashtags,
      clipboardText: xPost,
      openUrl: `https://twitter.com/intent/tweet?text=${encode(xPost)}`,
    },
    {
      id: 'facebook',
      name: 'Facebook',
      emoji: 'f',
      title: hook.slice(0, 80),
      description: fbPost,
      tags,
      hashtags,
      clipboardText: fbPost,
      openUrl: `https://www.facebook.com/sharer/sharer.php?quote=${encode(fbPost.slice(0, 500))}&u=${encode(pageUrl)}`,
    },
    {
      id: 'instagram',
      name: 'Instagram',
      emoji: '📸',
      title: hook.slice(0, 80),
      description: instaCaption,
      tags,
      hashtags,
      clipboardText: instaCaption,
      openUrl: 'https://www.instagram.com/',
    },
    {
      id: 'pinterest',
      name: 'Pinterest',
      emoji: '📌',
      title: pinTitle.slice(0, 100),
      description: pinterestDesc,
      tags,
      hashtags,
      clipboardText: pinterestDesc,
      openUrl: `https://www.pinterest.com/pin/create/button/?url=${encode(pageUrl)}&media=${encode(pinMedia)}&description=${encode(pinterestDesc.slice(0, 500))}`,
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      emoji: 'in',
      title: hook.slice(0, 100),
      description: linkedInPost,
      tags,
      hashtags,
      clipboardText: linkedInPost,
      openUrl: `https://www.linkedin.com/sharing/share-offsite/?url=${encode(pageUrl)}`,
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      emoji: '♪',
      title: hook.slice(0, 80),
      description: tiktokCaption,
      tags,
      hashtags,
      clipboardText: tiktokCaption,
      openUrl: 'https://www.tiktok.com/upload',
    },
    {
      id: 'threads',
      name: 'Threads',
      emoji: '@',
      title: hook.slice(0, 80),
      description: threadsText,
      tags,
      hashtags,
      clipboardText: threadsText,
      openUrl: `https://www.threads.net/intent/post?text=${encode(threadsText)}`,
    },
  ];
}

