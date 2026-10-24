import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const notice='// Modified by Xroga: use the named simpleGit factory for Git4 compatibility; see XROGA-GIT-COMPAT-NOTICE.txt.\n';
export const targets=[
  {file:'dist/index.js',binding:'wF',sha256:'a8b7ebb1d7a640cad9e388bc4eebd8bf4ce4ab853eb88196e7cc537974954184'},
  {file:'dist/hub/index.js',binding:'BU',sha256:'ea874e22921f932a895ce809d9a1af13e1cb19c436fedaacaa3ccd48f1ca00db'},
  {file:'dist/hub/daemon/entry.js',binding:'wz',sha256:'21a4006a17099d9230c4b120335886b75dd4e2ca9c2f9357743c1a8ce3f9003d'},
];
const hash=value=>createHash('sha256').update(value).digest('hex');

/** Only the three exact published 0.0.82 bundles are admitted. No fuzzy patches. */
export function patchedSource(source,target) {
  const from=`import ${target.binding} from"simple-git"`;
  const to=`import{simpleGit as ${target.binding}}from"simple-git"`;
  let original=source;
  if(source.startsWith(notice))original=source.slice(notice.length).replace(to,from);
  if(hash(original)!==target.sha256||original.split(from).length!==2)throw new Error(`Unreviewed Cline bundle: ${target.file}`);
  return notice+original.replace(from,to);
}

function packageRoot(entry,name) {
  let directory=dirname(entry);
  for(let i=0;i<8;i++){
    const path=join(directory,'package.json');
    if(existsSync(path)&&JSON.parse(readFileSync(path,'utf8')).name===name)return directory;
    directory=dirname(directory);
  }
  throw new Error(`Dependency package unavailable: ${name}`);
}

export function verifyOrApply({apply=false}={}) {
  const entry=fileURLToPath(import.meta.resolve('@cline/core'));
  const core=packageRoot(entry,'@cline/core');
  const git=packageRoot(createRequire(entry).resolve('simple-git'),'simple-git');
  if(JSON.parse(readFileSync(join(core,'package.json'),'utf8')).version!=='0.0.82'
    ||JSON.parse(readFileSync(join(git,'package.json'),'utf8')).version!=='4.0.2')throw new Error('Cline/Git compatibility version drift');
  const changes=targets.map(target=>{
    const path=join(core,target.file),before=readFileSync(path,'utf8');
    return {path,before,after:patchedSource(before,target)};
  });
  const vendor=resolve(dirname(fileURLToPath(import.meta.url)),'../vendor/cline');
  const notices=[['LICENSE','XROGA-THIRD-PARTY-LICENSE.txt'],['NOTICE.txt','XROGA-GIT-COMPAT-NOTICE.txt']].map(([from,to])=>({path:join(core,to),after:readFileSync(join(vendor,from),'utf8')}));
  if(apply){
    // Mechanical installation transform after complete validation. Package
    // versions/locks and all other runtime bytes remain the registry originals.
    for(const change of changes)if(change.before!==change.after)writeFileSync(change.path,change.after);
    for(const record of notices)writeFileSync(record.path,record.after);
  }else{
    for(const change of changes)if(change.before!==change.after)throw new Error('Cline Git compatibility patch missing; run the reviewed installation step');
    for(const record of notices)if(!existsSync(record.path)||readFileSync(record.path,'utf8')!==record.after)throw new Error('Cline compatibility license/notice missing');
  }
  return {result:apply?'APPLIED_REVIEWED_COMPATIBILITY':'PASS_REVIEWED_COMPATIBILITY',core:'0.0.82',git:'4.0.2',files:changes.map((change,index)=>({file:targets[index].file,originalSha256:targets[index].sha256,installedSha256:hash(change.after)}))};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!['--apply','--check'].includes(process.argv[2]))throw new Error('Explicit --apply or --check required');
  console.log(JSON.stringify(verifyOrApply({apply:process.argv[2]==='--apply'})));
}
