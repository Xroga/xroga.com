import {z} from 'zod';
import {goalContractSchema} from './universal/goalContract.js';
import {normalizeResearch,formatResearchAsEvidence} from './black-hole/researchRouter.js';
import {presentResearchResult} from '../services/integrations/researchResult.js';
import type {TenantModelScope} from './tenantModelDispatch.js';
import {AuthorityError} from '../security/authority/enforce.js';
import { officialResearchDomains } from './researchSearchProvider.js';
import { requestsOfficialLinkCoverage } from './workspacePublicSearch.js';
import { isRequestedPublication, requestedPublication } from './researchPublicationEvidence.js';
import { bindListedWebsiteRows } from './researchWebsiteEvidence.js';
import { withholdIncomparableResearchRanking } from './researchRankingEvidence.js';
import { nativeMarkdownTables, nativeTableDecimalKey } from './nativeMarkdown.js';
import type { PublicCompletionState } from './completionDiagnostics.js';
import type { ChatPipelineResult } from './pipeline.js';

export const RESEARCH_ANSWER_MAXIMUM_MICRO_USD=5_000;
export const researchAnswerRequestSchema=z.object({
 prompt:z.string().trim().min(1).max(32_000),
 history:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(8000)}).strict()).max(12).optional(),
 goalContract:goalContractSchema.optional(),projectEvidence:z.string().max(32_000).optional(),
}).strict().refine(value=>!value.goalContract||(['ANSWER','INVESTIGATE','PROPOSE'].includes(value.goalContract.semanticIntent)
 &&value.goalContract.requiredCapabilities.every(c=>['conversation.respond','research.public-web','repository.read'].includes(c))),
 'Research synthesis cannot authorize execution or external actions');
export type ResearchAnswerRequest=z.infer<typeof researchAnswerRequestSchema>;

/** Public research receipts and accounting belong to the server. Return the
 * finished answer and source metadata needed for the ordinary Workspace. */
export function publicWorkspaceResearchAnswer(result: Pick<ChatPipelineResult,
  'response' | 'completion' | 'responseSource' | 'intent' | 'webSources' | 'publicWebRetrieved'>) {
  const presentation = result.responseSource;
  return {
    response: result.response,
    completion: result.completion,
    ...(presentation ? { responseSource: {
      format: presentation.format, text: presentation.text,
      ...(presentation.downloadFormat ? { downloadFormat: presentation.downloadFormat } : {}),
    } } : {}),
    intent: result.intent,
    webSources: result.webSources?.map(({ title, url, snippet, siteName, siteIconDomain, publishedAt }) =>
      ({ title, url, snippet, siteName, siteIconDomain, publishedAt, source: 'web' })),
    ...(result.publicWebRetrieved ? { publicWebRetrieved: true as const } : {}),
    engine: 'xroga' as const,
  };
}

const inlineCodeSpans=/(?<!\x60)(\x60+)(?!\x60)[\s\S]*?(?<!\x60)\1(?!\x60)/g;
const inlineMarkdownLinks=/\[([^\]\r\n]+)\]\([ \t]*(?:<([^<>\r\n]+)>|((?:[^\s()<>]|\([^()\r\n]*\))+))(?:[ \t]+(?:"[^"\r\n]*"|'[^'\r\n]*'|\([^()\r\n]*\)))?[ \t]*\)/g;
const directUrls = /<?https?:\/\/[^\s<>"')\]]+>?/giu;
const missingOfficialLinks = /\bofficial (?:site|link|website|url) (?:not verified|unverified|not found)\b/iu;

function sourceUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    url.hash = '';
    return url.href;
  } catch { return ''; }
}

function mapResearchProse(response: string, transform: (prose: string) => string) {
  return response.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g).map((part, index) => {
    if (index % 2) return part;
    let cursor = 0, output = '';
    for (const code of part.matchAll(inlineCodeSpans)) {
      output += transform(part.slice(cursor, code.index)) + code[0];
      cursor = code.index + code[0].length;
    }
    return output + transform(part.slice(cursor));
  }).join('');
}

