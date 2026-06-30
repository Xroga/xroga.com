import { useEffect, useState } from 'react';

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
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load video data');
        setSrc(url);
        setLoading(false);
      });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { src, error, loading };
}

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
