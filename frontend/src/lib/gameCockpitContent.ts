/**
 * Game Builder — Creator Cockpit content.
 *
 * Copy and data live here so the components stay structural, following the same
 * split as `gameBuilderContent.ts` (whose FAQ, engine and limits data this file
 * deliberately does not duplicate — the page still imports those directly, so the
 * legally-reviewed wording has exactly one source).
 *
 * Nothing here asserts a generation time, a user count, a rating, a download
 * figure, or a testimonial. The build activity is labelled in the UI as an
 * interface demonstration, because that is what it is: a scripted sequence, not a
 * recording of a real run.
 */

export type CockpitSceneId = 'cyber' | 'mars' | 'drift' | 'dungeon';

/** Which generated systems a preset lights up. Keys match GENERATED_SYSTEMS ids. */
export type SystemId =
  | 'world'
  | 'player'
  | 'enemies'
  | 'combat'
  | 'progression'
  | 'ui'
  | 'audio'
  | 'code';

export type ScenePreset = {
  readonly id: CockpitSceneId;
  /** Shown in the cockpit toolbar. */
  readonly project: string;
  /** The prompt chip in the hero, and the prompt handed to the composer. */
  readonly prompt: string;
  readonly chipLabel: string;
  readonly runtime: string;
  readonly genre: string;
  /**
   * Which silhouette the preview draws. Without this every preset was the same
   * skyline in a different colour, which is exactly the "one image with a colour
   * overlay" the brief rules out.
   */
  readonly shape: 'city' | 'dunes' | 'road' | 'crypt';
  /** Scene rows in the outline panel. */
  readonly scenes: readonly string[];
  /** The inspector's selected object for this preset. */
  readonly inspector: {
    readonly name: string;
    readonly hp: number;
    readonly damage: number;
    readonly speed: string;
    readonly behavior: string;
  };
  readonly systems: readonly SystemId[];
  /** Preview palette. Kept per-scene rather than per-theme so game art keeps its
      colour in the light themes, which is how the reference reads. */
  readonly palette: {
    readonly sky1: string;
    readonly sky2: string;
    readonly far: string;
    readonly mid: string;
    readonly near: string;
    readonly ground: string;
    readonly neon1: string;
    readonly neon2: string;
    readonly glow: string;
  };
};

