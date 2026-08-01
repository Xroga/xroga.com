import type { PixelGlyphName } from '@/components/crypto-builder/PixelArt';

/**
 * Per-page identity for the shared capability template.
 *
 * The six capability pages differ only in copy — `CapabilityPageData` carries no
 * visual signal at all, which is why every one of them once rendered as the identical
 * page with different words. A pixel glyph and an ore hue give each page a
 * recognisable identity while the layout, motion and structure stay shared.
 *
 * The glyphs and ore names come from the same voxel vocabulary as `/crypto-builder`,
 * so the two surfaces read as one brand rather than two unrelated experiments.
 * Ore hues are decoration only: body text and headings stay on the page's theme
 * tokens, so a page reads correctly in every theme rather than fighting it.
 */
export type CapabilityOre =
  | 'diamond'
  | 'gold'
  | 'emerald'
  | 'redstone'
  | 'lapis'
  | 'amethyst'
  | 'copper'
  | 'netherite';

const IDENTITY: Record<string, { glyph: PixelGlyphName; ore: CapabilityOre }> = {
  'ai-coding-agent': { glyph: 'braces', ore: 'diamond' },
  'ai-app-builder': { glyph: 'bot', ore: 'amethyst' },
  'ai-website-builder': { glyph: 'gem', ore: 'lapis' },
  'build-saas-with-ai': { glyph: 'bank', ore: 'emerald' },
  'github-ai-coding-agent': { glyph: 'branch', ore: 'gold' },
  'vercel-ai-deployment': { glyph: 'rocket', ore: 'redstone' },
};

/** Rotated across the three process steps so the crafting row isn't one repeated tile. */
const PROCESS_GLYPHS: PixelGlyphName[] = ['book', 'braces', 'shield'];
const PROCESS_ORES: CapabilityOre[] = ['lapis', 'emerald', 'diamond'];

export function capabilityIdentity(slug: string) {
  return IDENTITY[slug] ?? { glyph: 'braces' as PixelGlyphName, ore: 'diamond' as CapabilityOre };
}

export function processGlyph(index: number): PixelGlyphName {
  return PROCESS_GLYPHS[index % PROCESS_GLYPHS.length];
}

export function processOre(index: number): CapabilityOre {
  return PROCESS_ORES[index % PROCESS_ORES.length];
}

/** Ore assigned per outcome tile, so a grid of blocks is not one hue repeated. */
const OUTCOME_ORES: CapabilityOre[] = ['diamond', 'gold', 'emerald', 'amethyst', 'copper', 'lapis'];

export function outcomeOre(index: number): CapabilityOre {
  return OUTCOME_ORES[index % OUTCOME_ORES.length];
}
