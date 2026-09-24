import type { AuthoritySnapshot } from './pipeline.js';

function section(title: string, lines: readonly string[]): string {
  return `## ${title}\n\n${lines.length ? lines.join('\n') : '- NO_DATA — no evidence-backed records available.'}\n`;
}

export function renderAuthorityReport(snapshot: AuthoritySnapshot): string {
  const owned = snapshot.graph.nodes.filter((node) => node.ownership === 'OWNED');
  const earned = snapshot.source.receipts.filter((item) => ['VERIFIED_MENTION', 'VERIFIED_LINK'].includes(item.status));
  const selected = snapshot.source.satellites.filter((item) => item.decision === 'SELECTED_WEDGE');
  return [
    '# Xroga Distributed Authority Report', '', `Generated: ${snapshot.generatedAt}`, '',
    '> FACT, OBSERVATION, INFERENCE and UNKNOWN remain distinct. This report does not send outreach or claim unverified authority.', '',
    section('Authority executive summary', [
      `- FACT — ${snapshot.graph.nodes.length} authority nodes and ${snapshot.graph.edges.length} evidence-linked relationships are modeled.`,
      `- FACT — ${owned.length} owned distribution assets are currently represented.`,
      `- FACT — ${earned.length} independently verified earned mention/link receipts are available.`,
      `- UNKNOWN — ${snapshot.unknowns.length} external evidence limitations remain explicit.`,
    ]),
    section('Desired associations', snapshot.command1.source.associations.filter((item) => item.status === 'ACTIVE').slice(0, 12).map((item) => `- ${item.association} — desired ${item.desiredStrength}/5; evidence ${item.confidence}.`)),
    section('Owned distribution', owned.map((node) => `- ${node.type}: ${node.label}${node.url ? ` — ${node.url}` : ''}`)),
    section('Earned authority', earned.map((item) => `- ${item.status}: ${item.externalUrl} — verified ${item.verificationDate}`)),
    section('Mention Intersect', snapshot.influenceOpportunities.map((item) => `- ${item.priority} ${item.id}: ${item.action}; score ${item.score}; ${item.whyRelevant}`)),
    section('Top influence opportunities', snapshot.influenceOpportunities.filter((item) => item.action !== 'REJECT').slice(0, 10).map((item) => `- ${item.id}: ${item.proposedValue}`)),
    section('External narrative gaps', snapshot.narrativeCorrections.map((item) => `- ${item.sourceId}: verify ${item.factKey} against ${item.supportingSource}.`)),
    section('GitHub discovery', [
      `- Repository: ${snapshot.githubAudit.observed.repository} (${snapshot.githubAudit.observed.visibility}).`,
      `- Topics: ${snapshot.githubAudit.observed.topics.length ? snapshot.githubAudit.observed.topics.join(', ') : 'NONE'}.`,
      `- Releases: ${snapshot.githubAudit.observed.releases}. License: ${snapshot.githubAudit.observed.license ?? 'OWNER_DECISION_REQUIRED'}.`,
      ...snapshot.githubAudit.findings.map((item) => `- ${item}`),
    ]),
    section('Open-source assets', snapshot.source.satellites.map((item) => `- ${item.kind}: ${item.decision}; release-ready ${item.releaseReady ? 'yes' : 'no'} — ${item.rationale.join(' ')}`)),
    section('MCP status', snapshot.source.satellites.filter((item) => item.kind === 'MCP').map((item) => `- ${item.decision}: ${item.rationale.join(' ')}`)),
    section('CLI status', snapshot.source.satellites.filter((item) => item.kind === 'CLI').map((item) => `- ${item.decision}: ${item.rationale.join(' ')}`)),
    section('Action status', snapshot.source.satellites.filter((item) => item.kind === 'ACTION').map((item) => `- ${item.decision}: ${item.rationale.join(' ')}${item.blockers.length ? ` Blockers: ${item.blockers.join(' ')}` : ''}`)),
    section('Badge status', ['- Computed project-check badges are generated locally from the deterministic result; no generic “Xroga Verified” claim is made.']),
    section('Public report status', ['- Architecture is gated by repository visibility, explicit owner opt-in, privacy class, uniqueness and substantive value. No public project report was created.']),
    section('Video SERP opportunities', snapshot.videoOpportunities.map((item) => `- ${item.priority}: ${item.query} → ${item.associatedPage}; ${item.status}.`)),
    section('Creator opportunities', snapshot.creatorQualification.map((item) => `- ${item.creatorId}: ${item.qualified ? 'QUALIFIED' : 'NOT QUALIFIED'} — ${item.reason}`)),
    section('Community opportunities', snapshot.communityFindings.map((item) => `- ${item.opportunityId}: ${item.issues.length ? item.issues.join(' ') : 'Policy-valid opportunity.'}`)),
    section('Research distribution', ['- No original Command 2 study with a public dataset is currently available; no research pitch was fabricated.']),
    section('Release distribution', ['- GitHub release count is zero. Release notes and external distribution remain blocked by version-policy owner decision.']),
    section('First controlled batch', snapshot.firstControlledBatch.map((item) => `- ${item.status}: ${item.id} — ${item.reason}`)),
    section('Selected first wedge', selected.map((item) => `- ${item.kind}: ${item.purpose} — ${item.rationale.join(' ')}`)),
    section('Missing data', snapshot.unknowns.map((item) => `- ${item}`)),
    section('Owner decisions', snapshot.ownerDecisions.map((item) => `- ${item}`)),
  ].join('\n');
}
