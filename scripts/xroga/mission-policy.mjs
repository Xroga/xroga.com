import { z } from 'zod';
const text=z.string().trim().min(1),texts=z.array(text),sha=z.string().regex(/^[a-f0-9]{40}$/);
const impact=z.strictObject({changed:z.boolean(),description:text});
export const missionSchema=z.strictObject({
  version:z.literal('1.0'),missionId:text,baseSha:sha,requirementIds:texts.min(1),
  state:z.enum(['IN_PROGRESS','CODE_COMPLETE','VERIFIED_SCOPE','LIVE_VERIFIED','BLOCKED']),risk:z.enum(['low','medium','high']),
  scope:text,changedFiles:texts.min(1),decisions:z.strictObject({keep:texts.min(1),extend:texts,replace:texts,deprecate:texts}),
  schemaImpact:z.strictObject({changed:z.boolean(),migrations:texts,rollout:text,rollback:text}),
  securityImpact:z.strictObject({auth:impact,tenant:impact,approval:impact,credentials:impact,egress:impact,cost:impact,billing:impact}),
  tests:z.array(z.strictObject({command:text,scope:text,negative:z.boolean(),reference:text})).min(1),
  architecture:z.strictObject({change:z.enum(['none','extends_canonical','new_control_plane','replacement']),reason:text,rfc:text.nullable()}),
  rollout:text,rollback:text,knownGaps:texts,placeholderClaimsRemaining:texts,
  evidenceRefs:texts.min(1),claimsFullProductCompletion:z.boolean(),claimsAllBatchCommandsComplete:z.boolean(),
  release:z.strictObject({state:z.enum(['BLOCKED','NOT_REQUESTED','READY_FOR_REVIEW','LIVE_VERIFIED']),blockers:texts,
    authenticatedE2e:z.enum(['PASS','BLOCKED','NOT_APPLICABLE']),stagedSecurity:z.enum(['PASS','BLOCKED','NOT_APPLICABLE']),
    liveUrl:z.string().url().nullable(),deployedSha:sha.nullable()}),
});
export const missionJsonSchema=z.toJSONSchema(missionSchema,{target:'draft-7'});
export function validateMission(value,{requirementIds=new Set(),pathExists=()=>true,goldenStates={BLOCKED_KNOWN_GAP:12,FAIL:0},allBatchCommandsVerified=false}={}){
  const mission=missionSchema.parse(value);
  const serialized=JSON.stringify(mission);
  if(/sb_secret_|sk-proj-|sk_(?:live|test)_[A-Za-z0-9]{12}|AKIA[A-Z0-9]{16}|Bearer\s+[A-Za-z0-9._-]{12}|postgres(?:ql)?:\/\/[^\s"]+:[^\s"]+@/i.test(serialized))throw new Error('Credential-like evidence is forbidden; never print the offending value');
  if(new Set(mission.changedFiles).size!==mission.changedFiles.length)throw new Error('Duplicate changed-file declaration');
  for(const id of mission.requirementIds)if(!requirementIds.has(id))throw new Error('Unknown mission requirement');
  const refs=[...mission.changedFiles,...mission.evidenceRefs,...mission.tests.map(row=>row.reference),...mission.schemaImpact.migrations,...(mission.architecture.rfc?[mission.architecture.rfc]:[])];
  if(refs.some(path=>path.startsWith('/')||/^[A-Za-z]:/.test(path)||path.includes('\\')||path.includes('..')||!pathExists(path)))throw new Error('Missing/unsafe mission evidence or file reference');
  const migrationFiles=mission.changedFiles.filter(path=>/^supabase\/migrations\/.+\.sql$/.test(path));
  if(migrationFiles.length&&!mission.schemaImpact.changed)throw new Error('Schema change incorrectly declared no DB impact');
  if(mission.schemaImpact.changed&&(!mission.schemaImpact.migrations.length||migrationFiles.some(path=>!mission.schemaImpact.migrations.includes(path))))throw new Error('Schema change needs explicit migration declaration');
  if(!mission.schemaImpact.changed&&mission.schemaImpact.migrations.length)throw new Error('No-schema change cannot declare unapplied migration effects');
  if(['new_control_plane','replacement'].includes(mission.architecture.change)&&(!mission.architecture.rfc||!pathExists(mission.architecture.rfc)))throw new Error('Architecture replacement/new control plane requires an explicit RFC');
  if(Object.values(mission.securityImpact).some(row=>row.changed)&&!mission.tests.some(row=>row.negative))throw new Error('Security-changing mission needs negative tests');
  if(mission.risk==='high'&&/^(?:none|not applicable|n\/a)$/i.test(mission.rollback))throw new Error('High-risk change needs a real rollback');
  if(['VERIFIED_SCOPE','LIVE_VERIFIED'].includes(mission.state)&&mission.placeholderClaimsRemaining.length)throw new Error('Unresolved placeholders cannot be marked verified/DONE');
  if(mission.claimsFullProductCompletion&&((goldenStates.BLOCKED_KNOWN_GAP??0)>0||(goldenStates.FAIL??0)>0))throw new Error('Full product completion contradicts blocked/failed golden journeys');
  if(mission.claimsAllBatchCommandsComplete&&!allBatchCommandsVerified)throw new Error('All ten command evidence gates must be verified before all-Batch completion');
  if(mission.release.state==='BLOCKED'&&!mission.release.blockers.length)throw new Error('Blocked release needs precise blockers');
  if(['READY_FOR_REVIEW','LIVE_VERIFIED'].includes(mission.release.state)&&mission.release.blockers.length)throw new Error('Release readiness contradicts remaining blockers');
  if(['READY_FOR_REVIEW','LIVE_VERIFIED'].includes(mission.release.state)&&Object.values(mission.securityImpact).some(row=>row.changed)&&
    (mission.release.authenticatedE2e!=='PASS'||mission.release.stagedSecurity!=='PASS'))throw new Error('Security-sensitive release needs authenticated and staged proof');
  if(mission.state==='LIVE_VERIFIED'||mission.release.state==='LIVE_VERIFIED'){
    if(!mission.release.liveUrl||!mission.release.deployedSha||mission.release.state!=='LIVE_VERIFIED')throw new Error('Live claim needs independently verified URL and deployed SHA');
  }else if(mission.release.liveUrl||mission.release.deployedSha)throw new Error('Do not attach a live deployment claim to unverified work');
  return {result:'PASS_STRUCTURED_POLICY_NOT_RELEASE_AUTHORIZATION',missionId:mission.missionId,state:mission.state,release:mission.release.state};
}
