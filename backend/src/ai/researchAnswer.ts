import {z} from 'zod';
import {goalContractSchema} from './universal/goalContract.js';
import {normalizeResearch,formatResearchAsEvidence} from './black-hole/researchRouter.js';
import {presentResearchResult} from '../services/integrations/researchResult.js';
import type {TenantModelScope} from './tenantModelDispatch.js';
import {AuthorityError} from '../security/authority/enforce.js';

export const RESEARCH_ANSWER_MAXIMUM_MICRO_USD=5_000;
export const researchAnswerRequestSchema=z.object({
 prompt:z.string().trim().min(1).max(32_000),
 history:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(8000)}).strict()).max(12).optional(),
 goalContract:goalContractSchema.optional(),projectEvidence:z.string().max(32_000).optional(),
}).strict().refine(value=>!value.goalContract||(['ANSWER','INVESTIGATE','PROPOSE'].includes(value.goalContract.semanticIntent)
 &&value.goalContract.requiredCapabilities.every(c=>['conversation.respond','research.public-web','repository.read'].includes(c))),
 'Research synthesis cannot authorize execution or external actions');
export type ResearchAnswerRequest=z.infer<typeof researchAnswerRequestSchema>;

/** Structural attribution only, never a certificate that a source entails a
 * claim. Keep original text and mark unresolved attribution partial. */
export function researchCitationIssues(response:string,sources:ReadonlyArray<{url:string}>):string[]{
 const strings=(v:unknown):string[]=>typeof v==='string'?[v]:v&&typeof v==='object'?Object.values(v).flatMap(strings):[];
 const visible=response.replace(/```([^\n]*)\n([\s\S]*?)```/g,(_all,language:string,body:string)=>{
  if(language.trim()!=='xroga-ui')return '';
  try{return strings(JSON.parse(body)).join('\n');}catch{return '';}
 }).replace(/`[^`\n]+`/g,'');
 const canonical=(url:string)=>{try{const u=new URL(url);u.hash='';return u.href;}catch{return '';}};
 const allowed=sources.map(s=>canonical(s.url)),issues:string[]=[];
 const refs=[...visible.matchAll(/\[(\d+)\](?!\()/g)].map(m=>Number(m[1]));
 for(const ref of refs)if(!Number.isSafeInteger(ref)||ref<1||ref>sources.length)issues.push(`unresolved-source:${ref}`);
 const links=[...visible.matchAll(/\[([^\]\n]+)\]\(<?([^\s)>]+)>?\)/g)];
 for(const link of links)if(/^\d+$/.test(link[1])&&canonical(link[2])!==allowed[Number(link[1])-1])issues.push(`mismatched-source:${link[1]}`);
 if(!refs.some(n=>n>=1&&n<=sources.length)&&!links.some(m=>allowed.includes(canonical(m[2]))))issues.push('missing-source-attribution');
 return [...new Set(issues)];
}

/** Runs inside the already claimed, exact research confirmation. This is the
 * original answer generation, not an extra formatting call or a retry loop. */
export async function completeApprovedResearchAnswer(scope:TenantModelScope,request:ResearchAnswerRequest,raw:unknown,check:()=>Promise<void>){
 const input=researchAnswerRequestSchema.parse(request),evidence=presentResearchResult(raw);
 const goal=input.goalContract;
 const normalized=normalizeResearch(evidence.sources,{query:input.prompt,officialDomains:goal?.sourcePolicy.officialDomains,maxSources:12});
 const sources=goal?.sourcePolicy.mode==='official_only'?normalized.sources.filter(s=>s.trust==='A_official'):normalized.sources;
 if(!sources.length)return {answerFailure:'NO_QUALIFYING_SOURCES' as const};
 const filtered={...normalized,sources,unavailable:false};
 await check();
 const {runChatPipeline}=await import('./pipeline.js');
 try{
  const result=await runChatPipeline({userId:scope.userId,tenantContext:scope.context,modelScope:{...scope,connectedAccountId:'platform',maximumCostMicroUsd:RESEARCH_ANSWER_MAXIMUM_MICRO_USD,revalidateBeforeDispatch:check},
   ...input,approvedResearch:{bundle:{query:input.prompt,summary:sources.map(s=>s.snippet).join('\n\n').slice(0,4000),
    sources:sources.map(s=>({title:s.title,url:s.url,snippet:s.snippet,source:s.sourceType==='x_post'?'x':'web'})),provider:'parallel'},
    evidence:formatResearchAsEvidence(filtered)}});
  await check();
  const citationIssues=researchCitationIssues(result.response,sources);
  return {answer:{response:result.response,completion:citationIssues.length?{status:'partial' as const,reason:'source_attribution'}:result.completion??{status:'partial' as const,reason:'unverified_completion'},
   ...(result.responseSource?{responseSource:result.responseSource}:{}),webSources:result.webSources??[]}};
 }catch(error){
  // The retrieval already succeeded. Preserve its evidence and any held or
  // settled model accounting. The one-use confirmation never repeats either.
  if(error instanceof AuthorityError)throw error;
  return {answerFailure:'SYNTHESIS_UNAVAILABLE' as const};
 }
}
