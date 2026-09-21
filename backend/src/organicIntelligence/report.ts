import type { IntelligenceSnapshot } from './intelligence.js';

function section(title: string, lines: readonly string[]): string {
  return `## ${title}\n\n${lines.length ? lines.join('\n') : '- No evidence-backed records available.'}\n`;
}

export function renderReport(snapshot: IntelligenceSnapshot): string {
  const top = snapshot.opportunities.slice(0, 10);
  const byAction = (action: string) => snapshot.opportunities.filter((item) => item.actionTypes.includes(action as never)).slice(0, 10)
    .map((item) => `- **${item.priority} — ${item.title}**: ${item.rationale[0]} ${item.rationale.at(-1)}`);
  const entitiesByType = new Map<string, number>();
  for (const entity of snapshot.source.entities) entitiesByType.set(entity.entityType, (entitiesByType.get(entity.entityType) ?? 0) + 1);
  const associations = snapshot.source.associations.filter((item) => item.status === 'ACTIVE').sort((left, right) => {
    const l = typeof left.importance === 'number' ? left.importance : -1;
    const r = typeof right.importance === 'number' ? right.importance : -1;
    return r - l;
  });
  const gapCounts = new Map<string, number>();
  for (const gap of snapshot.gaps) gapCounts.set(gap.gapType, (gapCounts.get(gap.gapType) ?? 0) + 1);
  const evidenceCounts = new Map<string, number>();
  for (const gap of snapshot.gaps) for (const evidence of gap.evidence) evidenceCounts.set(evidence.confidence, (evidenceCounts.get(evidence.confidence) ?? 0) + 1);
  const platformLines = snapshot.aiVisibilityByPlatform.map((item) => item.status === 'AVAILABLE'
    ? `- ${item.platform}: ${item.sampleSize} sampled response${item.sampleSize === 1 ? '' : 's'}; mention ${Math.round((item.mentionRate ?? 0) * 100)}%; citation ${Math.round((item.citationRate ?? 0) * 100)}%; absence ${Math.round((item.absenceRate ?? 0) * 100)}%; inaccurate ${Math.round((item.inaccurateRate ?? 0) * 100)}%.`
    : `- ${item.platform}: NO_DATA.`);
  return [
    '# Xroga Organic Intelligence Report',
    '',
    `Generated: ${snapshot.generatedAt}`,
    '',
    '> This is a diagnosis baseline, not a traffic forecast. UNKNOWN and NO_DATA values are intentionally preserved.',
    '',
    section('Executive summary', [
      `- ${snapshot.source.entities.length} validated entities and ${snapshot.source.associations.length} desired associations are in the graph.`,
      `- ${snapshot.gaps.length} evidence-scoped gap records produced ${snapshot.opportunities.length} explainable opportunities.`,
      `- AI visibility status: ${snapshot.aiVisibility.status}; no probabilistic metric is reported without samples.`,
      `- Validation issues: ${snapshot.validationIssues.length}.`,
    ]),
    section('Current entity position', [...entitiesByType.entries()].sort().map(([type, count]) => `- ${type}: ${count}`)),
    section('Top desired associations', [
      '- Strength values are internal repository-audit baselines, not external search or AI visibility measurements.',
      ...associations.slice(0, 12).map((item) => `- **${item.association}** — desired ${item.desiredStrength}/5, internal baseline ${item.currentStrength}/5, source confidence ${item.confidence}.`),
    ]),
    section('Search visibility status', snapshot.providerStates.filter((item) => ['google-search-console-import', 'ahrefs'].includes(item.provider)).map((item) => `- ${item.provider}: ${item.status}${item.reason ? ` — ${item.reason}` : ''}`)),
    section('AI visibility status', snapshot.aiVisibility.status === 'NO_DATA'
      ? ['- NO_DATA — import sampled observations before calculating mention or citation rates.']
      : platformLines),
    section('Competitor visibility', snapshot.gaps.filter((item) => item.gapType === 'VISIBILITY').map((item) => `- ${item.platform}: ${item.competitorIds.join(', ')} present while Xroga was absent for ${item.topicClusterId}; evidence ${item.evidenceQuality}.`)),
    section('Six Brand Gaps', ['VISIBILITY', 'NARRATIVE', 'TOPIC', 'FORMAT', 'WEB_MENTION', 'DEMAND'].map((type) => `- ${type}: ${gapCounts.get(type) ?? 0}`)),
    section('Top FIX opportunities', byAction('FIX')),
    section('Top BUILD opportunities', byAction('BUILD')),
    section('Top INFLUENCE opportunities', byAction('INFLUENCE')),
    section('Top PRODUCT opportunities', byAction('PRODUCT')),
    section('Top non-branded demand clusters', snapshot.source.demand.filter((item) => item.kind === 'TOPIC_CLUSTER').slice(0, 15).map((item) => `- ${item.value} — ${item.strategy}; demand ${item.dataStatus}.`)),
    section('Top prompt families', snapshot.source.demand.filter((item) => item.kind === 'PROMPT_FAMILY').slice(0, 12).map((item) => `- ${item.value}`)),
    section('Top format gaps', snapshot.formatGaps.slice(0, 12).map((item) => `- ${item.topicClusterId}: ${item.format} (${item.priority})`)),
    section('Top mention intersect sources', snapshot.mentionIntersect.slice(0, 12).map((item) => `- ${item.sourceDomain}: ${item.sourceUrl}`)),
    section('Evidence state', ['VERIFIED', 'OBSERVED', 'INFERRED', 'UNKNOWN', 'STALE'].map((state) => `- ${state}: ${evidenceCounts.get(state) ?? 0} attached gap-evidence records.`)),
    section('Data missing / unknown', snapshot.unknowns.map((item) => `- ${item}`)),
    section('Next priorities', top.slice(0, 8).map((item) => `- **${item.priority} — ${item.title}**: ${item.recommendedWork.join(' ')}`)),
  ].join('\n');
}
