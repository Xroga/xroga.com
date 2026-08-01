/**
 * Pixel art primitives for the Crypto Builder page.
 *
 * Every glyph and block here is a hand-authored bitmap emitted as SVG rects with
 * `shapeRendering="crispEdges"`, so it stays hard-edged at any size and needs no
 * image asset, no sprite sheet, and no network request. Two consequences worth
 * stating: the art scales losslessly on a phone and on a 4K display, and none of it
 * can drift out of sync with the palette, because the rects inherit `currentColor`.
 *
 * The glyphs are original drawings. Two are Unicode currency signs rendered as
 * pixels (₿ and Ξ); the rest are generic shapes — a gem, a chain link, a token
 * disc. No project's logo is reproduced or implied.
 */

/** Bitmaps are 8×8. '#' paints, anything else is transparent. */
const GLYPHS = {
  /** ₿ — the Bitcoin sign, drawn as a B with the two strokes crossing it. */
  btc: ['..#.#...', '.#####..', '.#...#..', '.#####..', '.#...#..', '.#####..', '..#.#...', '........'],
  /** Ξ — capital xi, used as the ether sign. */
  eth: ['........', '.######.', '........', '.######.', '........', '.######.', '........', '........'],
  /** $ — a stem through an S. */
  usd: ['...#....', '..####..', '.#.#....', '..###...', '...#.#..', '..####..', '...#....', '........'],
  /** A cut gem. Doubles as the diamond in the ore blocks. */
  gem: ['..####..', '.######.', '########', '.######.', '..####..', '...##...', '........', '........'],
  /** A token disc. */
  coin: ['..####..', '.#....#.', '#..##..#', '#.####.#', '#.####.#', '#..##..#', '.#....#.', '..####..'],
  /** Two squares locked corner to corner — a chain link. */
  link: ['.###....', '.#.#....', '.###....', '...###..', '...#.#..', '...###..', '........', '........'],
  /** A pickaxe. */
  pick: ['.######.', '##....##', '#..##..#', '...##...', '..##....', '.##.....', '##......', '#.......'],
  /** A robot head — the agent blocks. */
  bot: ['..#..#..', '...##...', '.######.', '#.#..#.#', '#.####.#', '#.#..#.#', '.######.', '..#..#..'],
  /** Curly braces — application code. */
  braces: ['..#..#..', '.#....#.', '.#....#.', '#......#', '#......#', '.#....#.', '.#....#.', '..#..#..'],
  /** Ascending bars. */
  chart: ['........', '......##', '......##', '...##.##', '...##.##', '##.##.##', '##.##.##', '##.##.##'],
  /** A columned building — governance. */
  bank: ['...##...', '..####..', '.######.', '########', '.#.##.#.', '.#.##.#.', '.#.##.#.', '########'],
  /** A wallet with a clasp. */
  wallet: ['........', '#######.', '#.....##', '#....#.#', '#....#.#', '#.....##', '#######.', '........'],
  /** An eye — monitoring. */
  eye: ['..####..', '.#....#.', '#..##..#', '#.####.#', '#..##..#', '.#....#.', '..####..', '........'],
  /** Four nodes around a hub. */
  net: ['##....##', '##....##', '.#....#.', '..####..', '..####..', '.#....#.', '##....##', '##....##'],
  /** A shield — validation. */
  shield: ['.######.', '.#....#.', '.#.##.#.', '.#.##.#.', '.#....#.', '..#..#..', '...##...', '........'],
  /** An open book — research. */
  book: ['........', '.######.', '.#....#.', '.#.##.#.', '.#....#.', '.#.##.#.', '.#....#.', '.######.'],
  /** Two heads merging into one — a branch. */
  branch: ['.##..##.', '.##..##.', '..#...#.', '..#####.', '..#.....', '..#.....', '.###....', '.###....'],
  /** A rocket. */
  rocket: ['...##...', '..####..', '..####..', '.######.', '.######.', '##.##.##', '##.##.##', '...##...'],
  /** A right arrow. */
  arrow: ['........', '....#...', '.....#..', '########', '.....#..', '....#...', '........', '........'],
  /** A lightning bolt. */
  bolt: ['....##..', '...##...', '..##....', '.#####..', '...##...', '..##....', '.##.....', '........'],
} as const;

