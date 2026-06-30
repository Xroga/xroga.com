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
  /** Full text copied when user picks this platform */
  clipboardText: string;
  /** Opens the platform composer / upload page */
  openUrl: string;
}

export interface SocialShareInput {
  prompt?: string;
  concisePrompt?: string;
  overlayText?: string;
  imageUrls: string[];
  primaryImageUrl?: string;
}

function deriveSubject(input: SocialShareInput): string {
  const raw = (input.concisePrompt || input.prompt || 'AI image').trim();
  return raw
    .replace(/^(generate|create|make|draw|design)\s+(an?\s+)?(image|picture|thumbnail|poster)\s+(of\s+)?/i, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'AI creation';
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function hashTagsFromSubject(subject: string, extra: string[] = []): string {
  const words = subject
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);
  const tags = Array.from(new Set([...words, ...extra, 'xroga', 'aiart', 'aigenerated']));
  return tags.map((t) => `#${t.replace(/\s/g, '')}`).join(' ');
}

function tagList(subject: string): string[] {
  const base = subject
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
    .slice(0, 12);
  return Array.from(new Set([...base, 'ai art', 'xroga', 'digital art', 'creative']));
}

function imageBlock(urls: string[]): string {
  const publicUrls = urls.filter((u) => u.startsWith('http'));
  if (!publicUrls.length) {
    return urls.length
      ? 'Images: download from Xroga chat (use Download button) and upload to this platform.'
      : '';
  }
  if (publicUrls.length === 1) return `Image: ${publicUrls[0]}`;
  return `Images (${publicUrls.length}):\n${publicUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`;
}

function encode(text: string): string {
  return encodeURIComponent(text);
}

export function buildSocialPlatformPacks(input: SocialShareInput): SocialPlatformPack[] {
  const subject = deriveSubject(input);
  const titled = titleCase(subject);
  const overlay = input.overlayText?.trim();
  const tags = tagList(subject);
  const hashtags = hashTagsFromSubject(subject, overlay ? [overlay.replace(/\s+/g, '').toLowerCase()] : []);
  const images = input.imageUrls.filter(Boolean);
  const primary = input.primaryImageUrl || images[0] || '';
  const imgBlock = imageBlock(images);

  const viralTitle = overlay
    ? `${overlay.toUpperCase()} — ${titled} 🔥`
    : `${titled} — You Need To See This ✨`;

  const shortHook = overlay ? `${overlay} | ${subject}` : `🔥 ${subject}`;

  const youtubeDesc = [
    viralTitle,
    '',
    overlay ? `On-image text: "${overlay}"` : '',
    `Created with Xroga AI from: "${input.prompt || subject}"`,
    '',
    '👍 Like · 💬 Comment · 🔔 Subscribe for more!',
    '',
    `Tags: ${tags.join(', ')}`,
    '',
    imgBlock,
  ]
    .filter(Boolean)
    .join('\n');

  const xText = [
    shortHook.slice(0, 200),
    hashtags,
    primary.startsWith('http') ? primary : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 275);

  const instaCaption = [
    viralTitle,
    '',
    input.prompt ? `"${input.prompt.slice(0, 180)}"` : subject,
    '',
    hashtags,
    '',
    imgBlock,
  ]
    .filter(Boolean)
    .join('\n');

  const fbPost = [viralTitle, '', input.prompt || subject, '', hashtags, '', imgBlock].filter(Boolean).join('\n');

  const pinterestDesc = [
    `${titled}${overlay ? ` — "${overlay}"` : ''}`,
    input.prompt || subject,
    hashtags,
    imgBlock,
  ]
    .filter(Boolean)
    .join('\n');

  const linkedInPost = [
    `🎨 ${viralTitle}`,
    '',
    `I created this with Xroga AI.`,
    input.prompt ? `Prompt: ${input.prompt.slice(0, 240)}` : '',
    '',
    'What would you create with AI?',
    '',
    hashtags,
    '',
    imgBlock,
  ]
    .filter(Boolean)
    .join('\n');

  const tiktokCaption = [shortHook, '', hashtags, '#fyp #viral #ai', '', imgBlock].filter(Boolean).join('\n');

  const threadsText = [shortHook, hashtags, primary.startsWith('http') ? primary : ''].filter(Boolean).join('\n\n').slice(0, 480);

  const pageUrl = typeof window !== 'undefined' ? window.location.origin : 'https://xroga.com';
  const pinMedia = primary.startsWith('http') ? primary : pageUrl;

  const packs: SocialPlatformPack[] = [
    {
      id: 'youtube',
      name: 'YouTube',
      title: viralTitle.slice(0, 100),
      description: youtubeDesc,
      tags,
      hashtags,
      clipboardText: `TITLE:\n${viralTitle.slice(0, 100)}\n\nDESCRIPTION:\n${youtubeDesc}\n\nTAGS:\n${tags.join(', ')}`,
      openUrl: 'https://studio.youtube.com/channel/videos/upload',
    },
    {
      id: 'x',
      name: 'X (Twitter)',
      title: shortHook.slice(0, 70),
      description: xText,
      tags,
      hashtags,
      clipboardText: xText,
      openUrl: `https://twitter.com/intent/tweet?text=${encode(xText)}`,
    },
    {
      id: 'facebook',
      name: 'Facebook',
      title: viralTitle.slice(0, 80),
      description: fbPost,
      tags,
      hashtags,
      clipboardText: fbPost,
      openUrl: `https://www.facebook.com/sharer/sharer.php?quote=${encode(fbPost.slice(0, 500))}&u=${encode(pageUrl)}`,
    },
    {
      id: 'instagram',
      name: 'Instagram',
      title: viralTitle.slice(0, 80),
      description: instaCaption,
      tags,
      hashtags,
      clipboardText: instaCaption,
      openUrl: 'https://www.instagram.com/',
    },
    {
      id: 'pinterest',
      name: 'Pinterest',
      title: titled,
      description: pinterestDesc,
      tags,
      hashtags,
      clipboardText: pinterestDesc,
      openUrl: `https://www.pinterest.com/pin/create/button/?url=${encode(pageUrl)}&media=${encode(pinMedia)}&description=${encode(pinterestDesc.slice(0, 500))}`,
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      title: viralTitle.slice(0, 120),
      description: linkedInPost,
      tags,
      hashtags,
      clipboardText: linkedInPost,
      openUrl: `https://www.linkedin.com/sharing/share-offsite/?url=${encode(pageUrl)}`,
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      title: shortHook.slice(0, 80),
      description: tiktokCaption,
      tags,
      hashtags,
      clipboardText: tiktokCaption,
      openUrl: 'https://www.tiktok.com/upload',
    },
    {
      id: 'threads',
      name: 'Threads',
      title: shortHook.slice(0, 80),
      description: threadsText,
      tags,
      hashtags,
      clipboardText: threadsText,
      openUrl: `https://www.threads.net/intent/post?text=${encode(threadsText)}`,
    },
  ];

  return packs;
}

export async function shareToPlatform(pack: SocialPlatformPack): Promise<void> {
  try {
    await navigator.clipboard.writeText(pack.clipboardText);
  } catch {
    /* clipboard optional */
  }
  window.open(pack.openUrl, '_blank', 'noopener,noreferrer');
}
