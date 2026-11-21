import { assessPresentationRelevance } from './presentationRelevance.js';
import { assessPresentationCoverage, type AnswerObligations, type PresentationPlan } from './responsePresentation.js';
import type { RequiredNativeFormat } from './nativeOpenUi.js';

/** A lower bound on explicit output requests, supplementing the semantic
 * planner. No generated facts, brand templates, sources or second model call. */
export function requestedAnswerObligations(prompt: string): AnswerObligations {
  const sentences = prompt.slice(0, 32_000).split(/(?<=[.!?\n])\s+/u);
  const result: AnswerObligations = [];
  const requests: Array<[string, RegExp, PresentationPlan[number]['kind']]> = [
    ['diagram', /\b(?:diagram|flowchart|architecture\s+(?:map|graph))\b/i, 'graph'],
    ['schema', /\b(?:database\s+(?:schema|structure)|data\s+model)\b/i, 'table'],
    ['table', /\b(?:table|tabular|tabulate)\b/i, 'table'],
    ['calculator', /\b(?:interactive\s+(?:calculation|scenario)|calculator|editable\s+inputs|let\s+me\s+(?:change|adjust|tweak|vary)\s+(?:the\s+)?(?:numbers|inputs|values|assumptions)|adjustable\s+(?:inputs|numbers|assumptions)|sliders?)\b/i, 'calculator'],
    ['chart', /\b(?:chart|plot|histogram)\b/i, 'chart'],
    ['workflow', /\b(?:step.by.step|workflow|lifecycle)\b/i, 'steps'],
    ['comparison', /\b(?:comparison\s+cards|compare\s+.{0,60}\b(?:access|permissions|isolation))\b/i, 'cards'],
  ];
  for (const [id, expression, kind] of requests) {
    const evidence = sentences.filter(sentence => {
      const match = expression.exec(sentence);
      if (!match || !/\b(?:include|show|draw|create|provide|render|add|with|give|build|compare|explain|let\s+me|allow|want|tabulate)\b|^\s*(?:chart|plot)\s+/i.test(sentence)) return false;
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

export function requiredNativeFormats(prompt: string): RequiredNativeFormat[] {
  const formats = requestedAnswerObligations(prompt).filter(item => !/^\s*(?:explain|describe)\b/i.test(item.sourceQuote ?? '')
    || /\b(?:with|include|show|draw|render)\b/i.test(item.sourceQuote ?? '')).flatMap(item => item.formats);
  return [...new Set(formats.filter((kind): kind is RequiredNativeFormat =>
    kind === 'table' || kind === 'chart' || kind === 'graph' || kind === 'calculator'))];
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

/** A request that supplies several quantities and asks for a computed result is a worked scenario. It is answered with a
 * compact key-figures table and an adjustable calculator on the user's own numbers, not with paragraphs of prose alone.
 * Deterministic and conservative: needs at least three distinct figures plus a computing question, and never applies when
 * the person asks for brevity or declines a calculator or table. No quantities are invented here; the model fills the
 * sections from the numbers in the request. */
export function quantitativeScenarioSupport(prompt: string): AnswerObligations {
  const text = prompt.slice(0, 32_000);
  const figures = new Set((text.match(/[$€£]\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?%|\b\d[\d,]*(?:\.\d+)?\s?(?:usd|eur|gbp|dollars?|shares?|units?|years?|months?|weeks?|days?|hours?|miles?|km|kg|lbs?)\b/gi) ?? []).map(value => value.replace(/[\s,]/g, '').toLowerCase()));
  if (figures.size < 3) return [];
  if (!/\b(?:how\s+(?:much|many|long)|what\s+(?:will|would|is|are|size|position|amount|payment|return)|calculate|compute|work\s+out|worth|total|cost|profit|loss|payment|interest|ratio|position\s+size|break[- ]?even|per\s+(?:month|year|share|unit))\b/i.test(text)) return [];
  if (/\b(?:short\s+answer|briefly|in\s+one\s+(?:line|sentence)|just\s+the\s+(?:number|answer)|tl;?dr)\b/i.test(text)) return [];
  const declines = (what: string) => new RegExp(`\\b(?:no|without|skip|avoid|don't|do not)\\s+(?:\\w+\\s+){0,2}${what}\\b`, 'i').test(text);
  const items: AnswerObligations = [];
  if (!declines('(?:tables?|figures)')) items.push({ id: 'support-key-figures', origin: 'necessary-support', formats: ['table'],
    description: "Summarise the quantities the user supplied and the results computed from them as a compact two-column key-figures table (label and value, with units). Use only the user's numbers and values derived from them." });
  if (!declines('calculators?')) items.push({ id: 'support-scenario-calculator', origin: 'necessary-support', formats: ['calculator'],
    description: "Offer an adjustable calculator on the user's own quantities so they can change them and see the result. Apply one supported operation to inputs that already hold any earlier steps." });
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
  // Add only what the plan lacks: a table or calculator the planner already planned is never planned twice.
  const scenario = quantitativeScenarioSupport(prompt).filter(item => !plan.some(section => section.kind === item.formats[0]));
  for (const item of [...requestedAnswerObligations(prompt),...requiredAccessBoundarySupport(prompt),...scenario]) {
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
    plan.push({kind,heading:item.id==='support-key-figures'?'Key figures':item.id==='support-scenario-calculator'?'Adjust the numbers':item.id==='support-ownership-records'?'Data ownership and membership':item.id==='support-access-contrast'?'Access boundaries':kind === 'graph' ? 'Architecture and relationships' : kind === 'table' ? 'Requested structured details'
      : kind === 'calculator' ? 'Explore the calculation' : kind === 'chart' ? 'Data and units' : kind === 'cards' ? 'Access comparison' : 'How it works',
      instruction:`Fulfil this ${item.origin==='requested'?'actual user requirement':'necessary explanation'} with substantive explanation and valid ${kind} data: ${item.description}. Preserve supplied values and label assumptions. If evidence is missing, explain the limitation without fabricating facts.`.slice(0,600),covers:[item.id]});
  }
  // A worked scenario whose plan has no prose section still leads with a written answer; visuals never stand alone.
  if (scenario.length && plan.length < 8 && !plan.some(section => section.kind === 'prose')) {
    const proseIds = requirements.filter(item => item.formats.length && item.formats.every(format => format === 'prose')).map(item => item.id);
    plan.unshift({ kind: 'prose', heading: 'Short answer', instruction: 'Answer the question in one or two sentences with the key result, then explain the reasoning plainly and mention the main risks or assumptions.', covers: proseIds.length ? proseIds : [scenario[0].id] });
  }
  // Prose is the default carrier of any explanation. When the plan has a prose section, an obligation that asks only for
  // prose is carried by it even if the planner forgot to list that binding; a missing table, diagram, chart or
  // calculator is never inferred this way. This is bookkeeping, not a repair: no text is changed or generated.
  // Only a plan whose every section is already bound is touched; a malformed plan is kept exactly as received.
  const carrier = plan.every(section => section.covers?.length) ? plan.find(section => section.kind === 'prose') : undefined;
  if (carrier) for (const item of requirements) {
    if (item.formats.length && item.formats.every(format => format === 'prose') && !plan.some(section => section.covers?.includes(item.id))) {
      carrier.covers = [...(carrier.covers ?? []), item.id];
    }
  }
  // Relevance is checked deterministically against the request itself. No model call and no rewriting.
  // A section that drifts into another field is simply not planned. It never degrades the rest of a good answer
  // into a warning, because the person did not ask for it and loses nothing when it is left out.
  const relevance = assessPresentationRelevance(prompt, plan, requirements);
  const drifting = new Set(relevance.detail.map(item => item.heading));
  const kept = drifting.size ? plan.filter(section => !drifting.has(section.heading)) : plan;
  const coverage = assessPresentationCoverage(kept, requirements);
  if(quoteIssues.length){coverage.complete=false;coverage.issues.push(...quoteIssues);}
  // Only the issue codes are logged: the part after the first colon can hold a model-written heading or a user quote.
  if(!coverage.complete)console.warn('[coverage] incomplete',{issues:coverage.issues.slice(0,12).map(item=>item.split(':').slice(0,item.startsWith('missing:')?3:1).join(':').replace(/[^A-Za-z0-9:_-]/g,'').slice(0,48))});
  return { version:'answer-coverage-v1' as const, plan: kept, requirements, coverage, ...(drifting.size ? { omittedOffTopic: [...drifting] } : {}) };
}
