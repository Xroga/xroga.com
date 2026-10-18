import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareBaselineRuns} from '../ci/compare-baseline-runs.mjs';
import {generateInventory,serializedOutputs} from './inventory.mjs';
import {buildRuntimeInventory,renderRuntimeOutputs} from './runtime-inventory.mjs';
import {buildPhaseOne,root} from './phase-one.mjs';
import {parseCommandRequirements} from './reconcile-requirements.mjs';

export const evidencePath='docs/xroga/batch-1/phases/PHASE-1-VERIFIED-EVIDENCE.json';
const hash=text=>createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
const read=p=>readFileSync(resolve(root,p),'utf8').replace(/\r\n/g,'\n');
const git=a=>execFileSync('git',a,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
const gh=a=>execFileSync('gh',a,{cwd:root,encoding:'utf8',maxBuffer:30*1024*1024,stdio:['ignore','pipe','ignore']});
const isBoundPath=p=>
    /^(backend|frontend)\/src\/.*\.[jt]sx?$/.test(p)||/^scripts\/.*\.mjs$/.test(p)||/^tests\/mission-policy\//.test(p)
    ||/^supabase\/migrations\/.*\.sql$/.test(p)||/^\.github\/workflows\//.test(p)
    ||['AGENTS.md','package-lock.json','backend/package-lock.json','frontend/package-lock.json',
      'docs/xroga/research/inputs/batch-one-report.txt','docs/xroga/research/supplemental-planning-owners.json',
      'docs/xroga/research/derived-original-requirements.json','docs/xroga/golden-journey-matrix.json',
      'docs/xroga/ARCHITECTURE_INVARIANTS.md','docs/xroga/DEFINITION_OF_DONE.md','docs/xroga/PR_EVIDENCE_TEMPLATE.md'].includes(p);
export function implementationBindings(){
  return git(['ls-files']).split(/\r?\n/).filter(isBoundPath).sort().map(path=>({path,sha256:hash(read(path))}));
}
const historicalBindings=new Map();
export function implementationBindingsAtSource(source){
  assert.match(source,/^[a-f0-9]{40}$/);
  if(historicalBindings.has(source))return historicalBindings.get(source);
  const paths=git(['ls-tree','-r','--name-only',source]).split(/\r?\n/).filter(isBoundPath).sort();
  const objects=execFileSync('git',['cat-file','--batch'],{cwd:root,input:paths.map(path=>`${source}:${path}`).join('\n')+'\n',maxBuffer:60*1024*1024,stdio:['pipe','pipe','ignore']});
  let offset=0;const result=paths.map(path=>{const end=objects.indexOf(10,offset),header=objects.subarray(offset,end).toString('utf8').split(' ');
    assert.equal(header[1],'blob');const size=Number(header[2]);assert.ok(Number.isSafeInteger(size)&&size>=0);offset=end+1;
    const text=objects.subarray(offset,offset+size).toString('utf8');offset+=size+1;return {path,sha256:hash(text)};});
  historicalBindings.set(source,result);return result;
}
export function validatePhaseReceipt(receipt,bindings){
  assert.equal(receipt.version,1);assert.equal(receipt.collection,'GH_READ_ONLY_EXACT_SOURCE_AND_DOWNLOADED_ARTIFACTS');
  assert.match(receipt.sourceSha,/^[a-f0-9]{40}$/);assert.match(receipt.integratedSha,/^[a-f0-9]{40}$/);
  assert.notEqual(receipt.sourceSha,receipt.integratedSha);assert.match(receipt.aggregateRun??'',/^\d+$/);assert.match(receipt.disposableRun??'',/^\d+$/);
  assert.equal(receipt.workflowCategories,11);assert.equal(receipt.branchRuns,2);assert.equal(receipt.integratedRuns,2);
  assert.equal(receipt.stagesPerRun,21);assert.equal(receipt.sourceTreeMutated,false);
  assert.equal(receipt.disposable.failures,0);assert.equal(receipt.disposable.skips,0);
  assert.equal(receipt.disposable.migrations,115);assert.ok(receipt.disposable.securityTests>=149);assert.equal(receipt.disposable.browserTests,3);
  assert.equal(receipt.disposable.experimentAdmission,true);assert.deepEqual(receipt.implementationBindings,bindings);
  assert.equal(receipt.criteria.length,60);assert.equal(new Set(receipt.criteria.map(c=>c.id)).size,60);
  assert.ok(receipt.criteria.every(c=>c.status==='PASS'&&c.testIds.length&&c.proofIds.length));
  const original=new Map(parseCommandRequirements(read('docs/xroga/research/inputs/batch-one-report.txt')).filter(c=>Number(c.number)<=6)
    .flatMap(c=>c.criteria.map((text,i)=>[`XB01-C${c.number}-AC${String(i+1).padStart(2,'0')}`,text])));
  for(const c of receipt.criteria)assert.equal(c.originalText,original.get(c.id),'Original criterion wording or ID changed');
  assert.match(receipt.manifestSetSha256,/^[a-f0-9]{64}$/);return receipt;
}
export function baselineFixtureLog(files,readLog){
  return files.filter(p=>/(?:inventory-and-ledger-fixtures|baseline-negative-fixtures)\.log$/.test(p)).map(readLog).join('\n');
}

export function collectPhaseEvidence({source,aggregate,disposable,directory}){
  assert.equal(git(['rev-parse','HEAD']),source,'Collect on the exact candidate checkout');
  assert.equal(git(['status','--porcelain','--untracked-files=no']),'','Acceptance collection requires unchanged tracked source');
  const workflows=JSON.parse(gh(['run','list','--commit',source,'--limit','30','--json','databaseId,status,conclusion']));
  assert.equal(workflows.length,11);assert.ok(workflows.every(r=>r.status==='completed'&&r.conclusion==='success'));
  for(const run of [aggregate,disposable]){const r=JSON.parse(gh(['run','view',run,'--json','headSha,status,conclusion']));
    assert.equal(r.headSha,source);assert.equal(r.status,'completed');assert.equal(r.conclusion,'success');}
  const files=readdirSync(resolve(root,directory),{recursive:true}).map(p=>p.replaceAll('\\','/'));
  const manifests=files.filter(p=>/run-[ab]-manifest\.json$/.test(p)).map(p=>({path:directory+'/'+p,body:read(directory+'/'+p),value:JSON.parse(read(directory+'/'+p))}));
  assert.equal(manifests.length,4);const grouped=new Map();for(const m of manifests){const rows=grouped.get(m.value.sourceSha)??[];rows.push(m);grouped.set(m.value.sourceSha,rows);}
  assert.equal(grouped.size,2);assert.equal(grouped.get(source)?.length,2);
  for(const rows of grouped.values()){assert.equal(rows.length,2);compareBaselineRuns(rows[0].value,rows[1].value);
    for(const row of rows)for(const stage of row.value.results)if(stage.skipped!==undefined)assert.equal(stage.skipped,0,'Mandatory Linux CI tests must not be hidden by skips');}
  const integratedSha=[...grouped.keys()].find(s=>s!==source);
  const fixtureLog=baselineFixtureLog(files,p=>read(directory+'/'+p));
  for(const name of ['fully valid synthetic ten-criterion proof passes','all eight approved supplemental owners','committed Phase1 mappings cannot silently drift'])assert.ok(fixtureLog.includes(`ok `)&&fixtureLog.includes(name),`Missing executed Phase1 fixture:${name}`);
  const log=gh(['run','view',disposable,'--log']);
  const migration=log.match(/full_history=(\d+); upgrade=PASS; fresh=PASS; no_production_data=true/);assert.ok(migration);
  const security=log.split(/\r?\n/).filter(line=>line.includes('\tReal tenant authorization and concurrency integration\t')).join('\n');
  const count=name=>Number(security.match(new RegExp(`# ${name} (\\d+)`))?.[1]);
  assert.equal(count('fail'),0);assert.equal(count('skipped'),0);assert.equal(count('tests'),count('pass'));
  const experimentAdmission=/ok \d+ - real experiment assignment and exposure serialize current ownership and return durable concurrent winners/.test(security);
  const browser=log.split(/\r?\n/).find(line=>line.includes('\tAuthenticated browser and tenant isolation\t')&&/\b3 passed \(/.test(line));assert.ok(browser);
  const ledger=JSON.parse(read('docs/xroga/requirements-ledger.json'));
  assert.equal(ledger.requirements.filter(r=>r.implementation_owner_command.startsWith('LATER_')).length,0);
  assert.equal(ledger.requirements.filter(r=>r.implementation_owner_command.startsWith('SUPP-')).length,8);
  const criteria=buildPhaseOne().scoreboard.filter(c=>c.phase===1).map(c=>{
    const testIds=[...new Set(c.implementationEvidence.filter(p=>p.endsWith('.mjs')).flatMap(p=>[...read(p).matchAll(/test\('([^']+)'/g)].map(m=>m[1])))];
    assert.ok(testIds.length);assert.ok(testIds.every(name=>fixtureLog.includes(name)),`Missing executed criterion fixtures:${c.id}`);
    return {...c,status:'PASS',verifiedSourceSha:source,reason:'Actual exact-source repeated branch/integrated baseline and disposable evidence; original criterion wording retained',
      testType:['001','002','004','006'].includes(c.command)?'CI_POSITIVE_NEGATIVE_FIXTURES':'CI_AND_DISPOSABLE',testIds,
      proofIds:[`github:${aggregate}`,`github:${disposable}`]};});
  const result={version:1,collection:'GH_READ_ONLY_EXACT_SOURCE_AND_DOWNLOADED_ARTIFACTS',sourceSha:source,integratedSha,aggregateRun:aggregate,disposableRun:disposable,
    workflowCategories:11,branchRuns:2,integratedRuns:2,stagesPerRun:21,sourceTreeMutated:false,
    disposable:{migrations:Number(migration[1]),securityTests:count('tests'),browserTests:3,failures:0,skips:0,experimentAdmission},
    implementationBindings:implementationBindings(),manifestSetSha256:hash(manifests.map(m=>m.path+':'+hash(m.body)).sort().join('\n')),criteria,
    releaseAuthorized:false,phase2Authorized:false,additionalSpend:0};
  validatePhaseReceipt(result,result.implementationBindings);
  return result;
}

export function main(args=process.argv.slice(2)){
  const arg=name=>args[args.indexOf(name)+1];
  const receipt=collectPhaseEvidence({source:arg('--source'),aggregate:arg('--aggregate'),disposable:arg('--disposable'),directory:arg('--artifacts')});
  const out='artifacts/phase-1-acceptance';mkdirSync(resolve(root,out),{recursive:true});
  // Exact-SHA truth maps are emitted without mutating tracked source. A Git
  // commit cannot contain its own SHA in committed generated prose.
  const inventory=generateInventory({refresh:true});inventory.identity.auditStartedUtc=inventory.identity.sourceTimestampUtc;
  inventory.identity.initialWorkingTreeState='Clean tracked candidate checkout independently checked by the exact-source acceptance collector.';
  for(const[path,content]of serializedOutputs(inventory))writeFileSync(resolve(root,out,path.replaceAll('/','__')),content);
  for(const[path,content]of renderRuntimeOutputs(buildRuntimeInventory({sourceSha:receipt.sourceSha})))writeFileSync(resolve(root,out,path.replaceAll('/','__')),content);
  const scoreboard=buildPhaseOne().scoreboard.map(c=>receipt.criteria.find(r=>r.id===c.id)??c);
  writeFileSync(resolve(root,out,'BATCH-1-CRITERION-SCOREBOARD.json'),JSON.stringify({version:1,sourceSha:receipt.sourceSha,integratedSha:receipt.integratedSha,criteria:scoreboard},null,2)+'\n');
  writeFileSync(resolve(root,out,'PHASE-1-VERIFIED-EVIDENCE.json'),JSON.stringify(receipt,null,2)+'\n');
  if(args.includes('--write-evidence'))writeFileSync(resolve(root,evidencePath),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({result:'B1_P1_VERIFIED',sourceSha:receipt.sourceSha,integratedSha:receipt.integratedSha,criteriaPassed:60,migrations:receipt.disposable.migrations,securityTests:receipt.disposable.securityTests,browserTests:3,phase2Started:false,productionAuthorized:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
