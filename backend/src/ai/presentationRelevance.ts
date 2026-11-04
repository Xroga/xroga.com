import type { AnswerObligations, PresentationPlan } from './responsePresentation.js';

/**
 * Deterministic relevance gate for a presentation plan. It never calls a model and never rewrites the answer.
 * Rule of thumb: the user's request is the contract. A rich section (diagram, chart, calculator) must either serve
 * something the person actually asked for, or stay inside the subject matter of the request. It does not restrict
 * which subjects Xroga supports; it only stops a section from dragging in a different field that the request never
 * touched (for example a trading calculator in a flight answer, or a microservice diagram in a travel comparison).
 *
 * Intentionally conservative: a section is flagged only when its own text is clearly about a field (two or more
 * distinct cue hits) while the request itself shows none of that field.
 */
export type RelevanceDomain = 'finance-trading' | 'software-architecture' | 'automation-workflow' | 'medical' | 'travel';

const CUES: Record<RelevanceDomain, RegExp[]> = {
  'finance-trading': [/\btrading\b/i, /\bcandlestick/i, /\bportfolio\b/i, /\bcompound(?:ed|ing)?\s+interest\b/i, /\broi\b/i, /\bstock(?:s)?\b/i, /\bforex\b/i, /\bcrypto(?:currency)?\b/i,
    /\bsharpe\b/i, /\bvolatility\b/i, /\bbull(?:ish)?\b|\bbear(?:ish)?\b/i, /\bhedge\b/i, /\bdividend/i],
  'software-architecture': [/\bapi\s+gateway\b/i, /\bmicroservices?\b/i, /\bkubernetes\b/i, /\bdatabase\s+(?:schema|shard)/i, /\bload\s+balancer\b/i, /\bci\/cd\b/i,
    /\bendpoint(?:s)?\b/i, /\bmessage\s+queue\b/i, /\bdocker\b/i, /\bsql\b/i, /\bbackend\b/i, /\bfrontend\b/i, /\bwebhook(?:s)?\b/i],
  'automation-workflow': [/\bautomation(?:s)?\b/i, /\bworkflow(?:s)?\b/i, /\bzapier\b/i, /\bn8n\b/i, /\bcrm\b/i, /\btrigger(?:s)?\b/i, /\bwebhook(?:s)?\b/i, /\bintegration(?:s)?\b/i],
  medical: [/\bdiagnos(?:is|e|tic)\b/i, /\bdosage\b/i, /\bsymptom(?:s)?\b/i, /\bprescription\b/i, /\bclinical\b/i, /\bpatient(?:s)?\b/i],
  travel: [/\bflight(?:s)?\b/i, /\bairline(?:s)?\b/i, /\bairport(?:s)?\b/i, /\bitinerary\b/i, /\blayover\b/i, /\bbaggage\b/i, /\bhotel(?:s)?\b/i, /\bfare(?:s)?\b/i],
};

/** Fields a plan section may bring in only when the request shows them. `travel` is checked in the other direction. */
const GUARDED: RelevanceDomain[] = ['finance-trading', 'software-architecture', 'automation-workflow', 'medical'];

function hits(text: string, domain: RelevanceDomain): number {
  return CUES[domain].filter(cue => cue.test(text)).length;
}

export interface RelevanceIssue { code: 'off-topic-section'; heading: string; domain: RelevanceDomain; kind: string; }

/**
 * `origin: requested` obligations are the person's own words and always keep their section. Only sections that
 * cover nothing but model-added support (or nothing at all) can be flagged as drifting into another field.
 */
export function assessPresentationRelevance(prompt: string, plan: PresentationPlan, obligations: AnswerObligations = []): { relevant: boolean; issues: string[]; detail: RelevanceIssue[] } {
  const detail: RelevanceIssue[] = [];
  const requested = new Set(obligations.filter(item => item.origin === 'requested').map(item => item.id));
  const promptDomains = new Set(GUARDED.filter(domain => hits(prompt, domain) >= 1));
  // A request about travel never needs another field's machinery, even if a model considers it "supporting".
  const travelPrompt = hits(prompt, 'travel') >= 1;
  for (const section of plan) {
    if (section.covers?.some(id => requested.has(id))) continue;
    const text = `${section.heading}\n${section.instruction}`;
    for (const domain of GUARDED) {
      if (promptDomains.has(domain)) continue;
      const strong = hits(text, domain) >= 2;
      const richAndAlien = travelPrompt && section.kind !== 'prose' && section.kind !== 'steps' && hits(text, domain) >= 1;
      if (strong || richAndAlien) detail.push({ code: 'off-topic-section', heading: section.heading, domain, kind: section.kind });
    }
  }
  const unique = [...new Map(detail.map(item => [`${item.heading}:${item.domain}`, item])).values()];
  return { relevant: unique.length === 0, issues: unique.map(item => `off-topic:${item.domain}:${item.heading}`), detail: unique };
}
