import type { XrogaConnectSearchResult, XrogaConnectTool } from './composioClient.js';

/** Provider-authored hints are data, never an expansion of the approved tool set. */
export function boundedComposioGuidance(
  discovery: Pick<XrogaConnectSearchResult, 'guidance' | 'skill'>,
  availableTools: Pick<XrogaConnectTool, 'slug'>[],
): {
  executionGuidance: string;
  skill: {
    primaryToolSlugs: string[];
    relatedToolSlugs: string[];
    difficulty?: string;
    recommendedPlanSteps: string[];
    knownPitfalls: string[];
  } | null;
} {
  const allowed = new Set(availableTools.map((tool) => tool.slug));
  const skill = discovery.skill;
  if (!skill) {
    return { executionGuidance: discovery.guidance?.slice(0, 2_000) ?? '', skill: null };
  }
  const boundedLines = (lines: string[]) => lines.slice(0, 6).map((line) =>
    line.slice(0, 400).replace(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g, (slug) =>
      allowed.has(slug) ? slug : '[unavailable tool]',
    ),
  );
  return {
    executionGuidance: discovery.guidance?.slice(0, 2_000) ?? '',
    skill: {
      primaryToolSlugs: skill.primaryToolSlugs.filter((slug) => allowed.has(slug)).slice(0, 12),
      relatedToolSlugs: skill.relatedToolSlugs.filter((slug) => allowed.has(slug)).slice(0, 12),
      ...(skill.difficulty ? { difficulty: skill.difficulty.slice(0, 160) } : {}),
      recommendedPlanSteps: boundedLines(skill.recommendedPlanSteps),
      knownPitfalls: boundedLines(skill.knownPitfalls),
    },
  };
}

export function rankToolsBySkill<T extends Pick<XrogaConnectTool, 'slug'>>(
  tools: T[],
  skill: XrogaConnectSearchResult['skill'],
): T[] {
  if (!skill?.primaryToolSlugs.length) return tools;
  const rank = new Map(skill.primaryToolSlugs.map((slug, index) => [slug, index]));
  return tools.map((tool, index) => ({ tool, index }))
    .sort((left, right) => (rank.get(left.tool.slug) ?? Infinity) - (rank.get(right.tool.slug) ?? Infinity) || left.index - right.index)
    .map(({ tool }) => tool);
}
