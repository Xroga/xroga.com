import {
  Blocks,
  Braces,
  FolderGit2,
  GitBranch,
  LayoutDashboard,
  Rocket,
  ShieldCheck,
  Terminal,
  type LucideIcon,
} from 'lucide-react';

/**
 * Per-page identity for the shared capability template.
 *
 * The six capability pages differ only in copy — `CapabilityPageData` carries no
 * visual signal at all, which is why every one of them rendered as the identical
 * page with different words. A hero icon and an accent hue give each page a
 * recognisable identity while the layout, motion and structure stay shared.
 *
 * Hues are decoration only: body text and headings stay on the page's theme tokens,
 * so a page reads as on-brand in every theme rather than fighting it.
 */
export type CapabilityAccent = 'blue' | 'violet' | 'cyan' | 'emerald' | 'amber' | 'rose';

const ACCENT_HEX: Record<CapabilityAccent, string> = {
  blue: '#006aff',
  violet: '#8b5cf6',
  cyan: '#22d3ee',
  emerald: '#22c55e',
  amber: '#f59e0b',
  rose: '#fb7185',
};

export function accentHex(accent: CapabilityAccent): string {
  return ACCENT_HEX[accent];
}

const IDENTITY: Record<string, { icon: LucideIcon; accent: CapabilityAccent }> = {
  'ai-coding-agent': { icon: Terminal, accent: 'blue' },
  'ai-app-builder': { icon: Blocks, accent: 'violet' },
  'ai-website-builder': { icon: LayoutDashboard, accent: 'cyan' },
  'build-saas-with-ai': { icon: Braces, accent: 'emerald' },
  'github-ai-coding-agent': { icon: FolderGit2, accent: 'amber' },
  'vercel-ai-deployment': { icon: Rocket, accent: 'rose' },
};

/** Rotated across the three process steps so the timeline isn't one repeated glyph. */
const PROCESS_ICONS: LucideIcon[] = [ShieldCheck, GitBranch, Rocket];

export function capabilityIdentity(slug: string) {
  return IDENTITY[slug] ?? { icon: Terminal, accent: 'blue' as const };
}

export function processIcon(index: number): LucideIcon {
  return PROCESS_ICONS[index % PROCESS_ICONS.length];
}
