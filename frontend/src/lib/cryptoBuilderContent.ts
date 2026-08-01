/**
 * Crypto Builder page content.
 *
 * Copy and data live here so the page markup stays structural, following the same
 * split as `aboutContent.ts`.
 *
 * Every legal sentence — the non-affiliation notice, the no-guarantee lines, and the
 * organiser fineprint — is carried verbatim from the previous version of this page.
 * The voxel/pixel treatment is presentation; none of it is allowed to soften a
 * disclaimer, and no prize, funding, or performance figure appears anywhere.
 */

import type { PixelGlyphName } from '@/components/crypto-builder/PixelArt';

/** The eight ore identities. Each is a hue used for block art, never for body text. */
export type OreName = 'diamond' | 'gold' | 'emerald' | 'redstone' | 'lapis' | 'amethyst' | 'copper' | 'netherite';

export type BuildKind = {
  readonly title: string;
  readonly body: string;
  readonly ore: OreName;
  readonly glyph: PixelGlyphName;
  /** Shown on the block face, the way an inventory item shows its count. */
  readonly tag: string;
};

/**
 * What the page says you can build. Deliberately broader than hackathons — the
 * wording of each title is unchanged, because the e2e suite asserts a visitor can
 * still read every one of them on the page.
 */
export const BUILD_KINDS: readonly BuildKind[] = [
  {
    title: 'AI crypto agents',
    body: 'Market research, on-chain summarisation, and automation agents that work from sources you approve.',
    ore: 'diamond',
    glyph: 'bot',
    tag: 'AGENT',
  },
  {
    title: 'Web3 applications',
    body: 'Wallet-connected front ends, contract read and write flows, and the APIs behind them.',
    ore: 'emerald',
    glyph: 'braces',
    tag: 'DAPP',
  },
  {
    title: 'DeFi tools and dashboards',
    body: 'Position views, yield comparisons, and analytics over documented public data sources.',
    ore: 'gold',
    glyph: 'chart',
    tag: 'DEFI',
  },
  {
    title: 'DAO and governance tooling',
    body: 'Proposal tracking, voting summaries, treasury views, and contributor workflows.',
    ore: 'amethyst',
    glyph: 'bank',
    tag: 'DAO',
  },
  {
    title: 'Token and wallet utilities',
    body: 'Token utility planners, allowance and approval views, and wallet-facing interfaces.',
    ore: 'copper',
    glyph: 'wallet',
    tag: 'TOKEN',
  },
  {
    title: 'On-chain monitoring',
    body: 'Address and contract watchers, alerting surfaces, and event pipelines.',
    ore: 'redstone',
    glyph: 'eye',
    tag: 'WATCH',
  },
  {
    title: 'Crypto analytics products',
    body: 'Reporting surfaces over indexed data, with the data source stated in the interface.',
    ore: 'lapis',
    glyph: 'chart',
    tag: 'DATA',
  },
  {
    title: 'Hackathon projects',
    body: 'A bounded, demonstrable MVP prepared against the official rules of a public event.',
    ore: 'netherite',
    glyph: 'net',
    tag: 'HACK',
  },
];

export type Stage = {
  readonly title: string;
  readonly body: string;
  readonly glyph: PixelGlyphName;
  readonly ore: OreName;
};

/** The build loop, rendered as a crafting bench: four inputs, one honest output. */
export const STAGES: readonly Stage[] = [
  {
    title: 'Research the brief',
    body: 'Read the official docs, event rules, or protocol references you point Xroga at, and turn them into a bounded plan.',
    glyph: 'book',
    ore: 'lapis',
  },
  {
    title: 'Implement in your repository',
    body: 'Inspect the existing project, apply focused changes, and leave unrelated working code intact.',
    glyph: 'braces',
    ore: 'emerald',
  },
  {
    title: 'Validate before claiming',
    body: 'Run the applicable checks. Work is reported complete only after its required validation actually passes.',
    glyph: 'shield',
    ore: 'diamond',
  },
  {
    title: 'Push and publish',
    body: 'Commit to a repository you own and publish through providers you authorise — with evidence, or the exact blocker.',
    glyph: 'branch',
    ore: 'gold',
  },
];

export const PROMPT_SUGGESTIONS = [
  'Build an AI agent for crypto market research',
  'Create a Web3 hackathon project',
  'Build a DeFi analytics dashboard',
  'Create a DAO governance assistant',
  'Build a token utility planner',
  'Create a blockchain monitoring agent',
] as const;

export const PLACEHOLDERS = [
  'Describe the crypto product or AI agent you want to build…',
  'Build an AI agent that summarises on-chain activity…',
  'Create a DeFi dashboard with position tracking…',
  'Build a DAO proposal and voting assistant…',
  'Create an on-chain monitoring agent with alerts…',
  'Build a Web3 hackathon MVP against the official rules…',
];

/**
 * The coins that drift through the hero.
 *
 * These are pixel renderings of Unicode currency signs and generic gem shapes drawn
 * for this page — not reproductions of any project's logo. Nothing here implies a
 * relationship with an issuer, and no price, ticker feed, or figure is shown.
 */
export const HERO_COINS: readonly { glyph: PixelGlyphName; ore: OreName; label: string }[] = [
  { glyph: 'btc', ore: 'gold', label: 'Bitcoin sign' },
  { glyph: 'eth', ore: 'diamond', label: 'Capital xi, used as the ether sign' },
  { glyph: 'gem', ore: 'emerald', label: 'Cut gem' },
  { glyph: 'usd', ore: 'copper', label: 'Dollar sign' },
  { glyph: 'link', ore: 'lapis', label: 'Chain link' },
  { glyph: 'coin', ore: 'amethyst', label: 'Token' },
];

/**
 * Splash text, in the spirit of the yellow line on the Minecraft title screen.
 *
 * Kept to claims about how this page works. Nothing here promises an outcome, a
 * prize, or a return — the disclaimer directly under the hero has to stay true.
 */
export const HERO_SPLASH = 'Block by block!';
