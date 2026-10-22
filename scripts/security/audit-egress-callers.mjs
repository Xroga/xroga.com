import ts from 'typescript';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
const jsonPath='docs/xroga/security/egress-callers.json';
const reviewPath='docs/xroga/security/egress-caller-reviews.json';

/** AST candidate register, not a reachability or security certificate. Strings
 * containing generated code are not executed call expressions in this process.
 * Reflection, subprocess internals and SDK-internal requests remain explicit
 * review obligations rather than disappearing from the acceptance count. */
export function inspectEgress(path,text) {
  const source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,path.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const aliases=new Map([['fetch','fetch'],['boundedPublicGet','boundedPublicGet'],['boundedPublicPost','boundedPublicPost']]);
  const namespaces=new Set(['axios','http','https','undici']);
  const processNamespaces=new Set(['childProcess','child_process']);
  const constants=new Map();
  const gather=node=>{
    if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
      const mod=node.moduleSpecifier.text;
      if(/^(node:)?child_process$/.test(mod)){
        const clause=node.importClause,names=clause?.namedBindings;
        if(clause?.name)processNamespaces.add(clause.name.text);
        if(names&&ts.isNamespaceImport(names))processNamespaces.add(names.name.text);
        if(names&&ts.isNamedImports(names))for(const e of names.elements)
          aliases.set(e.name.text,'subprocess-or-dynamic-execution');
      }
      if(/^(node:)?https?$|^undici$|^axios$/.test(mod)){
        const clause=node.importClause;
        if(clause?.name)namespaces.add(clause.name.text);
        const names=clause?.namedBindings;
        if(names&&ts.isNamespaceImport(names))namespaces.add(names.name.text);
        if(names&&ts.isNamedImports(names))for(const e of names.elements){const original=e.propertyName?.text??e.name.text;if(['request','get','fetch'].includes(original))aliases.set(e.name.text,`transport:${original}`);}
      }
    }
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer){
      if(ts.isStringLiteral(node.initializer)||ts.isNoSubstitutionTemplateLiteral(node.initializer))constants.set(node.name.text,node.initializer.text);
      const name=node.initializer.getText(source);
      if(name==='fetch'||name==='globalThis.fetch')aliases.set(node.name.text,'fetch');
    }
    ts.forEachChild(node,gather);
  };gather(source);
  const rows=[];const ordinals=new Map();
  const owner=node=>{
    for(let p=node.parent;p;p=p.parent){
      if((ts.isFunctionDeclaration(p)||ts.isMethodDeclaration(p))&&p.name)return p.name.getText(source);
      if(ts.isVariableDeclaration(p)&&p.initializer&&(ts.isArrowFunction(p.initializer)||ts.isFunctionExpression(p.initializer)))return p.name.getText(source).slice(0,100);
    }return '<module-or-callback>';
  };
  const visit=node=>{
    if(ts.isCallExpression(node)||ts.isNewExpression(node)){
      const call=node.expression.getText(source),arg=node.arguments?.[0],scope=owner(node);
      const normalized=call.replace(/\s+/g,'').replace(/\[['"]([^'"]+)['"]\]/g,'.$1');
      let transport=null;
      if(aliases.has(normalized))transport=aliases.get(normalized);
      else if(/(?:^|\.)(fetch|callTool|executeTool|goto|connectOverCDP|send|upload|uploadFile|uploadData)$/.test(normalized)
        &&! /^(res|response|reply)(?:\.|\[|\()/.test(normalized))transport=normalized.split('.').at(-1);
      else if([...namespaces].some(n=>normalized.startsWith(n+'.')&&/\.(get|post|put|delete|patch|request)$/.test(normalized)))transport='http-client';
      else if(/\.(chat\.completions|responses|messages|embeddings|files|images)\.(create|generate)$/.test(normalized))transport='provider-sdk';
      else if(/^(exec|execFile|spawn|eval)$/.test(normalized)||[...processNamespaces].some(n=>normalized.startsWith(n+'.')))transport='subprocess-or-dynamic-execution';
      else if(ts.isNewExpression(node)&&/(WebSocket|SSEClientTransport|StreamableHTTPClientTransport|Function)$/.test(normalized))transport='network-or-dynamic-client';
      if(transport){
        const key=`${scope}:${normalized}`,ordinal=(ordinals.get(key)??0)+1;ordinals.set(key,ordinal);
        const id=hash(`${path}:${key}:${ordinal}`).slice(0,20);
        let prefix='';
        if(arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg)))prefix=arg.text;
        if(arg&&ts.isIdentifier(arg))prefix=constants.get(arg.text)??'';
        if(arg&&ts.isTemplateExpression(arg))prefix=arg.head.text;
        let origin=null;try{origin=new URL(prefix).origin;}catch{/* Dynamic destination remains pending. */}
        const guarded=transport==='boundedPublicGet';
        rows.push({id,file:path,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,
          entryPoint:scope,transport,callee:normalized,callSha256:hash(node.getText(source)),
          destination:origin&&origin!=='null'?origin:'DYNAMIC_OR_SDK_INTERNAL',
          trust:path.startsWith('frontend/src/')&&!path.startsWith('frontend/src/app/api/')?'UNREVIEWED_FRONTEND_OR_SHARED_CALLER':'UNREVIEWED_SERVER_CALLER',tenantAuthority:'REQUIRES_SOURCE_TRACE',
          currentProtection:guarded?'CENTRAL_PUBLIC_GET_CANDIDATE_NOT_SEMANTIC_CERTIFICATION':'NOT_CERTIFIED',
          risk:origin&&origin!=='null'?'FIXED_ORIGIN_REVIEW':'HIGH_RISK_PENDING_REVIEW',
          disposition:'PENDING_SOURCE_TRACE',evidence:null});
      }
    }ts.forEachChild(node,visit);
  };visit(source);return rows;
}

