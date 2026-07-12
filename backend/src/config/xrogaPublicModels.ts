/**
 * User-facing Xroga AI model names — never expose provider model IDs in the UI.
 */

import type { XrogaModelRole } from './modelRegistry.js';

export interface XrogaPublicModel {
  role: XrogaModelRole;
  /** Shown in dashboard & activity */
  label: string;
  /** Short tagline for tooltips */
  tagline: string;
}

/** Black Hole V∞ engine tiers — maps 1:1 to internal routing roles */
export const XROGA_PUBLIC_MODELS: Record<XrogaModelRole, XrogaPublicModel> = {
  deepseek_flash: {
    role: 'deepseek_flash',
    label: 'Black Hole V∞ · Pulse Core',
    tagline: 'Bulk code generation, fixes, and verification',
  },
  deepseek_pro: {
    role: 'deepseek_pro',
    label: 'Black Hole V∞ · Architect',
    tagline: 'Planning, repo analysis, and complex logic',
  },
  grok_reasoning: {
    role: 'grok_reasoning',
    label: 'Black Hole V∞ · Reasoning',
    tagline: 'Strategy, synthesis, and skeptical code audit',
  },
  grok_fast: {
    role: 'grok_fast',
    label: 'Black Hole V∞ · Velocity',
    tagline: 'Fast UI iteration and quick outlines',
  },
  claude_sonnet: {
    role: 'claude_sonnet',
    label: 'Black Hole V∞ · Vision',
    tagline: 'Premium UI polish and responsive design',
  },
  claude_opus: {
    role: 'claude_opus',
    label: 'Black Hole V∞ · Apex QA',
    tagline: 'Critical security and crypto final review',
  },
  gemini_flash: {
    role: 'gemini_flash',
    label: 'Black Hole V∞ · Reserve',
    tagline: 'Optional cross-check fallback',
  },
};

export function publicModelLabel(role: XrogaModelRole): string {
  return XROGA_PUBLIC_MODELS[role]?.label ?? 'Black Hole V∞ · Core';
}

export function publicModelTagline(role: XrogaModelRole): string {
  return XROGA_PUBLIC_MODELS[role]?.tagline ?? 'Xroga AI processing';
}

/** Strip provider names from user-visible strings */
export function sanitizeUserFacingModelText(text: string): string {
  return text
    .replace(/\bDeepSeek Flash\b/gi, 'Black Hole V∞ · Pulse Core')
    .replace(/\bDeepSeek Pro\b/gi, 'Black Hole V∞ · Architect')
    .replace(/\bGrok 4 Reasoning\b/gi, 'Black Hole V∞ · Reasoning')
    .replace(/\bGrok 4\.5\b/gi, 'Black Hole V∞ · Velocity')
    .replace(/\bGrok 4\b/gi, 'Black Hole V∞ · Reasoning')
    .replace(/\bClaude Sonnet 5?\b/gi, 'Black Hole V∞ · Vision')
    .replace(/\bClaude Opus\b/gi, 'Black Hole V∞ · Apex QA')
    .replace(/\b(deepseek|grok|claude|anthropic|xai|openai|gemini)\b/gi, 'Xroga AI');
}
