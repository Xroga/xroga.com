import type { GrowthContentSnapshot } from './pipeline.js';

function section(title: string, lines: string[]): string {
  return `## ${title}\n\n${lines.length ? lines.map((line) => `- ${line}`).join('\n') : '- None supported by current evidence.'}\n`;
}

export function renderGrowthContentReport(snapshot: GrowthContentSnapshot): string {
  const validated = snapshot.validatedCandidates.filter((item) => item.origin === 'VALIDATED_DEMAND');
  const unknownIdeas = snapshot.validatedCandidates.filter((item) => item.origin === 'GENERATED_IDEA');
  const fixes = snapshot.command1.opportunities.filter((item) => item.actionTypes.includes('FIX'));
  const builds = snapshot.command1.opportunities.filter((item) => item.actionTypes.includes('BUILD'));
  return [
    '# Xroga demand and content intelligence',
    '',
    `Generated: ${snapshot.generatedAt}`,
    '',
    'Facts below come from imported/provider evidence. Generated ideas and inferences are labeled; missing data is never rendered as zero.',
    '',
    section('Demand overview', [
      `${validated.length} validated keyword candidates.`,
      `${unknownIdeas.length} generated research ideas remain UNKNOWN until provider/import evidence exists.`,
      ...snapshot.command1.providerStates.map((state) => `${state.provider}: ${state.status}${state.reason ? ` — ${state.reason}` : ''}`),
      ...snapshot.sourceStates.map((state) => `${state.provider}: ${state.status}${state.reason ? ` — ${state.reason}` : ''}`),
    ]),
    section('Validated keywords', validated.map((item) => `${item.query} — ${item.evidenceIds.join(', ')}`)),
    section('Unknown demand', snapshot.unknowns),
    section('Prompt families and query fan-out', snapshot.queryFanOut.map((item) => `${item.promptFamilyId}: ${item.fanOutQuestion} → ${item.coveredByUrl ?? 'missing'} (${item.recommendedAction})`)),
    section('SERP intent', snapshot.searchIntentFindings.map((item) => `${item.topicClusterId}: ${item.decision.intent} (${item.decision.status}) — ${item.decision.reason}`)),
    section('Format opportunities', snapshot.formatOpportunities.map((item) => `${item.topicClusterId}: ${item.observedIntent} — ${item.reason}`)),
    section('Video opportunities', snapshot.videoGaps.map((item) => `${item.topicClusterId}: ${item.potentialVideoTitle}`)),
    section('Competitor content gaps', snapshot.competitorContentGaps.map((item) => `${item.query}: ${item.classification} — evidence ${item.evidence.join(', ')}`)),
    section('Sleeper pages', snapshot.sleepers.map((item) => `${item.url}: ${item.reason}`)),
    section('FIX queue (Command 1)', fixes.map((item) => `${item.id} [${item.priority}] ${item.title}`)),
    section('BUILD queue (Command 1)', builds.map((item) => `${item.id} [${item.priority}] ${item.title}`)),
    section('Cannibalization risks', snapshot.cannibalizationRisks.map((item) => `${item.topicClusterId}: ${item.urls.join(' ↔ ')}`)),
    section('Orphan assets', snapshot.orphanAssets),
    section('Research required', snapshot.unknowns),
    section('Top content briefs', snapshot.briefs.map((brief) => `${brief.briefId}: ${brief.targetUrl} (${brief.action})`)),
    section('Visual requirements', snapshot.briefs.flatMap((brief) => brief.visualManifest.map((visual) => `${brief.targetUrl}: ${visual.type} — ${visual.caption}`))),
    section('Controlled first batch', snapshot.firstBatch.map((item) => `${item.url} ← ${item.opportunityId}: ${item.reason}`)),
    section('Content validation', snapshot.contentValidation.map((item) => `${item.canonical}: ${item.issues.length ? item.issues.join('; ') : 'PASS'}`)),
  ].join('\n');
}