/** Structural attribution only, never a certificate that a source entails a
 * claim. Keep original text and mark unresolved attribution partial. */
export function researchCitationIssues(response:string,sources:ReadonlyArray<{url:string}>):string[]{
 const strings=(v:unknown):string[]=>typeof v==='string'?[v]:v&&typeof v==='object'?Object.values(v).flatMap(strings):[];
 const visible=response.replace(/```([^\n]*)\n([\s\S]*?)```/g,(_all,language:string,body:string)=>{
  if(language.trim()!=='xroga-ui')return '';
  try{return strings(JSON.parse(body)).join('\n');}catch{return '';}
 }).replace(inlineCodeSpans,'');
 const canonical=(url:string)=>{try{const u=new URL(url);u.hash='';return u.href;}catch{return '';}};
 const allowed=sources.map(s=>canonical(s.url)),issues:string[]=[];
 const refs=[...visible.matchAll(/\[(\d+)\](?!\()/g)].map(m=>Number(m[1]));
 for(const ref of refs)if(!Number.isSafeInteger(ref)||ref<1||ref>sources.length)issues.push(`unresolved-source:${ref}`);
 const links=[...visible.matchAll(inlineMarkdownLinks)].map(match=>({label:match[1],url:canonical(match[2]??match[3])}));
 for(const {label,url} of links)if(/^\d+$/.test(label)&&url!==allowed[Number(label)-1])issues.push(`mismatched-source:${label}`);
 if(!refs.some(n=>n>=1&&n<=sources.length)&&!links.some(link=>allowed.includes(link.url)))issues.push('missing-source-attribution');
 return [...new Set(issues)];
}

/** A numbered citation is only ever a pointer into the retrieved source list. The model must not choose a
 * destination: every `[n](url)` whose number names a retrieved source is rewritten to that source's own verified URL, so a
 * copied, shortened or altered link can never send a reader somewhere the evidence did not come from. An unresolved
 * number remains as plain text for researchCitationIssues to flag. Fenced code is never touched. */
export function bindCitationLinks(response:string,sources:ReadonlyArray<{url:string}>):string{
 const bindProse=(prose:string)=>prose.replace(inlineMarkdownLinks,(whole,number:string)=>{
  if(!/^\d+$/.test(number))return whole;
  const source=sources[Number(number)-1];
  if(!source)return `[${number}]`;
  const destination=/[()]/.test(source.url)?`<${source.url}>`:source.url;
  return `[${number}](${destination})`;
 });
 return mapResearchProse(response, bindProse);
}

function fixedStayLength(text: string): number | undefined {
  const stays = [...text.matchAll(/\b([1-9]\d*)[ \t-]+(?:hotel[ \t-]+)?nights?\b/giu)];
  if (stays.length !== 1) return;
  const [stay] = stays;
  const before = text.slice(0, stay.index);
  if (/(?:\b(?:up to|at least|at most|about|around|approximately|or|to)\s+|\d\s*[-–—]\s*|~\s*)$/iu.test(before)) return;
  return Number(stay[1]);
}

function scheduledDays(body: string) {
  const explicit = [...body.matchAll(/\bday[ \t]+(\d+)[ \t]*(?:[:.)–—-][ \t]*)?/giu)];
  const numbered = [...body.matchAll(/^ {0,3}(\d+)[.)][ \t]+(?=\S)/gmu)];
  // Markdown lists can repeat "1." and let the renderer number the items.
  // Require a consecutive list before treating its raw markers as day numbers.
  const ordered = numbered.every((row, index) => Number(row[1]) === index + 1) ? numbered : [];
  const days = explicit.length >= 2 ? explicit : ordered;
  return days.map((day, index) => ({
    number: Number(day[1]),
    label: body.slice(day.index + day[0].length, days[index + 1]?.index).trim(),
  }));
}