export const SCENE_PRESETS: readonly ScenePreset[] = [
  {
    id: 'cyber',
    shape: 'city',
    project: 'Cyber Arena',
    prompt: 'A cyber ninja in a neon city',
    chipLabel: 'A cyber ninja in a neon city',
    runtime: 'Phaser',
    genre: 'Action platformer',
    scenes: ['Main Menu', 'Cyber City', 'Arena 1', 'Arena 2', 'Boss Fight', 'Rewards'],
    inspector: { name: 'Enemy — Mech Brute', hp: 1200, damage: 25, speed: '1.2', behavior: 'Aggressive' },
    systems: ['world', 'player', 'enemies', 'combat', 'ui', 'audio', 'code', 'progression'],
    palette: {
      sky1: '#1b0f3a',
      sky2: '#3d1f6b',
      far: '#2a1a52',
      mid: '#1d1240',
      near: '#120b2b',
      ground: '#0b0720',
      neon1: '#ff3fb4',
      neon2: '#2de2e6',
      glow: '#ffb84d',
    },
  },
  {
    id: 'mars',
    shape: 'dunes',
    project: 'Mars Runner',
    prompt: 'Survive on a low-gravity island',
    chipLabel: 'Survive on a low-gravity island',
    runtime: 'Three.js',
    genre: 'Endless runner',
    scenes: ['Main Menu', 'Landing Site', 'Dust Flats', 'Canyon Run', 'Storm Chase', 'Rewards'],
    inspector: { name: 'Enemy — Dust Crawler', hp: 480, damage: 14, speed: '2.4', behavior: 'Pursuing' },
    systems: ['world', 'player', 'enemies', 'progression', 'ui', 'audio', 'code'],
    palette: {
      sky1: '#3a1608',
      sky2: '#8a3b12',
      far: '#5c2610',
      mid: '#3d1a0b',
      near: '#2a1208',
      ground: '#1a0b05',
      neon1: '#ff8c42',
      neon2: '#ffd166',
      glow: '#ff5c2b',
    },
  },
  {
    id: 'drift',
    shape: 'road',
    project: 'Cyber Drift',
    prompt: 'Space racer with upgrades',
    chipLabel: 'Space racer with upgrades',
    runtime: 'Three.js',
    genre: 'Racing',
    scenes: ['Main Menu', 'Garage', 'Neon Mile', 'Tunnel Run', 'Rival Duel', 'Rewards'],
    inspector: { name: 'Rival — Drift AI', hp: 900, damage: 18, speed: '3.6', behavior: 'Blocking' },
    systems: ['world', 'player', 'progression', 'ui', 'audio', 'code', 'combat'],
    palette: {
      sky1: '#120a35',
      sky2: '#4a1470',
      far: '#2d0f55',
      mid: '#1d0a3d',
      near: '#130726',
      ground: '#0a0418',
      neon1: '#c04bff',
      neon2: '#2de2e6',
      glow: '#ff3fb4',
    },
  },
  {
    id: 'dungeon',
    shape: 'crypt',
    project: 'Dungeon Quest',
    prompt: 'Roguelike in a dark dungeon',
    chipLabel: 'Roguelike in a dark dungeon',
    runtime: 'Phaser',
    genre: 'Roguelike',
    scenes: ['Main Menu', 'Torch Hall', 'Crypt 1', 'Crypt 2', 'Boss Fight', 'Rewards'],
    inspector: { name: 'Enemy — Bone Warden', hp: 760, damage: 22, speed: '0.9', behavior: 'Patrolling' },
    systems: ['world', 'player', 'enemies', 'combat', 'progression', 'ui', 'code'],
    palette: {
      sky1: '#1a1206',
      sky2: '#3a2a0c',
      far: '#241a08',
      mid: '#181105',
      near: '#100b03',
      ground: '#0a0702',
      neon1: '#ffb84d',
      neon2: '#ff7a1a',
      glow: '#ffd166',
    },
  },
];

export const DEFAULT_SCENE = SCENE_PRESETS[0];

export function sceneById(id: CockpitSceneId): ScenePreset {
  return SCENE_PRESETS.find((s) => s.id === id) ?? DEFAULT_SCENE;
}

/** The eight systems one request can produce. `short` is the cockpit label. */
export const GENERATED_SYSTEMS: readonly {
  readonly id: SystemId;
  readonly short: string;
  readonly title: string;
  readonly body: string;
}[] = [
  { id: 'world', short: 'World', title: 'World & Levels', body: 'Scene layout, tilemaps or terrain, spawn points, and level flow.' },
  { id: 'player', short: 'Player', title: 'Player Controller', body: 'Input mapping, movement, jump or dash, and collision response.' },
  { id: 'enemies', short: 'Enemies', title: 'Enemies & AI', body: 'Spawners, state machines, pursuit and patrol behaviour.' },
  { id: 'combat', short: 'Combat', title: 'Combat & Collision', body: 'Hitboxes, damage, invulnerability windows, and knockback.' },
  { id: 'progression', short: 'Progression', title: 'Progression', body: 'Score, unlocks, upgrade curves, and save state that survives a reload.' },
  { id: 'ui', short: 'UI / HUD', title: 'UI / UX', body: 'Menus, HUD, pause flow, and end-of-run screens.' },
  { id: 'audio', short: 'Audio', title: 'Audio & SFX', body: 'Audio hooks and event wiring for music and effects you supply.' },
  { id: 'code', short: 'Code', title: 'Code & Project', body: 'Project structure, build config, and readable source in your repository.' },
];

/**
 * The build pipeline. Stage wording is descriptive of work, never of duration —
 * there is no stopwatch and no completion-time claim anywhere on the page.
 */
