import type { PixelGlyphName } from '@/components/crypto-builder/PixelArt';

/**
 * Game Builder page content.
 *
 * Copy and data live here so the page markup stays structural, following the same
 * split as `aboutContent.ts` and `cryptoBuilderContent.ts`.
 *
 * All copy is original. The page is built in the visual conventions the game-dev
 * genre shares — voxel art, engine badges, genre grids, a pipeline — but no text,
 * layout, or asset is reproduced from another company's site. Nothing here claims a
 * partnership with, or endorsement by, any engine or storefront: engines are named
 * only as targets a builder can ask for, which is a factual statement about scope.
 *
 * No claim about performance, revenue, downloads, store approval, or ranking appears
 * anywhere, and the limits section says so explicitly.
 */

export type GameKind = {
  readonly title: string;
  readonly body: string;
  readonly ore: string;
  readonly glyph: PixelGlyphName;
  readonly tag: string;
};

/** What the page says you can build. Deliberately genre-led, since that is how a builder searches. */
export const GAME_KINDS: readonly GameKind[] = [
  {
    title: '2D platformers',
    body: 'Tile maps, character controllers, collision, parallax layers, and level progression in a real project.',
    ore: 'emerald',
    glyph: 'gem',
    tag: 'PLATFORM',
  },
  {
    title: 'Puzzle and logic games',
    body: 'Grid state, move validation, undo history, level definitions, and win conditions you can extend.',
    ore: 'lapis',
    glyph: 'braces',
    tag: 'PUZZLE',
  },
  {
    title: 'Top-down and roguelike',
    body: 'Procedural rooms, pathfinding, enemy behaviour, inventory, and run-based progression systems.',
    ore: 'amethyst',
    glyph: 'net',
    tag: 'ROGUE',
  },
  {
    title: 'Voxel and sandbox worlds',
    body: 'Chunked terrain, block placement and removal, greedy meshing, and first-person movement.',
    ore: 'diamond',
    glyph: 'pick',
    tag: 'VOXEL',
  },
  {
    title: 'Idle and simulation',
    body: 'Resource curves, upgrade trees, offline progress, and save state that survives a reload.',
    ore: 'gold',
    glyph: 'chart',
    tag: 'IDLE',
  },
  {
    title: 'Multiplayer prototypes',
    body: 'Authoritative server state, room join flows, and synchronised movement over a real connection.',
    ore: 'redstone',
    glyph: 'bolt',
    tag: 'MULTI',
  },
  {
    title: 'Game jam entries',
    body: 'A bounded, playable build prepared against the stated theme and deadline of a public jam.',
    ore: 'copper',
    glyph: 'rocket',
    tag: 'JAM',
  },
  {
    title: 'Playable web demos',
    body: 'Canvas or WebGL builds that load in a browser, with input, audio hooks, and a share link.',
    ore: 'netherite',
    glyph: 'eye',
    tag: 'WEB',
  },
];

/**
 * Engines and runtimes a builder can target.
 *
 * Named as targets, not partners. `note` describes what Xroga can do with each and
 * where the boundary sits, so nobody reads the row as a guarantee.
 */
export const GAME_STACKS: readonly { name: string; kind: string; note: string }[] = [
  { name: 'Phaser', kind: '2D web engine', note: 'Scenes, sprites, physics, and tilemaps in a TypeScript project you own.' },
  { name: 'Three.js', kind: '3D web runtime', note: 'Meshes, cameras, lighting, and loaders for browser-based 3D scenes.' },
  { name: 'PixiJS', kind: '2D renderer', note: 'High-throughput sprite rendering for effects-heavy 2D games.' },
  { name: 'HTML Canvas', kind: 'No-dependency 2D', note: 'A game loop and renderer with no engine dependency at all.' },
  { name: 'Godot', kind: 'Editor-based engine', note: 'GDScript and scene files. Editor steps and exports stay on your machine.' },
  { name: 'Unity', kind: 'Editor-based engine', note: 'C# scripts and assets. Builds and licensing run through your own Unity install.' },
];

