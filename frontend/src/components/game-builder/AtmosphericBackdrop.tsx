/**
 * The game-world environment the interface sits inside.
 *
 * Built entirely from SVG silhouettes and CSS layers — no raster art, no video, no
 * WebGL. That is a deliberate trade: a photographic matte painting would be the
 * fastest way to match the reference, but it would be hundreds of kilobytes on the
 * critical path, it would need four theme variants, and any convincing one would
 * have to come from somewhere licensed. Vector silhouettes recolour per theme from
 * tokens, cost a couple of kilobytes inside the already-loaded HTML, and cannot
 * shift layout because they are absolutely positioned behind everything.
 *
 * Depth comes from stacking rather than blur: two ridge lines at different scales
 * and opacities, ruined structures on the horizon, a fog band, foreground rock
 * edges framing the viewport, and a small number of drifting embers. Full-screen
 * blur filters were avoided on purpose — they are the most expensive thing you can
 * put behind a scrolling page.
 *
 * Entirely decorative, so the whole tree is `aria-hidden`, and every animation here
 * stops under `prefers-reduced-motion`.
 */
export function AtmosphericBackdrop() {
  return (
    <div className="xv-gc-atmos" aria-hidden="true">
      <div className="xv-gc-atmos__sky" />
      <div className="xv-gc-atmos__haze" />
      <div className="xv-gc-atmos__rim" />

      {/* far ridge + ruined towers */}
      <svg className="xv-gc-atmos__ridge xv-gc-atmos__ridge--far" viewBox="0 0 1440 420" preserveAspectRatio="none">
        <path d="M0 420V236l70-34 62 26 58-52 74 30 66-18 58 44 82-58 70 36 62-22 78 48 66-40 72 26 64-12 70 40 62-28 76 34 70-16 60 30v190Z" />
        <path d="M236 214h26v-56h-26zM252 158l14-22 14 22zM980 226h22v-48h-22zM996 178l12-20 12 20z" opacity="0.9" />
      </svg>

      <svg className="xv-gc-atmos__ridge xv-gc-atmos__ridge--mid" viewBox="0 0 1440 380" preserveAspectRatio="none">
        <path d="M0 380V262l86 22 78-40 90 34 74-16 96 46 84-30 92 38 80-22 88 30 76-38 94 40 82-16 90 34 80-20 70 26v210Z" />
      </svg>

      {/* foreground rock edges — the frame that stops the page reading as a flat panel */}
      <svg className="xv-gc-atmos__edge xv-gc-atmos__edge--left" viewBox="0 0 220 900" preserveAspectRatio="none">
        <path d="M0 0h96l-28 74 40 66-34 92 46 70-30 86 38 78-44 92 34 76-40 88 30 78H0Z" />
      </svg>
      <svg className="xv-gc-atmos__edge xv-gc-atmos__edge--right" viewBox="0 0 220 900" preserveAspectRatio="none">
        <path d="M220 0h-96l28 74-40 66 34 92-46 70 30 86-38 78 44 92-34 76 40 88-30 78h108Z" />
      </svg>

      <div className="xv-gc-atmos__fog" />
      <div className="xv-gc-atmos__embers">
        {EMBERS.map((ember, index) => (
          <i
            key={index}
            style={{
              ['--x' as string]: `${ember.x}%`,
              ['--d' as string]: `${ember.d}s`,
              ['--delay' as string]: `${ember.delay}s`,
              ['--s' as string]: ember.s,
            }}
          />
        ))}
      </div>
      <div className="xv-gc-atmos__floor" />
    </div>
  );
}

/** Fixed positions — a random scatter would differ between server and client. */
const EMBERS = [
  { x: 6, d: 15, delay: 0, s: 1 },
  { x: 17, d: 19, delay: 3, s: 0.7 },
  { x: 29, d: 13, delay: 6, s: 1.2 },
  { x: 44, d: 21, delay: 2, s: 0.8 },
  { x: 58, d: 16, delay: 8, s: 1 },
  { x: 71, d: 18, delay: 4, s: 0.6 },
  { x: 83, d: 14, delay: 9, s: 1.1 },
  { x: 94, d: 20, delay: 1, s: 0.9 },
] as const;
