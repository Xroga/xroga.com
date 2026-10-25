import { readFileSync,readdirSync,existsSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { root } from '../ci/toolchain.mjs';
import { missionSchema,missionJsonSchema,validateMission } from './mission-policy.mjs';
const read=path=>readFileSync(join(root,path),'utf8').replace(/\r\n/g,'\n');
export function main(){
  const ids=new Set(JSON.parse(read('docs/xroga/requirements-ledger.json')).requirements.map(row=>row.requirement_id));
  const journeys=JSON.parse(read('docs/xroga/golden-journey-matrix.json')).journeys;
  const goldenStates=Object.fromEntries(['PASS','FAIL','BLOCKED_KNOWN_GAP','NOT_APPLICABLE'].map(state=>[state,journeys.filter(row=>row.state===state).length]));
  const allBatchCommandsVerified=Array.from({length:10},(_,index)=>String(index+1).padStart(3,'0')).every(command=>{
    const path=`docs/xroga/evidence/command-${command}/manifest.json`;
    return existsSync(join(root,path))&&/^VERIFIED/.test(JSON.parse(read(path)).status??'');
  });
  const results=readdirSync(join(root,'docs/xroga/missions')).filter(name=>name.endsWith('.json')).sort().map(name=>{
    const mission=missionSchema.parse(JSON.parse(read(`docs/xroga/missions/${name}`)));
    const result=validateMission(mission,{requirementIds:ids,pathExists:path=>existsSync(join(root,path)),goldenStates,allBatchCommandsVerified});
    // CI checkout must retain history; a source identity is not guessed from a document.
    execFileSync('git',['merge-base','--is-ancestor',mission.baseSha,'HEAD'],{cwd:root,stdio:'pipe'});
    return result;
  });
  if(!results.length)throw new Error('No structured mission manifests collected');
  if(JSON.stringify(JSON.parse(read('docs/xroga/mission-manifest.schema.json')))!==JSON.stringify(missionJsonSchema))throw new Error('Mission schema drift');
  const agents=read('AGENTS.md'),invariants=read('docs/xroga/ARCHITECTURE_INVARIANTS.md');
  for(let index=1;index<=12;index++){const id=`INV-${String(index).padStart(2,'0')}`;if(!agents.includes(id)||!invariants.includes(id))throw new Error('Missing mandatory invariant ID');}
  for(const path of ['docs/xroga/IMPLEMENTATION_STATUS.md','docs/xroga/DEFINITION_OF_DONE.md','docs/xroga/CHANGE_SAFETY.md','docs/xroga/PR_EVIDENCE_TEMPLATE.md','.github/pull_request_template.md'])if(!existsSync(join(root,path)))throw new Error('Missing mission operating-contract document');
  console.log(JSON.stringify({result:'PASS_MISSION_POLICY_NOT_RELEASE_AUTHORIZATION',results,goldenStates,allBatchCommandsVerified}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
