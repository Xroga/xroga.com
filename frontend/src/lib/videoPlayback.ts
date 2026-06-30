import { useEffect, useState } from 'react';

function dataUrlToBlobUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Invalid data URL');
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'video/mp4';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/** Resolve data:video URLs to blob URLs for reliable browser playback */
export function useVideoSrc(url: string): { src: string; error: string | null; loading: boolean } {
  const [src, setSrc] = useState(url);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(url.startsWith('data:video/'));

  useEffect(() => {
    let objectUrl: string | null = null;
    setError(null);

    if (!url) {
      setSrc('');
      setLoading(false);
      return;
    }

    if (!url.startsWith('data:video/')) {
      setSrc(url);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      objectUrl = dataUrlToBlobUrl(url);
      setSrc(objectUrl);
      setLoading(false);
    } catch {
      setError('Could not load video data');
      setSrc(url);
      setLoading(false);
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { src, error, loading };
}

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** crossOrigin only needed for canvas/export — omit for normal playback to avoid CORS edge cases */
export function videoCrossOrigin(url: string): 'anonymous' | undefined {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return undefined;
  return undefined;
}
