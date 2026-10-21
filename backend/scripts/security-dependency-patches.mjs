import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const notice='// Modified by Xroga on 2026-10-16: pinned advisory remediation; see XROGA-SECURITY-PATCH.txt.\n';
const digest=value=>createHash('sha256').update(value).digest('hex');
const guard="    if (depth > 128) throw new SyntaxError('Brace AST exceeds the supported nesting limit');\n";
export const targets=[
  {name:'braces',version:'3.0.3',file:'lib/parse.js',sha256:'e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310',changes:[
    ['      stack.push(block);',"      if (stack.length >= 128) throw new SyntaxError('Brace pattern exceeds the supported nesting limit');\n      stack.push(block);",2],
  ]},
  {name:'braces',version:'3.0.3',file:'lib/compile.js',sha256:'dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f',changes:[
    ['  const walk = (node, parent = {}) => {\n','  const walk = (node, parent = {}, depth = 0) => {\n'+guard,1],
    ['output += walk(child, node);','output += walk(child, node, depth + 1);',1],
  ]},
  {name:'braces',version:'3.0.3',file:'lib/expand.js',sha256:'41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7',changes:[
    ['  const walk = (node, parent = {}) => {\n','  const walk = (node, parent = {}, depth = 0) => {\n'+guard,1],
    ['        walk(child, node);','        walk(child, node, depth + 1);',1],
  ]},
  {name:'braces',version:'3.0.3',file:'lib/stringify.js',sha256:'379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a',changes:[
    ['  const stringify = (node, parent = {}) => {\n','  const stringify = (node, parent = {}, depth = 0) => {\n'+guard,1],
    ['output += stringify(child);','output += stringify(child, {}, depth + 1);',1],
  ]},
  {name:'node-forge',version:'1.4.0',file:'lib/rsa.js',sha256:'fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50',changes:[
    ['            obj.value.length !== 2) {',"            obj.value.length !== 2 ||\n            obj.value[0].value.length !== ('parameters' in capture ? 2 : 1)) {",1],
  ]},
];

export function patchedSource(source,target) {
  let original=source;
  if(source.startsWith(notice)){
    original=source.slice(notice.length);
    for(const [from,to] of [...target.changes].reverse())original=original.split(to).join(from);
  }
  if(digest(original)!==target.sha256)throw new Error(`Unreviewed dependency source: ${target.name}/${target.file}`);
  let result=original;
  for(const [from,to,count] of target.changes){
    if(result.split(from).length-1!==count)throw new Error('Security patch anchor drift');
    result=result.split(from).join(to);
  }
  return notice+result;
}

const patchNotice=`Xroga downstream security fixes, 2026-10-16.
braces 3.0.3: bound parser nesting and recursive AST traversal to avoid stack exhaustion (GHSA-vfj7-8cjw-p6xm).
node-forge 1.4.0: require exact nested DigestAlgorithm element count, retaining optional NULL semantics (GHSA-86w9-cpqp-85rv).
Original package versions, copyright notices and LICENSE files are retained. Braces is used under MIT and node-forge under its BSD-3-Clause option.
These are downstream modifications, not upstream releases or npm audit waivers. Review pins and regression tests before any dependency update.
`;

/** All installed copies recorded by the existing lock graphs, including nested receivers. */
export function verifyOrApply({apply=false,roots}={}) {
  const backend=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const parent=dirname(backend);
  roots??=[backend,...(existsSync(join(parent,'package.json'))&&JSON.parse(readFileSync(join(parent,'package.json'),'utf8')).name==='xroga'?[parent,join(parent,'frontend')]:[])];
  const packages=new Map();
  for(const root of roots){
    if(!existsSync(join(root,'package-lock.json')))continue;
    const lock=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8'));
    for(const [path,record] of Object.entries(lock.packages??{})){
      const name=path.match(/(?:^|\/)node_modules\/(braces|node-forge)$/)?.[1];if(!name)continue;
      const directory=resolve(root,path),inside=relative(resolve(root),directory);
      if(inside.startsWith('..')||isAbsolute(inside))throw new Error('Dependency patch escaped installation root');
      if(!existsSync(join(directory,'package.json')))continue;
      const installed=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));
      if(installed.name!==name||installed.version!==record.version||installed.version!==targets.find(t=>t.name===name).version)throw new Error('Unreviewed dependency version');
      packages.set(directory,name);
    }
  }
  if(!packages.size)throw new Error('No reviewed dependency receiver installed');
  const changes=[];
  for(const [directory,name] of packages){
    if(!existsSync(join(directory,'LICENSE')))throw new Error('Original dependency license is missing');
    for(const target of targets.filter(t=>t.name===name)){
      const path=join(directory,target.file),before=readFileSync(path,'utf8'),after=patchedSource(before,target);
      changes.push({path,before,after,name,file:target.file});
    }
    const path=join(directory,'XROGA-SECURITY-PATCH.txt');
    changes.push({path,before:existsSync(path)?readFileSync(path,'utf8'):null,after:patchNotice,name,file:'XROGA-SECURITY-PATCH.txt'});
  }
  // Validate every original before writing anything. Atomic replacement permits
  // idempotent workspace lifecycle invocations without readers seeing partial files.
  for(const change of changes){
    if(change.before===change.after)continue;
    if(!apply)throw new Error(`Dependency security patch missing: ${change.name}/${change.file}`);
    const temporary=`${change.path}.xroga-${process.pid}`;writeFileSync(temporary,change.after);renameSync(temporary,change.path);
  }
  return {result:apply?'APPLIED_PINNED_DOWNSTREAM_FIXES':'VERIFIED_PINNED_DOWNSTREAM_FIXES',packages:[...packages.values()],
    files:changes.filter(c=>c.file.endsWith('.js')).map(c=>({package:c.name,file:c.file,sha256:digest(c.after)})),npmAdvisoriesWaived:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!['--apply','--check'].includes(process.argv[2]))throw new Error('Explicit --apply or --check required');
  console.log(JSON.stringify(verifyOrApply({apply:process.argv[2]==='--apply'})));
}
