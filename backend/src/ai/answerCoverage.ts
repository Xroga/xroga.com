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
    const evidence = sentences.filter(sentence => {
      const match = expression.exec(sentence);
      if (!match || !/\b(?:include|show|draw|create|provide|render|add|with|give|build|compare|explain)\b/i.test(sentence)) return false;
      return !/\b(?:no|without|don't|do not|avoid|skip)\s+(?:any\s+)?(?:\w+\s+){0,2}$/i.test(sentence.slice(0,match.index));
    });
    let occurrence=0;
    for(const sentence of evidence){
      if(id === 'table' && /\b(?:database\s+(?:schema|structure)|data\s+model)\b/i.test(sentence))continue;
      occurrence++;
      result.push({id:`requested-${id}${occurrence===1?'':`-${occurrence}`}`,description:sentence.trim().slice(0,400),sourceQuote:sentence.trim().slice(0,400),origin:'requested',formats:[kind]});
    }
  }
  return result;
}

/** Add genuinely requested representations to the existing reading-order plan.
 * Existing invalid bindings stay invalid. Content is still authored in the
 * same generation, never invented by this deterministic planning boundary. */
export function prepareAnswerCoverage(prompt: string, presentation: PresentationPlan = [], obligations: AnswerObligations = []) {
  const plan = structuredClone(presentation), requirements = structuredClone(obligations);
  const normalize=(value:string)=>value.toLocaleLowerCase().replace(/\s+/g,' ').trim();
  const quoteIssues=requirements.filter(r=>r.sourceQuote&&!normalize(prompt).includes(normalize(r.sourceQuote)))
    .map(r=>`unbound-request-quote:${r.id}`);
  for (const item of requestedAnswerObligations(prompt)) {
    const collision=requirements.find(r=>r.id===item.id);
    if(collision&&normalize(collision.sourceQuote??collision.description)!==normalize(item.sourceQuote!)){
      let suffix=1;const original=item.id;
      do{item.id=`${original}-explicit-${suffix++}`;}while(requirements.some(r=>r.id===item.id));
    }
    // Same widget kind is not semantic coverage. A component-role table cannot
    // discharge a separate database-schema requirement.
    const topic = item.id === 'requested-schema' ? /\b(?:schema|database\s+structure|data\s+model|fields|records)\b/i
      : item.id === 'requested-comparison' ? /\b(?:compar|access|isolation|permissions)\w*\b/i : null;
    const quoted=requirements.find(r=>r.sourceQuote&&normalize(r.sourceQuote)===normalize(item.sourceQuote!)&&r.formats.includes(item.formats[0]));
    const existing = plan.find(section => section.kind === item.formats[0]
      && (quoted ? section.covers?.includes(quoted.id)
        : topic ? topic.test(section.heading+' '+section.instruction)
          : section.covers?.some(id => requirements.some(r => r.id === id && r.origin === 'requested'
            && normalize(r.description)===normalize(item.description)))));
    if (!requirements.some(r => r.id === item.id)) requirements.push(item);
    if (existing) { existing.covers = [...new Set([...(existing.covers ?? []), item.id])]; continue; }
    if (plan.length >= 8 || requirements.length > 16) continue;
    const kind = item.formats[0];
    plan.push({kind,heading:kind === 'graph' ? 'Architecture and relationships' : kind === 'table' ? 'Requested structured details'
      : kind === 'calculator' ? 'Explore the calculation' : kind === 'chart' ? 'Data and units' : kind === 'cards' ? 'Access comparison' : 'How it works',
      instruction:`Fulfil this actual user requirement with substantive explanation and valid ${kind} data: ${item.description}. Preserve supplied values and label assumptions. If evidence is missing, explain the limitation without fabricating facts.`.slice(0,600),covers:[item.id]});
  }
  const coverage = assessPresentationCoverage(plan, requirements);
  if(quoteIssues.length){coverage.complete=false;coverage.issues.push(...quoteIssues);}
  return { version:'answer-coverage-v1' as const, plan, requirements, coverage };
}
