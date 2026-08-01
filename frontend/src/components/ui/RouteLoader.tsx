'use client';

import { useEffect, useState } from 'react';
import { XrogaChipLoader } from '@/components/ui/XrogaChipLoader';
import { Loading02Icon } from '@/components/ui/LoadingIcons';

const SEEN_KEY = 'xroga-intro-loader-shown';

/**
 * What fills the screen while a route resolves.
 *
 * The chip animation is the brand moment, and it is expensive — a full-width SVG with
 * eight animated traces. Paying for it on every navigation made the app feel slower
 * than it is, because the loader itself became the thing you waited for. It now plays
 * once per browsing session and every later wait gets a small spinner.
 *
 * The decision is deliberately made on the client after mount. `loading.tsx` renders
 * on the server during suspense, where `sessionStorage` does not exist, so a
 * server-side choice would be a guess. The first paint is therefore the cheap spinner
 * and the chip replaces it only when the flag says this is the first visit — the
 * wrong way round would flash the expensive animation at everyone before hiding it.
 */
export function RouteLoader() {
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return;
      sessionStorage.setItem(SEEN_KEY, '1');
      setShowIntro(true);
    } catch {
      // Private mode or a blocked store: fall through to the cheap spinner rather
      // than showing the heavy one on every single navigation.
    }
  }, []);

  return (
    <div className="xv-route-loader" role="status" aria-label="Loading">
      {showIntro ? (
        <XrogaChipLoader className="w-[min(88vw,20rem)] sm:w-[24rem] md:w-[32rem] lg:w-[36rem]" />
      ) : (
        <Loading02Icon spinning size={28} role={undefined} aria-label={undefined} className="text-[var(--accent)]" />
      )}
    </div>
  );
}
