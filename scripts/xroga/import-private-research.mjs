/** Import only derived requirements/provenance; never copy private originals into Git. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const archiveHash='1fd3bda7d1bce2697be94a7539b8c30d04a788fdb9b5ba9042ce161cc06913bf';
export const pins=[
  ['original_sources/Xroga_Oct11_Frontier_Workers_Research.txt','27d9444bfae4c3fd84a10785ed2608f12934f7c173562e37c801a13f2364d966',137312],
  ['original_sources/Xroga_Oct11_Master_Genome_Storage_Publish.txt','a2ea747ae6d9b8a9bf7367a2431c6b30442aa23f2018eb4b1c6fc9de0819000b',353832],
  ['research/Xroga_OS_Final_Engineering_Research_2026-10-12.md','5d6488d19920f2899c3e70090d2c979875a7e99aad88d70683c7d567b23e45d7',34300],
  ['research/Xroga_GitHub_Research_Catalog_2026-10-12.json','a02fa6b85b28651f8a4ae5462cc030bbc30a49bcd65e5ea0bf5092e36b042957',15133],
  ['codex/Xroga_OS_72_Codex_Missions_Full_Implementation_2026-10-13.md','7ce0e643a1c2a1728be695730fe73b0c12d5d183985b2e76b2c589f67552df11',98589],
  ['codex/Xroga_OS_Codex_72_Command_Manifest_2026-10-13.json','d272202ad4353131f45394b89f98f614fd95a3cf337e5981bf120fe1d91f8222',145227],
  ['codex/Xroga_OS_Feature_Coverage_119_Items_2026-10-13.csv','31178d375b8270d97c9ddc1efb16624badcbbc668e9f3e0d8f29365594c2171c',8479],
  ['START_HERE.md','2cb7e528e20195767ad9039b48805cce2db0348134eb6a9cb1cb56659614f601',2239],
];
export const digest = bytes=>createHash('sha256').update(bytes).digest('hex');
// Exact normalized import; an intentional reimport must update this review pin.
export const derivedHash='eff82137ba54e413c48f72645afa4783c8184c5524f351ab44b4a7d1f594d14b';
// Explicit assessor mappings by original CSV row, not keyword-based completion.
// Multiple related missions remain dependencies, not proof of implementation.
export const featureOwners=[
  56,25,25,25,22,23,17,26,24,20,69,25,49,70,
  36,37,32,33,32,34,10,35,35,55,37,36,37,59,58,60,
  38,38,39,40,39,38,20,41,40,
  27,24,28,28,28,28,29,8,31,7,30,28,
  42,43,43,44,45,45,63,62,44,44,18,47,47,
  48,48,51,35,13,49,51,50,50,52,52,52,51,48,
  53,53,54,54,54,54,49,50,37,30,67,55,54,55,
  58,57,58,60,60,59,59,66,9,57,61,62,63,62,
  7,65,65,65,15,10,16,72,7,11,67,64,70,
];
export function parseCoverage(text) {
  // Original CSV is deliberately unquoted. Reject changes rather than misparse.
  const lines=text.replace(/\r\n/g,'\n').trimEnd().split('\n');
  const columns=['group','feature','observed_state','evidence_ref','owner','mission_ref','acceptance_test','test_result','notes'];
  if(lines.shift()!==columns.join(',')) throw new Error('Original coverage header mismatch');
  const rows=lines.map((line,index)=>{
    const values=line.split(',');
    if(values.length!==9 || line.includes('"')) throw new Error('Unsupported original CSV representation');
    const row=Object.fromEntries(columns.map((name,i)=>[name,values[i]]));
    if(row.observed_state!=='UNVERIFIED' || row.test_result!=='NOT_RUN' || !row.group || !row.feature) throw new Error('Unexpected original feature status');
    if([row.evidence_ref,row.owner,row.mission_ref,row.acceptance_test,row.notes].some(Boolean)) throw new Error('Original feature fields changed');
    return {row:index+1,...row,assessor_primary_mission:featureOwners[index]};
  });
  if(rows.length!==119 || featureOwners.length!==119 || new Set(rows.map(r=>r.feature)).size!==119) throw new Error('119-row feature coverage incomplete or duplicated');
  return rows;
}
export function deriveResearch(readBytes) {
  const verified=new Map();
  for(const [path,sha256,byte_size] of pins) {
    const bytes=readBytes(path);
    if(digest(bytes)!==sha256 || bytes.length!==byte_size) throw new Error(`Private source integrity mismatch: ${path}`);
    verified.set(path,bytes.toString('utf8'));
  }
  const manifest=JSON.parse(verified.get(pins[5][0])),markdown=verified.get(pins[4][0]);
  if(manifest.count!==72 || manifest.commands.length!==72) throw new Error('72-mission source incomplete');
  const missions=manifest.commands.map((item,i)=>{
    const number=i+1,padded=String(number).padStart(2,'0');
    if(item.number!==number || !item.title || !item.implementation || !item.acceptance || !item.phase || !item.upstream_candidates) throw new Error('Mission order/fields mismatch');
    if(!markdown.includes(`### Command ${padded} — ${item.title}`) || !markdown.includes(item.codex_prompt)) throw new Error(`Markdown/manifest disagreement: ${number}`);
    return {number,title:item.title,phase:item.phase,phase_title:item.phase_title,implementation:item.implementation,acceptance:item.acceptance,upstream_candidates:item.upstream_candidates,
      source_status:'REQUIREMENT_NOT_IMPLEMENTATION',implementation_verified:false};
  });
  if([...markdown.matchAll(/^### Command \d{2} — /gm)].length!==72) throw new Error('Markdown contains extra or missing missions');
  const catalog=JSON.parse(verified.get(pins[3][0]));
  const candidates=catalog.github_candidates.map(item=>{
    if(!/^https:\/\/github.com\/[^/]+\/[^/]+$/.test(item.url) || !item.name || !item.purpose) throw new Error('Invalid research candidate');
    return {name:item.name,url:item.url,category:item.category,purpose:item.purpose,source_proposed_decision:item.decision,admission:'RESEARCH_ONLY_NOT_ADOPTED',license_and_commit:'NOT_INDEPENDENTLY_VERIFIED_BY_THIS_IMPORT'};
  });
  return {version:1,archive_sha256:archiveHash,originals_committed:false,
    sources:pins.map(([path,sha256,byte_size])=>({path,sha256,byte_size,ingestion:path.startsWith('original_sources/')?'HASH_VERIFIED_SEMANTIC_REVIEW_PENDING':'PARSED_REQUIREMENTS_OR_RESEARCH'})),
    features:parseCoverage(verified.get(pins[6][0])),missions,candidates,
    limits:['Original transcripts hash-verified; full semantic reconciliation remains pending.','The source bundle is planning evidence, never proof of current runtime, license admission, deployment or verified work.','The historical shared ChatGPT page remains inaccessible; no omitted chat contents invented.']};
}
export function validateDerivedResearch(value) {
  if(digest(`${JSON.stringify(value,null,2)}\n`)!==derivedHash) throw new Error('Derived original requirements integrity mismatch');
  if(value.version!==1 || value.archive_sha256!==archiveHash || value.originals_committed!==false) throw new Error('Research provenance mismatch');
  if(JSON.stringify(value.sources)!==JSON.stringify(pins.map(([path,sha256,byte_size])=>({path,sha256,byte_size,ingestion:path.startsWith('original_sources/')?'HASH_VERIFIED_SEMANTIC_REVIEW_PENDING':'PARSED_REQUIREMENTS_OR_RESEARCH'})))) throw new Error('Pinned original source metadata changed');
  if(value.features.length!==119 || value.missions.length!==72) throw new Error('Original source row coverage gap');
  for(const [index,row] of value.features.entries()) if(row.row!==index+1 || row.assessor_primary_mission!==featureOwners[index] || row.observed_state!=='UNVERIFIED' || row.test_result!=='NOT_RUN') throw new Error('Feature mapping/status mismatch');
  for(const [index,item] of value.missions.entries()) if(item.number!==index+1 || item.implementation_verified!==false || item.source_status!=='REQUIREMENT_NOT_IMPLEMENTATION' || !item.acceptance) throw new Error('Mission status/order mismatch');
  return value;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [privateDir,archivePath]=process.argv.slice(2);
  if(!privateDir || !archivePath || digest(readFileSync(archivePath))!==archiveHash) throw new Error('Exact private directory and verified original ZIP required');
  const value=deriveResearch(path=>readFileSync(resolve(privateDir,path)));
  validateDerivedResearch(value);
  writeFileSync(new URL('../../docs/xroga/research/derived-original-requirements.json',import.meta.url),`${JSON.stringify(value,null,2)}\n`);
  console.log(JSON.stringify({result:'DERIVED_REQUIREMENTS_NOT_IMPLEMENTATION',features:value.features.length,missions:value.missions.length,candidates:value.candidates.length,rawOriginalsCopied:false}));
}
