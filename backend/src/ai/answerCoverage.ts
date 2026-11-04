import { assessPresentationRelevance } from './presentationRelevance.js';
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
    ['calculator', /\b(?:interactive\s+(?:calculation|scenario)|calculator|editable\s+inputs|let\s+me\s+(?:change|adjust|tweak|vary)\s+(?:the\s+)?(?:numbers|inputs|values|assumptions)|adjustable\s+(?:inputs|numbers|assumptions)|sliders?)\b/i, 'calculator'],
    ['chart', /\b(?:chart|plot|histogram)\b/i, 'chart'],
    ['workflow', /\b(?:step.by.step|workflow|lifecycle)\b/i, 'steps'],
    ['comparison', /\b(?:comparison\s+cards|compare\s+.{0,60}\b(?:access|permissions|isolation))\b/i, 'cards'],
  ];
  for (const [id, expression, kind] of requests) {
    const evidence = sentences.filter(sentence => {
      const match = expression.exec(sentence);
      if (!match || !/\b(?:include|show|draw|create|provide|render|add|with|give|build|compare|explain|let\s+me|allow|want)\b/i.test(sentence)) return false;
      return !/\b(?:no|without|don't|do not|avoid|skip)\s+(?:any\s+)?(?:\w+\s+){0,2}$/i.test(sentence.slice(0,match.index));
    });
    let occurrence=0;
    for(const sentence of evidence){
      if(id === 'table' && /\b(?:database\s+(?:schema|structure)|data\s+model)\b/i.test(sentence))continue;
      occurrence++;
      result.push({id:`requested-${id}${occurrence===1?'':`-${occurrence}`}`,description:sentence.trim().slice(0,400),sourceQuote:sentence.trim().slice(0,400),origin:'requested',formats:[kind]});
    }
  }
  // A workflow that names failure, branching, retry or approval is a decision structure. Sequential steps would
  // hide those branches, so it asks for a connected diagram instead (one section, not steps plus a diagram).
  const branching = /\b(?:fail(?:s|ure|ures)?|errors?|retry|retries|branch(?:es|ing)?|decisions?|approval|otherwise|if\s+(?:it|they|the|a)\b)/i;
  for (const item of result) {
    if (item.id.startsWith('requested-workflow') && branching.test(item.sourceQuote ?? item.description)) item.formats = ['graph'];
  }
  return result;
}

/** Access-boundary architecture needs an explanation of both the ownership
 * records and the contrasting scopes. This is a reusable lower bound on system
 * explanations, not a provider/brand template or an invented deployed schema. */
