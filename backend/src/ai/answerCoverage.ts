import { assessPresentationCoverage, type AnswerObligations, type PresentationPlan } from './responsePresentation.js';

/** A lower bound on explicit output requests, supplementing the semantic
 * planner. No generated facts, brand templates, sources or second model call. */
export function requestedAnswerObligations(prompt: string): AnswerObligations {
  const sentences = prompt.slice(0, 32_000).split(/(?<=[.!?\n])\s+/u);
  const result: AnswerObligations = [];
  const requests: Array<[string, RegExp, PresentationPlan[number]['kind']]> = [
    ['diagram', /\b(?:diagram|flowchart|architecture\s+(?:map|graph))\b/i, 'graph'],
    ['schema', /\b(?:database\s+(?:schema|structure)|data\s+model)\b/i, 'table'],
    ['table', /\b(?:table|tabular)\b/i, 'table'],
    ['calculator', /\b(?:interactive\s+(?:calculation|scenario)|calculator|editable\s+inputs)\b/i, 'calculator'],
    ['chart', /\b(?:chart|plot|histogram)\b/i, 'chart'],
    ['workflow', /\b(?:step.by.step|workflow|lifecycle)\b/i, 'steps'],
    ['comparison', /\b(?:comparison\s+cards|compare\s+.{0,60}\b(?:access|permissions|isolation))\b/i, 'cards'],
  ];
  for (const [id, expression, kind] of requests) {
    const evidence = sentences.find(sentence => {
      const match = expression.exec(sentence);
      if (!match || !/\b(?:include|show|draw|create|provide|render|add|with|give|build|compare|explain)\b/i.test(sentence)) return false;
      return !/\b(?:no|without|don't|do not|avoid|skip)\s+(?:any\s+)?(?:\w+\s+){0,2}$/i.test(sentence.slice(0,match.index));
    });
    if (evidence && !(id === 'table' && /\b(?:database\s+(?:schema|structure)|data\s+model)\b/i.test(evidence))) {
      result.push({id:`requested-${id}`,description:evidence.trim().slice(0,400),origin:'requested',formats:[kind]});
    }
  }
  return result;
}

/** Add genuinely requested representations to the existing reading-order plan.
 * Existing invalid bindings stay invalid. Content is still authored in the
 * same generation, never invented by this deterministic planning boundary. */
export function prepareAnswerCoverage(prompt: string, presentation: PresentationPlan = [], obligations: AnswerObligations = []) {
  const plan = structuredClone(presentation), requirements = structuredClone(obligations);
  for (const item of requestedAnswerObligations(prompt)) {
    // Same widget kind is not semantic coverage. A component-role table cannot
    // discharge a separate database-schema requirement.
    const topic = item.id === 'requested-schema' ? /\b(?:schema|database\s+structure|data\s+model|fields|records)\b/i
      : item.id === 'requested-comparison' ? /\b(?:compar|access|isolation|permissions)\w*\b/i : null;
    const existing = plan.find(section => section.kind === item.formats[0]
      && (topic ? topic.test(section.heading+' '+section.instruction) : section.covers?.some(id => requirements.some(r => r.id === id && r.origin === 'requested'))));
    if (!requirements.some(r => r.id === item.id)) requirements.push(item);
    if (existing) { existing.covers = [...new Set([...(existing.covers ?? []), item.id])]; continue; }
    if (plan.length >= 8 || requirements.length > 16) continue;
    const kind = item.formats[0];
    plan.push({kind,heading:kind === 'graph' ? 'Architecture and relationships' : kind === 'table' ? 'Requested structured details'
      : kind === 'calculator' ? 'Explore the calculation' : kind === 'chart' ? 'Data and units' : kind === 'cards' ? 'Access comparison' : 'How it works',
      instruction:`Fulfil this actual user requirement with substantive explanation and valid ${kind} data: ${item.description}. Preserve supplied values and label assumptions. If evidence is missing, explain the limitation without fabricating facts.`.slice(0,600),covers:[item.id]});
  }
  const coverage = assessPresentationCoverage(plan, requirements);
  return { version:'answer-coverage-v1' as const, plan, requirements, coverage };
}