/** The pipeline. Deliberately mirrors the honest build loop the rest of the site uses. */
export const GAME_PIPELINE: readonly { title: string; body: string; glyph: PixelGlyphName }[] = [
  {
    title: 'Design the loop',
    body: 'Name the core action, the failure state, and the reason to play again. A game without a loop is a scene.',
    glyph: 'book',
  },
  {
    title: 'Build the systems',
    body: 'Input, state, collision, and rendering land in one repository, following the patterns already there.',
    glyph: 'braces',
  },
  {
    title: 'Play it, then fix it',
    body: 'The build runs and applicable checks execute. Work is reported complete only after they actually pass.',
    glyph: 'shield',
  },
  {
    title: 'Ship and share',
    body: 'Commit to a repository you own and publish through providers you authorise — with evidence, or the exact blocker.',
    glyph: 'branch',
  },
];

export const GAME_PROMPTS = [
  'Build a 2D platformer with tilemap levels',
  'Create a voxel sandbox I can walk around in',
  'Build a roguelike with procedural rooms',
  'Make a puzzle game with undo and level select',
  'Create an idle game with an upgrade tree',
  'Build a browser game for a game jam',
] as const;

export const GAME_PLACEHOLDERS = [
  'Describe the game you want to build…',
  'Build a 2D platformer with double jump and coins…',
  'Create a voxel world with block placing…',
  'Make a top-down roguelike with procedural rooms…',
  'Build a puzzle game with undo and 20 levels…',
  'Create a browser game I can share with a link…',
];

/**
 * FAQ. Present because these are real questions a builder searches for, and because
 * an answered question is the kind of content that earns a result rather than
 * keyword stuffing. Every answer states a limit rather than overselling.
 */
export const GAME_FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'Can Xroga build a complete game?',
    a: 'It can build a playable game with real systems — input, state, collision, rendering, and progression — inside a repository you own. Scope depends on what you describe and how much you iterate. A polished, content-complete commercial title is the result of sustained work, not a single prompt.',
  },
  {
    q: 'Do I own the code and the game?',
    a: 'Yes. The work happens in a repository connected to your own GitHub account, so the source stays inspectable and portable. Xroga does not hold your project inside a closed editor you cannot export from.',
  },
  {
    q: 'Which engines can it target?',
    a: 'Web-first engines and runtimes are the strongest fit, because the build and the result can both be verified in a browser: Phaser, Three.js, PixiJS, and plain Canvas. Editor-based engines such as Godot and Unity are supported at the code and asset level; steps that require the editor or a local build toolchain run on your machine.',
  },
  {
    q: 'Can it make the art and sound?',
    a: 'It can generate placeholder art, procedural or geometric visuals, and wire up audio hooks. Final art direction, licensed music, and commissioned assets are yours to supply. Xroga will state when a placeholder is standing in for a real asset rather than presenting it as finished.',
  },
  {
    q: 'Can I publish to Steam, itch.io, or an app store?',
    a: 'A web build can be deployed through a provider you authorise. Storefront submission — Steam, itch.io, App Store, Google Play — requires your own developer account, and each has its own review, fees, and policy. Xroga prepares the build and reports the exact external setup still required rather than claiming a submission happened.',
  },
  {
    q: 'Will the game run well?',
    a: 'Xroga can implement common performance practices and report what a real build and any applicable checks produced. It does not guarantee a frame rate. Actual performance depends on the device, the scene, the asset budget, and the browser or platform.',
  },
];

/** Carried into the page verbatim. This is the boundary statement, not marketing copy. */
export const GAME_LIMITS =
  'Xroga does not guarantee game performance, frame rate, store approval, downloads, revenue, ratings, or discovery. Storefronts, engines, and asset licences are external systems with their own accounts, fees, and review policies. Xroga reports evidence from a real build, a real failure, or the exact external setup still required.';

/** Splash text, in the spirit of the yellow line on a title screen. */
export const GAME_SPLASH = 'Now with 100% more loops!';