export const BUILD_STAGES: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'understand', label: 'Understanding your idea' },
  { id: 'architecture', label: 'Creating architecture' },
  { id: 'world', label: 'Generating the world' },
  { id: 'mechanics', label: 'Building game mechanics' },
  { id: 'playtest', label: 'Running preview checks' },
  { id: 'ready', label: 'Game ready to play' },
];

/** The cockpit's compact log. Same stages, phrased as activity lines. */
export const ACTIVITY_LINES: readonly string[] = [
  'Understanding your idea…',
  'Generating project architecture…',
  'Creating world and levels…',
  'Wiring player mechanics…',
  'Adding enemies and behaviors…',
  'Running quick playtest…',
];

export type PlayableExample = {
  readonly scene: CockpitSceneId;
  readonly title: string;
  readonly body: string;
  readonly runtime: string;
  readonly genre: string;
  readonly prompt: string;
};

export const PLAYABLE_EXAMPLES: readonly PlayableExample[] = [
  {
    scene: 'cyber',
    title: 'Neon Rogue',
    body: 'Hack, slash and survive in a dystopian future.',
    runtime: 'Phaser',
    genre: 'Action',
    prompt: 'A cyber ninja in a neon city with dash attacks and boss arenas',
  },
  {
    scene: 'mars',
    title: 'Mars Runner',
    body: 'High speed runner on Mars. Dodge, collect, upgrade.',
    runtime: 'Three.js',
    genre: 'Runner',
    prompt: 'A high speed endless runner on Mars with upgrades and dust storms',
  },
  {
    scene: 'drift',
    title: 'Cyber Drift',
    body: 'Futuristic racing with boosts, drifts and checkpoints.',
    runtime: 'Three.js',
    genre: 'Racing',
    prompt: 'A futuristic racer with boost pads, drifting and checkpoint laps',
  },
  {
    scene: 'dungeon',
    title: 'Dungeon Quest',
    body: 'Top-down dungeon crawler with loot and boss fights.',
    runtime: 'Phaser',
    genre: 'Roguelike',
    prompt: 'A top-down dungeon crawler with procedural rooms, loot and boss fights',
  },
];

/** The iteration example. One instruction, three visible changes. */
export const ITERATION = {
  instruction:
    'Make the dash faster, add a boss every 5 rounds, and change the world to a frozen city.',
  before: { label: 'BEFORE', scene: 'mars' as CockpitSceneId, note: 'Desert arena · dash 1.0× · boss every 10' },
  after: { label: 'AFTER', scene: 'frozen', note: 'Frozen city · dash 1.6× · boss every 5' },
  changes: ['Dash speed 1.0× → 1.6×', 'Boss cadence 10 → 5 rounds', 'World swapped to a frozen city'],
} as const;

/** The repository tree shown in the ownership section. */
export const REPO_TREE: readonly { readonly name: string; readonly kind: 'dir' | 'file' }[] = [
  { name: 'game/', kind: 'dir' },
  { name: 'assets/', kind: 'dir' },
  { name: 'scenes/', kind: 'dir' },
  { name: 'scripts/', kind: 'dir' },
  { name: 'ui/', kind: 'dir' },
  { name: 'README.md', kind: 'file' },
];

/**
 * The code sample. Deliberately real Phaser-shaped code rather than pseudo-code,
 * and deliberately free of any key, token, URL, or repository identifier.
 */
export const REPO_CODE: readonly string[] = [
  "import Player from './player';",
  "import Enemy from './enemy';",
  '',
  'export function startGame(scene) {',
  '  const player = new Player(scene, 64, 320);',
  '  scene.add.existing(player);',
  '',
  '  scene.spawnWave(3, () => new Enemy(scene));',
  '  scene.physics.add.collider(player, scene.enemies);',
  '',
  '  return player;',
  '}',
];

export const TRUST_POINTS: readonly string[] = [
  'Real code in your repo',
  'You own everything',
  'Export and deploy anywhere',
];