export type PixelGlyphName = keyof typeof GLYPHS;

/**
 * A glyph, painted in `currentColor` so callers style it like any other icon.
 *
 * Decorative by default. Pass `title` only when the glyph is the sole carrier of a
 * meaning — everywhere on this page it sits beside real text, so it stays hidden
 * from assistive technology instead of repeating the label next to it.
 */
export function PixelGlyph({
  name,
  size = 24,
  className,
  title,
}: {
  name: PixelGlyphName;
  size?: number;
  className?: string;
  title?: string;
}) {
  const rows = GLYPHS[name];
  const cells: React.ReactElement[] = [];
  rows.forEach((row, y) => {
    row.split('').forEach((cell, x) => {
      if (cell === '#') cells.push(<rect key={`${x}:${y}`} x={x} y={y} width={1} height={1} />);
    });
  });

  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {cells}
    </svg>
  );
}

/* ------------------------------------------------------------------ ore blocks */

/**
 * Stone shading. Fixed rather than random: a seeded texture would still have to
 * agree between the server render and the client hydration, and hardcoding it costs
 * nothing while removing that whole class of mismatch.
 */
const STONE_SHADE = [
  'l..d..l.',
  '..d...dl',
  '.l...d..',
  'd...l..d',
  '..d...l.',
  'l...d..d',
  '..l..d..',
  'd..l...l',
];

/** Three speck layouts, cycled by index, so a grid of blocks is not eight clones. */
const ORE_VEINS = [
  ['........', '.oh.....', '.ooo..o.', '..o..oho', '.....ooo', '..oh....', '.ooo....', '..o.....'],
  ['..o.....', '.oho....', '..o..oh.', '.....ooo', '..oo..o.', '.oho....', '..o.....', '.....oh.'],
  ['.....o..', '....oho.', '.oh..o..', '.ooo....', '..o...oh', '.....ooo', '..oh....', '..oo....'],
];

/**
 * A mineable ore block.
 *
 * Drawn as stone with a vein of the given ore colour. The colours arrive as CSS
 * custom properties set by the stylesheet (`--ore`, `--ore-lit`), which is what lets
 * the same component read as a sunlit overworld block on a light theme and a
 * torch-lit cave block on a dark one without a second copy of the art.
 */
export function OreBlock({ variant = 0, size = 64, className }: { variant?: number; size?: number; className?: string }) {
  const vein = ORE_VEINS[variant % ORE_VEINS.length];
  const stone: React.ReactElement[] = [];
  const gems: React.ReactElement[] = [];

  STONE_SHADE.forEach((row, y) => {
    row.split('').forEach((cell, x) => {
      const fill = cell === 'l' ? 'var(--mc-stone-lit)' : cell === 'd' ? 'var(--mc-stone-dim)' : null;
      if (fill) stone.push(<rect key={`s${x}:${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    });
  });

  vein.forEach((row, y) => {
    row.split('').forEach((cell, x) => {
      const fill = cell === 'o' ? 'var(--ore)' : cell === 'h' ? 'var(--ore-lit)' : null;
      if (fill) gems.push(<rect key={`o${x}:${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    });
  });

  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect x={0} y={0} width={8} height={8} fill="var(--mc-stone)" />
      {stone}
      {gems}
      {/* Bevel last, so the block reads as lit from the top-left like every other
          surface on the page rather than as a flat tile. */}
      <path d="M0 0h8v1H0z M0 0h1v8H0z" fill="var(--mc-bevel-lit)" />
      <path d="M0 7h8v1H0z M7 0h1v8H7z" fill="var(--mc-bevel-dim)" />
    </svg>
  );
}