function endsWithDeparture(label: string) {
  const withoutCitations = label.replace(inlineMarkdownLinks, (link, title: string) => /^\d+$/u.test(title) ? '' : link)
    .replace(/\[\d+\](?!\()/gu, '').trimEnd();
  return /^(?:(?:check[ -]out and )?depart(?:ure)?(?: for home)?|(?:transfer and )?fly home)(?=[ \t]*[.;\r\n]|$)/iu.test(withoutCitations)
    || /(?:[,;.]\s*|\band\s+)then\s+(?:fly|depart|travel)\s+(?:back\s+)?home[ \t]*[.!]?$/iu.test(withoutCitations);
}

function scheduledStayMismatch(response: string): string | undefined {
  const prose = response.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/gu, '').replace(/\*\*/gu, '');
  const itineraries = prose.split(/(?=^#{1,6}[ \t])/mu).flatMap(section => {
    const headingEnd = section.indexOf('\n');
    const heading = section.slice(0, headingEnd);
    if (headingEnd === -1 || !/^#{1,6}[ \t]+[^\r\n]*(?:\bitinerary\b|\b(?:\d+[- ](?:day|night)|daily) (?:plan|shape|schedule)\b)/iu.test(heading)) return [];
    const body = section.slice(headingEnd + 1);
    const days = scheduledDays(body);
    return days.length >= 2 ? [{ heading, days }] : [];
  });
  if (itineraries.length !== 1) return;
  const [{ heading, days }] = itineraries;
  const assumptions = prose.match(/^[ \t]*Assumptions?:[^\r\n]*/gimu) ?? [];
  const headingNights = fixedStayLength(heading);
  const budgetNights = assumptions.length === 1 ? fixedStayLength(assumptions[0]) : undefined;
  if (headingNights === undefined && budgetNights === undefined) return;

  const arrivals = days.filter(({ label }) => /^(?:arrive|arrival|check[ -]in)\b/iu.test(label));
  const last = days[days.length - 1];
  if (arrivals.length !== 1 || !endsWithDeparture(last.label)) return;

  const startDay = arrivals[0].number;
  const endDay = last.number;
  const nights = endDay - startDay;
  const mismatch = [budgetNights, headingNights].find(count => count !== undefined && Number.isSafeInteger(count) && count !== nights);
  if (![startDay, endDay].every(Number.isSafeInteger) || nights <= 0 || mismatch === undefined) return;
  const basis = mismatch === budgetNights ? 'The budget assumes' : 'The itinerary heading says';
  return `The itinerary runs from Day ${startDay} to Day ${endDay}, which is ${nights} ${nights === 1 ? 'night' : 'nights'}. ${basis} ${mismatch} ${mismatch === 1 ? 'night' : 'nights'}. Treat the budget as a separate estimate until the dates are aligned.`;
}

const listedCurrency = /\$\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?!\d|[.,]\d)/g;
const airportCode = /\b[A-Z]{3}\b/g;
const flightRoute = /\(([A-Z]{3})\)\s*(?:to|[→–—-])\s*[^()\r\n]{1,90}\(([A-Z]{3})\)/g;

/** Review a priced listing when the cited excerpt places a route code under
 * another offer on the same page. A page-level citation cannot move that field. */
function withholdCrossListingRoutes(text: string, sources: ReadonlyArray<{ snippet?: string }>) {
  const tables = nativeMarkdownTables(text);
  if (!tables.length) return;
  const amounts = (value: string) => [...value.matchAll(listedCurrency)].map(match => nativeTableDecimalKey(match[1]));
  const listings = sources.map(source => (source.snippet ?? '').split(/(?=^#{3,6}[ \t])/mu)
    .filter(block => /^#{3,6}[ \t]/u.test(block)).map(block => ({
      prices: amounts(block),
      airports: [...block.matchAll(flightRoute)].flatMap(match => [match[1], match[2]]),
    })));
  const lines = text.split(/\r\n?|\n/);
  let withheld = false;
  for (const { start, end } of tables.reverse()) {
    const rows = lines.slice(start + 2, end).filter(row => {
      const visible = row.replace(inlineMarkdownLinks, (_link, label: string) => label);
      if (!/\b(?:flight|airfare|nonstop|round[- ]trip)s?\b/iu.test(visible)) return true;
      const refs = new Set([...row.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1]) - 1));
      const offers = [...refs].flatMap(ref => listings[ref] ?? []);
      const prices = amounts(visible);
      const matched = offers.filter(listing => listing.prices.some(price => prices.includes(price)));
      if (matched.length !== 1) return true;
      const [offer] = matched;
      const routesElsewhere = new Set(offers.filter(listing => listing !== offer).flatMap(listing => listing.airports));
      const unsupported = [...visible.matchAll(airportCode)].some(([code]) =>
        routesElsewhere.has(code) && !offer.airports.includes(code));
      withheld ||= unsupported;
      return !unsupported;
    });
    if (rows.length !== end - start - 2) {
      lines.splice(start, end - start, ...(rows.length ? lines.slice(start, start + 2).concat(rows) : []));
    }
  }
  if (withheld) return 'I left out flight offers whose cited listings didn’t verify the route and price together.\n\n' + lines.join('\n').trim();
}

