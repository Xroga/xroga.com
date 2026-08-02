import {
  LEAF_COUNT,
  LEAF_PATH,
  VIEW_BOX,
  leafTransforms,
} from '@/lib/leafLoader';

/**
 * A circular preloader built from curved leaves.
 *
 * Eight petals ring an invisible circle, each leaning into the direction of travel,
 * and the whole group rotates clockwise once per second. No circles, no dots, no
 * border-spinner: the petals are filled cubic paths, so they keep their organic
 * taper at any size and stay crisp at any device pixel ratio.
 *
 * It fills with `currentColor`, so the surrounding button's text colour drives it
 * and a theme never has to reach inside this component.
 *
 * Deliberately not a client component. There is no state, no effect and no event
 * handler here — the animation is CSS — so it renders on the server and adds
 * nothing to the bundle. That also means there is no hydration boundary to
 * mismatch: the markup is identical on both sides because the geometry is derived
 * from constants rather than from anything time- or random-dependent.
 *
 * Decorative by default (`aria-hidden`); the accessible name for a loading state
 * belongs on the control that owns it, not on the ornament inside it.
 */
export function LeafLoader({
  size = 20,
  count = LEAF_COUNT,
  className,
  title,
}: {
  /** Rendered width and height in px. Tested at 16, 18, 20 and 24. */
  size?: number;
  /** Petal count. Eight matches the reference; exposed for reuse elsewhere. */
  count?: number;
  className?: string;
  /**
   * Optional accessible name. Omit when the parent control already announces the
   * loading state — two names for one thing is worse than none.
   */
  title?: string;
}) {
  const petals = leafTransforms(count);

  return (
    <span
      className={`xv-leafloader ${className ?? ''}`}
      style={{ width: size, height: size }}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      <svg viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`} width={size} height={size} focusable="false">
        <g className="xv-leafloader__ring">
          {petals.map((petal) => (
            <path
              key={petal.index}
              className="xv-leafloader__leaf"
              d={LEAF_PATH}
              transform={petal.transform}
              fill="currentColor"
              opacity={petal.opacity}
            />
          ))}
        </g>
      </svg>
    </span>
  );
}
