export type MessageShareScope = 'response' | 'exchange';
export type MessageShareVisibility = 'private' | 'public';
export type MessageSharePlatform = 'x' | 'linkedin' | 'facebook' | 'whatsapp' | 'reddit';

export function cleanShareText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*```[^\n]*$/gm, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/^\s*[-_*\\/]{3,}\s*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function messageShareUrl(token: string): string {
  const origin = typeof window === 'undefined'
    ? (process.env.NEXT_PUBLIC_SITE_URL || 'https://xroga.com')
    : window.location.origin;
  return `${origin.replace(/\/$/, '')}/share/${encodeURIComponent(token)}`;
}

export function socialShareUrl(platform: MessageSharePlatform, url: string): string {
  const encodedUrl = encodeURIComponent(url);
  const text = encodeURIComponent('Shared from Xroga');
  switch (platform) {
    case 'x':
      return `https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}`;
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
    case 'whatsapp':
      return `https://wa.me/?text=${text}%20${encodedUrl}`;
    case 'reddit':
      return `https://www.reddit.com/submit?url=${encodedUrl}&title=${text}`;
  }
}