export function collect() {
  const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/)
    .filter(p=>/^(backend\/src\/|frontend\/src\/|workers\/)/.test(p)&&/\.[cm]?[jt]sx?$/.test(p)
      &&!/(?:\.test\.|\.integration\.|\/__tests__\/|\/fixtures\/)/.test(p)).sort();
  const reviews=existsSync(resolve(root,reviewPath))?JSON.parse(readFileSync(resolve(root,reviewPath),'utf8')).reviews:[];
  const reviewMap=new Map(reviews.map(r=>[r.id,r]));
  if(reviewMap.size!==reviews.length)throw Error('Duplicate egress review');
  const callers=paths.flatMap(p=>inspectEgress(p,readFileSync(resolve(root,p),'utf8')));
  for(const row of callers){
    const review=reviewMap.get(row.id);if(!review)continue;
    if(review.callSha256!==row.callSha256||review.sourceFileSha256!==hash(readFileSync(resolve(root,row.file),'utf8'))||!['VERIFIED_GUARD','REVIEWED_FIXED_DEPENDENCY','DISABLED_WITH_PROOF'].includes(review.disposition)
      ||!Array.isArray(review.evidence)||review.evidence.length===0||review.evidence.some(e=>!existsSync(resolve(root,e.path))||!readFileSync(resolve(root,e.path),'utf8').includes(e.marker)||hash(readFileSync(resolve(root,e.path),'utf8'))!==e.sha256))throw Error(`Egress review evidence drift:${row.id}`);
    Object.assign(row,{disposition:review.disposition,evidence:review.evidence,trust:review.trust,tenantAuthority:review.tenantAuthority});
  }
  for(const id of reviewMap.keys())if(!callers.some(r=>r.id===id))throw Error(`Orphan egress review:${id}`);
  const pending=callers.filter(r=>r.disposition==='PENDING_SOURCE_TRACE');
  return {version:1,scope:'AST_CANDIDATES_NOT_BLANKET_SECURITY_CERTIFICATION',sourceTreeDigest:hash(paths.map(p=>`${p}:${hash(readFileSync(resolve(root,p),'utf8'))}`).join('\n')),
    limitations:['SDK internals, generated/deployed code and reflection require semantic review','Static inclusion is not proof of route reachability','A fixed hostname is not proof of tenant, data or action safety'],
    callers,counts:{total:callers.length,reviewed:callers.length-pending.length,pending:pending.length,
      unresolvedHighRiskBypasses:pending.filter(r=>r.risk==='HIGH_RISK_PENDING_REVIEW').length}};
}
export function main(args=process.argv.slice(2)){
  const result=collect(),serialized=JSON.stringify(result,null,2)+'\n';
  if(args.includes('--write')){mkdirSync(dirname(resolve(root,jsonPath)),{recursive:true});writeFileSync(resolve(root,jsonPath),serialized);}
  else if(!existsSync(resolve(root,jsonPath))||readFileSync(resolve(root,jsonPath),'utf8').replace(/\r\n/g,'\n')!==serialized)throw Error('Current-source egress inventory drift. Review changes then use --write.');
  console.log(JSON.stringify({scope:result.scope,...result.counts}));
  if(args.includes('--require-complete')&&result.counts.pending)throw Error('Command010 incomplete: pending source traces and high-risk bypasses remain');
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
