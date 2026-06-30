/**
 * Share image + caption to social platforms.
 * Uses Web Share API (image file) when available; otherwise clipboard + platform URL.
 */

import toast from 'react-hot-toast';
import { uploadChatImage } from './api';
import { copyImageToClipboard, imageUrlToPngBlob } from './imageStudioUtils';
import type { SocialPlatformPack } from './socialSharePack';

export async function ensurePublicImageUrl(url: string): Promise<string> {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const blob = await imageUrlToPngBlob(url);
  const file = new File([blob], 'xroga-share.png', { type: 'image/png' });
  const uploaded = await uploadChatImage(file);
  if (uploaded.startsWith('http')) return uploaded;
  return url;
}

async function imageUrlToFile(url: string): Promise<File> {
  const blob = await imageUrlToPngBlob(url);
  return new File([blob], 'xroga-image.png', { type: 'image/png' });
}

function encode(text: string): string {
  return encodeURIComponent(text);
}

function platformOpenUrl(pack: SocialPlatformPack, publicImageUrl?: string): string {
  const pageUrl = typeof window !== 'undefined' ? window.location.origin : 'https://xroga.com';
  const media = publicImageUrl?.startsWith('http') ? publicImageUrl : pageUrl;

  switch (pack.id) {
    case 'pinterest':
      return `https://www.pinterest.com/pin/create/button/?url=${encode(pageUrl)}&media=${encode(media)}&description=${encode(pack.clipboardText.slice(0, 500))}`;
    case 'x':
      return `https://twitter.com/intent/tweet?text=${encode(pack.clipboardText.slice(0, 260))}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?quote=${encode(pack.clipboardText.slice(0, 500))}&u=${encode(pageUrl)}`;
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encode(pageUrl)}`;
    case 'threads':
      return `https://www.threads.net/intent/post?text=${encode(pack.clipboardText.slice(0, 450))}`;
    default:
      return pack.openUrl;
  }
}

export async function shareToPlatform(pack: SocialPlatformPack, imageUrl?: string): Promise<void> {
  if (!imageUrl) {
    try {
      await navigator.clipboard.writeText(pack.clipboardText);
    } catch {
      /* optional */
    }
    window.open(pack.openUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  let publicUrl = imageUrl;
  try {
    publicUrl = await ensurePublicImageUrl(imageUrl);
  } catch {
    publicUrl = imageUrl;
  }

  const file = await imageUrlToFile(imageUrl);

  if (typeof navigator.share === 'function') {
    try {
      const payload: ShareData = {
        title: pack.title,
        text: pack.clipboardText,
        url: publicUrl.startsWith('http') ? publicUrl : undefined,
      };
      if (navigator.canShare?.({ ...payload, files: [file] })) {
        await navigator.share({ ...payload, files: [file] });
        return;
      }
      if (navigator.canShare?.(payload)) {
        await navigator.share(payload);
        await copyImageToClipboard(imageUrl, undefined, true);
        return;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    }
  }

  const imageCopied = await copyImageToClipboard(imageUrl, undefined, true);

  window.open(platformOpenUrl(pack, publicUrl), '_blank', 'noopener,noreferrer');

  if (imageCopied) {
    toast.success(
      `${pack.name}: image copied — paste it (Ctrl+V / ⌘V) in the compose box. Caption is pre-filled in the post.`,
      { duration: 5500 },
    );
  } else {
    try {
      await navigator.clipboard.writeText(pack.clipboardText);
      toast.success(`${pack.name}: caption copied — use Download for the image`, { duration: 4000 });
    } catch {
      toast.success(`${pack.name} opened — use Download for the image`, { duration: 4000 });
    }
  }
}