/** Structural coverage of an explicit link deliverable. A retrieved URL alone
 * cannot certify ownership or that the cited page supports a particular claim. */
export function presentPublicResearchAnswer(response: string, completion: PublicCompletionState,
  sources: ReadonlyArray<{ url: string; title?: string; snippet?: string }>, prompt: string) {
  let text = bindCitationLinks(response, sources);
  const evidenceOnlyAnswer = withholdIncomparableResearchRanking(text);
  const rankingWithheld = evidenceOnlyAnswer !== undefined;
  if (rankingWithheld) {
    text = evidenceOnlyAnswer;
    if (completion.status === 'complete' || completion.reason === 'source_coverage') {
      completion = { status: 'partial', reason: 'factual_review' };
    }
  }
  const stayMismatch = scheduledStayMismatch(text);
  if (stayMismatch) {
    if (!text.startsWith(stayMismatch)) text = stayMismatch + '\n\n' + text;
    if (completion.status === 'complete' || completion.reason === 'source_coverage') {
      completion = { status: 'partial', reason: 'factual_review' };
    }
  }
  const checkedOffers = withholdCrossListingRoutes(text, sources);
  if (checkedOffers !== undefined) {
    text = checkedOffers;
    if (completion.status === 'complete' || completion.reason === 'source_coverage') {
      completion = { status: 'partial', reason: 'source_attribution' };
    }
  }
  const attributionIncomplete = researchCitationIssues(text, sources).length > 0;
  const publication = completion.status === 'complete' ? requestedPublication(prompt) : undefined;
  if (publication && !sources.some(source => isRequestedPublication(source, publication))) {
    const note = 'I couldn’t verify the requested original publication from the retrieved sources.';
    return {
      response: text.trimEnd().endsWith(note) ? text : text + '\n\n' + note,
      completion: { status: 'partial', reason: 'source_coverage' } as const,
      requiresReadableFallback: true,
    };
  }
  if (!requestsOfficialLinkCoverage(prompt)) return { response: text, completion:
    attributionIncomplete && completion.status === 'complete' ? { status: 'partial', reason: 'source_attribution' } as const : completion,
    ...(rankingWithheld || stayMismatch || checkedOffers !== undefined ? { requiresReadableFallback: true } : {}) };

  const count = /\b(?:top|rank|list|name|compare|find)\s+(?:the\s+)?(\d{1,3}|two|three|four|five|six|seven|eight|nine|ten)\b/iu.exec(prompt)?.[1];
  const numberWords = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const requested = count ? (Number(count) || numberWords.indexOf(count.toLowerCase()) + 2) : 1;
  const siteRows = bindListedWebsiteRows(text, sources);
  text = siteRows.response;
  const allowed = new Set([...sources.map(source => sourceUrl(source.url)).filter(Boolean), ...siteRows.destinations]);
  const linked = new Set<string>();
  let unverified = false;
  const accept = (value: string, counts: boolean) => {
    const url = sourceUrl(value);
    if (!allowed.has(url)) {
      unverified = true;
      return false;
    }
    if (counts) linked.add(url);
    return true;
  };
  const bindBareUrls = (prose: string) => prose.replace(directUrls, (url: string) => {
    const value = url.replace(/^</, '').replace(/>$/, '').replace(/[.,;!?]+$/, '');
    return accept(value, true) ? url : 'Official link not verified' + (url.match(/[.,;!?]+$/)?.[0] ?? '');
  });
  text = mapResearchProse(text, prose => {
    if (missingOfficialLinks.test(prose)) unverified = true;
    let position = 0;
    let output = '';
    for (const match of prose.matchAll(inlineMarkdownLinks)) {
      const [, label, angle, bare] = match;
      output += bindBareUrls(prose.slice(position, match.index));
      output += accept(angle ?? bare, requested === 1 || !/^\d+$/u.test(label))
        ? match[0] : label + ' (link not verified)';
      position = match.index + match[0].length;
    }
    return output + bindBareUrls(prose.slice(position));
  });
  if (unverified || (siteRows.rows?.missing ?? 0) > 0 || (siteRows.rows?.linked ?? linked.size) < requested) {
    const note = 'I couldn’t verify every requested official link from the retrieved sources.';
    return {
      response: text.trimEnd().endsWith(note) ? text : text + '\n\n' + note,
      completion: completion.status === 'complete' ? { status: 'partial', reason: 'source_coverage' } as const : completion,
      requiresReadableFallback: true,
    };
  }
  return { response: text, completion:
    attributionIncomplete && completion.status === 'complete' ? { status: 'partial', reason: 'source_attribution' } as const : completion,
    ...(text !== response ? { requiresReadableFallback: true } : {}) };
}