export function requiredAccessBoundarySupport(prompt:string):AnswerObligations{
  const system=/\b(?:architecture|system\s+design|design\s+(?:a|an|the)\s+(?:\w+\s+){0,3}(?:system|platform)|saas\s+(?:architecture|design))\b/i.test(prompt);
  const boundary=/\b(?:multi[- ]tenant|tenant\s+isolation|cross[- ]tenant|organization[- ](?:scoped|specific)|isolated\s+(?:teams|workspaces|organizations))\b/i.test(prompt);
  const persistent=/\b(?:saas|database|persistent|persist|storage|records|subscriptions?|data\s+(?:model|ownership|isolation))\b/i.test(prompt);
  if(!system||!boundary||!persistent||/\b(?:stateless|without\s+(?:a\s+)?(?:database|storage|persistence))\b/i.test(prompt))return[];
  const items:AnswerObligations=[];
  if(!/\b(?:no|without|skip|avoid|don't|do not)\s+(?:\w+\s+){0,2}(?:schema|database\s+(?:table|structure)|data\s+model)\b/i.test(prompt))
    items.push({id:'support-ownership-records',origin:'necessary-support',formats:['table'],
      description:'Explain a proposed ownership data structure, with relevant record names, fields and membership relationships. Identify it as a proposal, not an inspected existing schema.'});
  if(!/\b(?:no|without|skip|avoid|don't|do not)\s+(?:\w+\s+){0,2}(?:cards|comparisons?|examples)\b/i.test(prompt))
    items.push({id:'support-access-contrast',origin:'necessary-support',formats:['cards'],
      description:'Contrast isolated ownership scopes and their allowed access. Label any example tenants as illustrative. Do not invent customer names, team counts or successful security tests.'});
  return items;
}

/** Add genuinely requested representations to the existing reading-order plan.
 * Existing invalid bindings stay invalid. Content is still authored in the
 * same generation, never invented by this deterministic planning boundary. */
export function prepareAnswerCoverage(prompt: string, presentation: PresentationPlan = [], obligations: AnswerObligations = []) {
  const plan = structuredClone(presentation), requirements = structuredClone(obligations);
  const normalize=(value:string)=>value.toLocaleLowerCase().replace(/\s+/g,' ').trim();
  const quoteIssues=requirements.filter(r=>r.sourceQuote&&!normalize(prompt).includes(normalize(r.sourceQuote)))
    .map(r=>`unbound-request-quote:${r.id}`);
  for (const item of [...requestedAnswerObligations(prompt),...requiredAccessBoundarySupport(prompt)]) {
    const collision=requirements.find(r=>r.id===item.id);
    if(collision&&normalize(collision.sourceQuote??collision.description)!==normalize(item.sourceQuote??item.description)){
      let suffix=1;const original=item.id;
      do{item.id=`${original}-explicit-${suffix++}`;}while(requirements.some(r=>r.id===item.id));
    }
    // Same widget kind is not semantic coverage. A component-role table cannot
    // discharge a separate database-schema requirement.
    const topic = ['requested-schema','support-ownership-records'].includes(item.id) ? /\b(?:schema|database\s+structure|data\s+model|fields|records)\b/i
      : ['requested-comparison','support-access-contrast'].includes(item.id) ? /\b(?:compar|access|isolation|permissions)\w*\b/i : null;
    const quoted=item.sourceQuote?requirements.find(r=>r.sourceQuote&&normalize(r.sourceQuote)===normalize(item.sourceQuote!)&&r.formats.includes(item.formats[0])):undefined;
    const existing = plan.find(section => section.kind === item.formats[0]
      && (quoted ? section.covers?.includes(quoted.id)
        : topic ? topic.test(section.heading+' '+section.instruction)
          : section.covers?.some(id => requirements.some(r => r.id === id && r.origin === 'requested'
            && normalize(r.description)===normalize(item.description)))));
    if (!requirements.some(r => r.id === item.id)) requirements.push(item);
    if (existing) { existing.covers = [...new Set([...(existing.covers ?? []), item.id])]; continue; }
    if (plan.length >= 8 || requirements.length > 16) continue;
    const kind = item.formats[0];
    plan.push({kind,heading:item.id==='support-ownership-records'?'Data ownership and membership':item.id==='support-access-contrast'?'Access boundaries':kind === 'graph' ? 'Architecture and relationships' : kind === 'table' ? 'Requested structured details'
      : kind === 'calculator' ? 'Explore the calculation' : kind === 'chart' ? 'Data and units' : kind === 'cards' ? 'Access comparison' : 'How it works',
      instruction:`Fulfil this ${item.origin==='requested'?'actual user requirement':'necessary explanation'} with substantive explanation and valid ${kind} data: ${item.description}. Preserve supplied values and label assumptions. If evidence is missing, explain the limitation without fabricating facts.`.slice(0,600),covers:[item.id]});
  }
  const coverage = assessPresentationCoverage(plan, requirements);
  if(quoteIssues.length){coverage.complete=false;coverage.issues.push(...quoteIssues);}
  // Relevance is checked deterministically against the request itself. No model call and no rewriting.
  const relevance = assessPresentationRelevance(prompt, plan, requirements);
  if(!relevance.relevant){coverage.complete=false;coverage.issues.push(...relevance.issues);}
  return { version:'answer-coverage-v1' as const, plan, requirements, coverage };
}
