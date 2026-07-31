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

export function LivePreviewFrame({
  src,
  title,
  designWidth = 1440,
  designHeight = 900,
  className,
  interactive = false,
  scaleMode = 'fit',
}: {
  src: string;
  title: string;
  /** Viewport width the product renders at before scaling. */
  designWidth?: number;
  /** Taller values show more of the page in the same box. */
  designHeight?: number;
  className?: string;
  /** Allow interaction. Off for cards, on where the frame is the main content. */
  interactive?: boolean;
  /**
   * `fit` scales the document down to the container width — right for a card.
   * `actual` renders at the design width with no scaling, so a phone-width preview
   * is genuinely phone-width and its own media queries and touch targets apply.
   */
  scaleMode?: 'fit' | 'actual';
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Scale to the container's real width, re-measured on resize. In `actual` mode the
  // scale is pinned to 1 but still clamped down if the container is narrower than the
  // design width, so a phone preview never overflows on a small screen.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const ratio = host.clientWidth / designWidth;
      setScale(scaleMode === 'actual' ? Math.min(1, ratio) : ratio);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [designWidth, scaleMode]);

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
      style={{
        position: 'relative',
        overflow: 'hidden',
        // In `actual` mode the box is the device size — but it must follow the *scaled*
        // height, or clamping a wide device into a narrower container leaves dead space
        // below the content. Before the first measurement, fall back to the ratio.
        ...(scaleMode === 'actual'
          ? {
              width: '100%',
              maxWidth: `${designWidth}px`,
              marginInline: 'auto',
              ...(scale > 0 ? { height: `${designHeight * scale}px` } : { aspectRatio: `${designWidth} / ${designHeight}` }),
            }
          : { aspectRatio: `${designWidth} / ${designHeight}` }),
      }}
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
            width: `${designWidth}px`,
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
