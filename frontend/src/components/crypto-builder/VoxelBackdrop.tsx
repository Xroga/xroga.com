/**
 * The voxel scene behind the Crypto Builder page.
 *
 * Two decorative, pointer-transparent pieces: `VoxelBackdrop` (sky, stars, drifting
 * block clouds, ledger grid, rising motes) which spans the page, and `VoxelRidges`
 * (two parallax terrain ridges) which the hero renders at its own bottom edge so the
 * horizon always lands there regardless of how the hero reflows.
 *
 * Both are server components with no state and no effects — the whole thing is CSS
 * animation over static markup, so it costs no JavaScript on the client and cannot
 * cause a hydration mismatch.
 *
 * The scene is theme-aware rather than theme-ignoring. On the light themes it reads
 * as a Minecraft overworld at midday (blue sky, white block clouds, sunlit grass);
 * on the dark themes the same markup becomes night, with the stars and the ore glow
 * fading in. That was the deciding constraint: this page must genuinely follow the
 * selected theme, and a permanently dark cave would have broken it. Day and night
 * are both Minecraft, so nothing was given up to keep it.
 */

/**
 * Deterministic positions.
 *
 * A linear congruential generator run once at module scope. Pure arithmetic, so the
 * server and the client produce byte-identical markup — `Math.random()` here would
 * hydrate into a mismatch on every load.
 */
function scatter(count: number, seed: number): number[] {
  const out: number[] = [];
  let state = seed;
  for (let index = 0; index < count; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    out.push(state / 2147483648);
  }
  return out;
}

const STAR_SEED = scatter(150, 7919);
const STARS = Array.from({ length: 50 }, (_, index) => ({
  left: STAR_SEED[index * 3] * 100,
  top: STAR_SEED[index * 3 + 1] * 58,
  delay: STAR_SEED[index * 3 + 2] * 4,
}));

const SPARK_SEED = scatter(160, 104729);
const SPARKS = Array.from({ length: 40 }, (_, index) => ({
  left: SPARK_SEED[index * 4] * 100,
  top: SPARK_SEED[index * 4 + 1] * 100,
  delay: SPARK_SEED[index * 4 + 2] * 11,
  duration: 7 + SPARK_SEED[index * 4 + 3] * 8,
}));

/**
 * Cloud shapes, as [column, row] block coordinates.
 *
 * Two rows deep with a narrower top, which is what makes a slab read as a cloud
 * rather than as a stray white bar — a single row of blocks is just a line.
 */
const CLOUD_SHAPES = [
  [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [3, 1]],
  [[1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]],
] as const;

/**
 * One entry per cloud. Depth is carried by scale and speed together.
 *
 * Each delay is a negative fraction of that cloud's own duration, which starts it
 * partway along its travel — so the sky is already populated on first paint instead
 * of filling in over the first two minutes.
 */
const CLOUDS = [
  { top: 6, scale: 1, duration: 155, delay: -20, shape: 0 },
  { top: 11, scale: 0.72, duration: 220, delay: -120, shape: 1 },
  { top: 19, scale: 1.18, duration: 265, delay: -70, shape: 2 },
  { top: 27, scale: 0.85, duration: 195, delay: -160, shape: 1 },
  { top: 34, scale: 1.05, duration: 245, delay: -205, shape: 0 },
];

/** Column heights, in blocks, for the two ridges. Hand-tuned to read as terrain. */
const RIDGE_FAR = [4, 5, 5, 6, 7, 7, 6, 5, 5, 6, 7, 8, 8, 7, 6, 5, 4, 4, 5, 6, 7, 7, 6, 5, 4, 4, 5, 5, 4, 3];
const RIDGE_NEAR = [2, 2, 3, 4, 4, 3, 3, 4, 5, 5, 4, 3, 2, 2, 3, 4, 5, 6, 5, 4, 3, 3, 2, 2, 3, 4, 4, 3, 2, 2];

const RIDGE_DEPTH = 9;

function Ridge({ heights, className }: { heights: readonly number[]; className: string }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${heights.length} ${RIDGE_DEPTH}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {heights.map((height, column) => (
        <g key={column}>
          {/* Grass cap first, then the stone body beneath it. */}
          <rect x={column} y={RIDGE_DEPTH - height} width={1} height={1} fill="var(--ridge-cap)" />
          <rect x={column} y={RIDGE_DEPTH - height + 1} width={1} height={height - 1} fill="var(--ridge-body)" />
        </g>
      ))}
    </svg>
  );
}

/** The horizon. Rendered by the hero so it sits on the hero's own bottom edge. */
export function VoxelRidges() {
  return (
    <div className="xv-cb-ridges" aria-hidden="true">
      <Ridge heights={RIDGE_FAR} className="xv-mc-ridge xv-mc-ridge--far" />
      <Ridge heights={RIDGE_NEAR} className="xv-mc-ridge xv-mc-ridge--near" />
    </div>
  );
}

export function VoxelBackdrop() {
  return (
    <div className="xv-mc-backdrop" aria-hidden="true">
      <div className="xv-mc-sky" />

      <div className="xv-mc-stars">
        {STARS.map((star, index) => (
          <i
            key={index}
            className="xv-mc-star"
            style={{ left: `${star.left}%`, top: `${star.top}%`, animationDelay: `${star.delay}s` }}
          />
        ))}
      </div>

      <div className="xv-mc-clouds">
        {CLOUDS.map((cloud, index) => (
          <div
            key={index}
            className="xv-mc-cloud-row"
            style={{
              top: `${cloud.top}%`,
              animationDuration: `${cloud.duration}s`,
              animationDelay: `${cloud.delay}s`,
              ['--cloud-scale' as string]: cloud.scale,
            }}
          >
            {CLOUD_SHAPES[cloud.shape].map(([x, y]) => (
              <i
                key={`${x}:${y}`}
                className="xv-mc-cloud-block"
                style={{ ['--x' as string]: x, ['--y' as string]: y }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* The ledger grid: the one non-Minecraft layer, and the one that says the
          subject is a chain rather than a game. */}
      <div className="xv-mc-chaingrid" />

      <div className="xv-mc-sparks">
        {SPARKS.map((spark, index) => (
          <i
            key={index}
            className="xv-mc-spark"
            style={{
              left: `${spark.left}%`,
              top: `${spark.top}%`,
              animationDelay: `${spark.delay}s`,
              animationDuration: `${spark.duration}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