/** Runs inside the already claimed, exact research confirmation. This is the
 * original answer generation, not an extra formatting call or a retry loop. */
export async function completeApprovedResearchAnswer(scope:TenantModelScope,request:ResearchAnswerRequest,raw:unknown,check:()=>Promise<void>){
 const input=researchAnswerRequestSchema.parse(request);
 const goal=input.goalContract;
 const officialOnly=goal?.sourcePolicy.mode==='official_only' ? officialResearchDomains(goal.sourcePolicy.officialDomains) : undefined;
 const evidence=presentResearchResult(raw,officialOnly);
 const normalized=normalizeResearch(evidence.sources,{query:input.prompt,officialDomains:officialOnly??goal?.sourcePolicy.officialDomains,maxSources:12});
 const sources=goal?.sourcePolicy.mode==='official_only'?normalized.sources.filter(s=>s.trust==='A_official'):normalized.sources;
 if(!sources.length)return {answerFailure:'NO_QUALIFYING_SOURCES' as const};
 const filtered={...normalized,sources,unavailable:false};
 await check();
 const {runChatPipeline}=await import('./pipeline.js');
 try{
  const result=await runChatPipeline({userId:scope.userId,tenantContext:scope.context,modelScope:{...scope,connectedAccountId:'platform',maximumCostMicroUsd:RESEARCH_ANSWER_MAXIMUM_MICRO_USD,revalidateBeforeDispatch:check},
   ...input,approvedResearch:{bundle:{query:input.prompt,summary:sources.map(s=>s.snippet).join('\n\n').slice(0,4000),
    sources:sources.map(s=>{
      const original=evidence.sources.find(source=>source.url===s.url);
      return {...original,title:s.title,url:s.url,snippet:s.snippet,source:s.sourceType==='x_post'?'x':'web'};
    }),provider:'parallel'},
    evidence:formatResearchAsEvidence(filtered)}});
  await check();
  const bound=bindCitationLinks(result.response,sources);
  const citationIssues=researchCitationIssues(bound,sources);
  return {answer:{response:bound,completion:citationIssues.length?{status:'partial' as const,reason:'source_attribution'}:result.completion??{status:'partial' as const,reason:'unverified_completion'},
   ...(result.responseSource?{responseSource:result.responseSource}:{}),webSources:result.webSources??[]}};
 }catch(error){
  // The retrieval already succeeded. Preserve its evidence and any held or
  // settled model accounting. The one-use confirmation never repeats either.
  if(error instanceof AuthorityError)throw error;
  return {answerFailure:'SYNTHESIS_UNAVAILABLE' as const};
 }
}
