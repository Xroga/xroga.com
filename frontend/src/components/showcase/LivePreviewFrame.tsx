'use client';

/**
 * Renders a real product preview scaled down to fit its container.
 *
 * This is a live iframe of the actual preview route, not a bitmap thumbnail — so a
 * card can never drift out of sync with the product it advertises. The frame is
 * inert (`pointer-events: none`) because a card is a link target; the full
 * interactive version lives on the detail page.
 *
 * Loading is deferred until the frame is near the viewport, so a six-card grid
 * does not open six documents on first paint.
 */

import { useEffect, useRef, useState } from 'react';

/** Width the product is rendered at before scaling — a desktop layout. */
const DESIGN_WIDTH = 1440;

export function LivePreviewFrame({
  src,
  title,
  designHeight = 900,
  className,
  interactive = false,
}: {
  src: string;
  title: string;
  /** Taller values show more of the page in the same box. */
  designHeight?: number;
  className?: string;
  /** Allow interaction. Off for cards, on where the frame is the main content. */
  interactive?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Scale to the container's real width, re-measured on resize.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setScale(host.clientWidth / DESIGN_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Defer the document load until the card is nearly on screen.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', aspectRatio: `${DESIGN_WIDTH} / ${designHeight}` }}
    >
      {visible && scale > 0 && (
        <iframe
          src={src}
          title={title}
          loading="lazy"
          tabIndex={interactive ? 0 : -1}
          aria-hidden={interactive ? undefined : true}
          onLoad={() => setLoaded(true)}
          // `allow-same-origin` is required, not incidental: without it the frame gets
          // an opaque origin, every localStorage read in the app's providers throws,
          // and the product renders an error page instead of itself. That is safe here
          // because the framed document is our own first-party route — there is no
          // user-supplied markup to contain. The remaining restrictions still block
          // top-level navigation, downloads, and modal dialogs from inside the frame.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${DESIGN_WIDTH}px`,
            height: `${designHeight}px`,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            pointerEvents: interactive ? 'auto' : 'none',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 240ms ease',
          }}
        />
      )}

      {!loaded && (
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, background: 'var(--surface-inset)' }}
          className="animate-pulse motion-reduce:animate-none"
        />
      )}
    </div>
  );
}
