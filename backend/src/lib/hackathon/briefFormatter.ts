import type { HackathonBrief, HackathonResearchBundle } from './types.js';

function formatDeadline(iso?: string): string {
  if (!iso) return 'See official page';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

export function formatHackathonBriefMarkdown(brief: HackathonBrief): string {
  const lines: string[] = [
    `## Hackathon brief: ${brief.name}`,
    `**Sponsor:** ${brief.sponsor} · **Ecosystem:** ${brief.ecosystem}`,
    `**Deadline:** ${formatDeadline(brief.deadline)} · **Prize pool:** ${brief.prizePool ?? 'See official page'}`,
    `**Build:** ${brief.productType}${brief.cryptoRequired ? '' : ' (crypto not required)'}`,
    '',
    brief.summary,
    '',
    '### Judging criteria',
    ...brief.judgingCriteria.map((c) => `- ${c}`),
  ];

  if (brief.prizeTracks.length) {
    lines.push('', '### Prize tracks');
    for (const t of brief.prizeTracks) {
      lines.push(`- **${t.name}** (${t.prize}) — ${t.criteria}`);
    }
  }

  lines.push('', '### Submission checklist');
  for (const s of brief.submissionSteps) {
    lines.push(`${s.order}. **${s.label}** — ${s.detail}`);
  }

  lines.push('', '### Sponsor gaps (build toward these)');
  lines.push(...brief.sponsorGaps.map((g) => `- ${g}`));

  lines.push('', '### Common rejection reasons');
  lines.push(...brief.rejectReasons.map((r) => `- ${r}`));

  lines.push('', '### Innovation sweet spot');
  lines.push(brief.innovationSweetSpot);

  if (brief.recommendedIdeas.length) {
    lines.push('', '### Recommended ASP ideas (requirement-aligned)');
    for (const idea of brief.recommendedIdeas) {
      lines.push(
        '',
        `#### ${idea.name} → *${idea.targetTrack}*`,
        idea.tagline,
        `**Why novel:** ${idea.whyNovel}`,
        `**Fills sponsor gap:** ${idea.sponsorGapFilled}`,
        `**Build:** ${idea.whatToBuild.join('; ')}`,
        `**Avoid:** ${idea.whatNotToBuild.join('; ')}`,
        `**90s demo:** ${idea.demoStory90s}`
      );
      if (idea.revenuePath) lines.push(`**Revenue:** ${idea.revenuePath}`);
    }
  }

  if (brief.recommendedIdea) {
    lines.push('', '### Top pick for this request');
    lines.push(`**${brief.recommendedIdea.name}** (${brief.recommendedIdea.targetTrack}) — ${brief.recommendedIdea.tagline}`);
  }

  return lines.join('\n');
}

export function buildHackathonContextForEngine(bundle: HackathonResearchBundle): string {
  const b = bundle.brief;
  const pick = b.recommendedIdea ?? b.recommendedIdeas[0];
  const pickBlock = pick
    ? `\n## Selected ASP concept (build this)\nName: ${pick.name}\nTrack: ${pick.targetTrack}\n${pick.tagline}\nBuild: ${pick.whatToBuild.join(', ')}\nDemo story: ${pick.demoStory90s}\nDo NOT build: ${pick.whatNotToBuild.join(', ')}`
    : '';

  return `\n## HACKATHON BUILD MODE — ${b.name}
Mode: ${bundle.buildMode}
Chain: ${bundle.chain ?? 'generic'}

${formatHackathonBriefMarkdown(b)}

## Build instructions for judges
- Product must be listable as ${b.productType}
- Complete agent workflow UI: input → processing steps → deliverable
- Include README section: OKX.AI listing copy, #OKXAI post draft, 90s demo script
- Polish for marketplace review — not a static landing page
- Match innovation sweet spot: novel + sponsor-fit, not over-scoped
${pickBlock}
`;
}

/** Compact card payload for frontend */
export function briefToCardPayload(brief: HackathonBrief) {
  return {
    id: brief.id,
    name: brief.name,
    sponsor: brief.sponsor,
    deadline: brief.deadline,
    prizePool: brief.prizePool,
    registrationUrl: brief.registrationUrl,
    listingUrl: brief.listingUrl,
    productType: brief.productType,
    cryptoRequired: brief.cryptoRequired,
    judgingCriteria: brief.judgingCriteria,
    prizeTracks: brief.prizeTracks.map((t) => ({ name: t.name, prize: t.prize, criteria: t.criteria })),
    submissionSteps: brief.submissionSteps.map((s) => ({ order: s.order, label: s.label, detail: s.detail })),
    sponsorGaps: brief.sponsorGaps,
    rejectReasons: brief.rejectReasons,
    innovationSweetSpot: brief.innovationSweetSpot,
    recommendedIdeas: brief.recommendedIdeas.map((i) => ({
      name: i.name,
      tagline: i.tagline,
      targetTrack: i.targetTrack,
      whyNovel: i.whyNovel,
      sponsorGapFilled: i.sponsorGapFilled,
      demoStory90s: i.demoStory90s,
    })),
    recommendedIdea: brief.recommendedIdea
      ? {
          name: brief.recommendedIdea.name,
          tagline: brief.recommendedIdea.tagline,
          targetTrack: brief.recommendedIdea.targetTrack,
          whyNovel: brief.recommendedIdea.whyNovel,
          sponsorGapFilled: brief.recommendedIdea.sponsorGapFilled,
          demoStory90s: brief.recommendedIdea.demoStory90s,
        }
      : undefined,
    sources: brief.sources,
  };
}
