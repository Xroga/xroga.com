import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from '../ci/toolchain.mjs';
import { applyCallerReviews, evaluateCallerClosure } from './caller-reviews.mjs';
const ts = createRequire(import.meta.url)('typescript');
const hash = value => createHash('sha256').update(value).digest('hex');
const normalized = value => value.replace(/\r\n/g,'\n');
const read = path => normalized(readFileSync(join(root,path),'utf8'));
const json = value => `${JSON.stringify(value,null,2)}\n`;
const metadataPath = 'docs/xroga/security/schema-observation.json';

/** Conservative candidate discovery, not proof of scope/reachability from text matching. */
export function discoverPersistenceCalls(path,content) {
  const source=ts.createSourceFile(path,normalized(content),ts.ScriptTarget.Latest,true,path.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const calls=[];const adminNames=new Set(['getSupabaseAdmin','getTenantSupabaseAdmin','getGlobalSupabaseAdmin']);
  for(const statement of source.statements) if(ts.isImportDeclaration(statement)&&statement.importClause?.namedBindings&&ts.isNamedImports(statement.importClause.namedBindings)) {
    for(const binding of statement.importClause.namedBindings.elements) if(adminNames.has((binding.propertyName??binding.name).text)) adminNames.add(binding.name.text);
  }
  const literal=node=>node&&(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))?node.text:null;
  const visit=node=>{
    if(ts.isCallExpression(node)) {
      const property=ts.isPropertyAccessExpression(node.expression)?node.expression.name.text:null;
      const factory=ts.isIdentifier(node.expression)&&adminNames.has(node.expression.text);
      if(factory||property==='from'||property==='rpc') {
        let chain=node;
        while(chain.parent&&(ts.isPropertyAccessExpression(chain.parent)||ts.isCallExpression(chain.parent)))chain=chain.parent;
        let ownerPredicate=false;
        const inspect=child=>{if(ts.isCallExpression(child)&&ts.isPropertyAccessExpression(child.expression)&&child.expression.name.text==='eq'&&['user_id','projects.user_id','member_user_id'].includes(literal(child.arguments[0])))ownerPredicate=true;ts.forEachChild(child,inspect);};
        inspect(chain);
        let enclosing='<module>';
        for(let parent=node.parent;parent;parent=parent.parent) {if(ts.isFunctionDeclaration(parent)||ts.isMethodDeclaration(parent)){enclosing=parent.name?.getText(source)??'<anonymous>';break;}}
        const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
        const kind=factory?'PRIVILEGED_FACTORY':property==='rpc'?'RPC_CANDIDATE':'TABLE_OR_BUCKET_CANDIDATE';
        calls.push({id:hash(`${path}:${node.getStart(source)}:${node.end}:${kind}`).slice(0,20),path,line,enclosing,kind,target:factory?node.expression.getText(source):literal(node.arguments[0])??'<dynamic>',ownerPredicateCandidate:ownerPredicate,review:'REVIEW_REQUIRED',sourceSha256:hash(normalized(content))});
      }
    }
    ts.forEachChild(node,visit);
  };visit(source);return calls;
}

export function buildTenantAudit({admissionOverride,observationOverride}={}) {
  const observation=JSON.parse(read(metadataPath));
  const catalog=JSON.parse(read('docs/xroga/security/disposable-catalog-reference.json'));
  if(catalog.scope!=='DISPOSABLE_METADATA_NOT_PRODUCTION_PARITY'||!Array.isArray(catalog.additionalTables)
    ||!/^[a-f0-9]{40}$/.test(catalog.sourceSha)||!/^[a-f0-9]{64}$/.test(catalog.catalogSha256)
    ||catalog.customerRowsRead!==false||catalog.productionChanges!==false)throw new Error('Invalid disposable metadata provenance');
  if(observation.scope!=='READ_ONLY_SCHEMA_METADATA_NO_CUSTOMER_ROWS'||observation.securityCertification!=='NOT_CERTIFIED'||!observation.tables.length)throw new Error('Unapproved schema observation');
  const paths=execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(path=>/^(?:backend|frontend)\/src\/.*\.[jt]sx?$/.test(path)&&!/(?:\.test\.|\.spec\.|\.local\.integration\.|\/e2e\/|\/tests?\/)/.test(path));
  const candidates=paths.flatMap(path=>discoverPersistenceCalls(path,read(path)));
  const registryPath='docs/xroga/security/caller-reviews.json';
  const registry=JSON.parse(read(registryPath));
  const callers=applyCallerReviews(candidates,registry,path=>existsSync(join(root,path))?read(path):null);
  const tableNames=new Set(observation.tables.map(row=>`${row.schema}.${row.table_name}`));
  if(tableNames.size!==observation.tables.length)throw new Error('Duplicate schema table');
  const catalogNames=new Set(tableNames);
  for(const row of catalog.additionalTables){
    const name=`${row.schema}.${row.table_name}`;
    if(catalogNames.has(name)||!Array.isArray(row.columns)||!Array.isArray(row.constraints)||!Array.isArray(row.policies)||!Array.isArray(row.grants))throw new Error('Invalid additional disposable table');
    catalogNames.add(name);
  }
  const guard=ts.createSourceFile('serviceRoleGuard.ts',read('backend/src/security/serviceRoleGuard.ts'),ts.ScriptTarget.Latest,true);
  let exceptions=0;const registeredExceptions=new Map();
  const inspect=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(guard)==='globalServiceExceptions'&&ts.isCallExpression(node.initializer)&&ts.isObjectLiteralExpression(node.initializer.arguments[0])) {
    exceptions=node.initializer.arguments[0].properties.length;
    for(const property of node.initializer.arguments[0].properties)if(ts.isPropertyAssignment(property)&&ts.isCallExpression(property.initializer)&&ts.isObjectLiteralExpression(property.initializer.arguments[0])){
      const fields=Object.fromEntries(property.initializer.arguments[0].properties.filter(p=>ts.isPropertyAssignment(p)&&ts.isStringLiteral(p.initializer)).map(p=>[p.name.getText(guard),p.initializer.text]));
      registeredExceptions.set(property.name.getText(guard),fields);
    }
  }ts.forEachChild(node,inspect);};inspect(guard);
  if(!exceptions) throw new Error('Missing explicit global service exception registry');
  const outcomes=Object.fromEntries(['REVIEW_REQUIRED','SCOPED_BOUNDARY','NARROW_EXCEPTION','NOT_PERSISTENCE','REVIEWED_GAP'].map(value=>[value,callers.filter(row=>row.review===value).length]));
  const obligationPath='docs/xroga/security/tenant-invariant-obligations.json';
  const proofPath='docs/xroga/security/tenant-proof-observations.json';
  const admission=admissionOverride??(existsSync(join(root,obligationPath))?JSON.parse(read(obligationPath)):{version:1,sourceSha:observation.sourceSha??'0'.repeat(40),obligations:[],criteria:[],proofs:[]});
  const observed=observationOverride??(existsSync(join(root,proofPath))?JSON.parse(read(proofPath)):{receipts:[],exceptions:[]});
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(admissionOverride&&admissionOverride.sourceSha!==sourceSha)throw new Error('External acceptance snapshot does not match current HEAD');
  const approvedExceptions=(observed.exceptions??[]).filter(e=>{const actual=registeredExceptions.get(e.id);return actual&&actual.source===e.path
    &&Array.isArray(e.operations)&&e.operations.length&&e.operations.every(op=>actual.action.split('/').includes(op));});
  const closure=evaluateCallerClosure(callers,admission,{readAsset:path=>existsSync(join(root,path))?read(path):null,receipts:observed.receipts,exceptions:approvedExceptions,expectedSourceSha:sourceSha});
  const evaluated=closure.acceptance;
  const {callers:boundaryResults,...acceptance}=evaluated;
  const counts={observedTables:tableNames.size,rlsEnabled:observation.tables.filter(row=>row.rls_enabled).length,privilegedFactorySites:callers.filter(row=>row.kind==='PRIVILEGED_FACTORY').length,persistenceCandidates:callers.length,ownerPredicateCandidates:callers.filter(row=>row.ownerPredicateCandidate).length,reviewRequired:outcomes.REVIEW_REQUIRED,reviewedCandidates:callers.length-outcomes.REVIEW_REQUIRED,unresolvedSafetyCandidates:outcomes.REVIEW_REQUIRED+outcomes.REVIEWED_GAP,certifiedScopedPrivilegedCallers:evaluated.certifiedScopedPrivilegedCallers,registeredNarrowGlobalExceptions:exceptions};
  const report={version:'1.1',schemaObservationSha256:hash(read(metadataPath)),reviewRegistrySha256:hash(read(registryPath)),scope:'STATIC_CANDIDATES_AND_MANUAL_BOUNDARY_REVIEW_NOT_SECURITY_CERTIFICATION',releaseGate:evaluated.result==='PASS'?'PASS':'BLOCKED_CRITERION_EVIDENCE',counts,outcomes,acceptance,reviewAgreement:closure.counts,callers};
  const escape=value=>String(value??'none').replaceAll('|','/').replaceAll('\n',' ');
  const tableRows=observation.tables.map(row=>{
    const owners=row.columns.filter(column=>['user_id','tenant_id','owner_id','author_id','member_user_id'].includes(column.name)||(row.table_name==='profiles'&&column.name==='id'));
    const foreign=(row.constraints??[]).filter(item=>item.definition.startsWith('FOREIGN KEY')).map(item=>item.definition).join('; ');
    const policy=command=>(row.policies??[]).filter(item=>item.command===command||item.command==='*').map(item=>item.policy).join('; ')||'none (default deny if no other permissive policy)';
    return `| ${row.schema}.${row.table_name} | ${escape(owners.map(item=>`${item.name}${item.nullable?' nullable':''}`).join(', ')||'inherited/global — REVIEW REQUIRED')} | ${escape(foreign)} | ${row.rls_enabled?'enabled':'DISABLED'} | ${escape(policy('r'))} | ${escape(policy('a'))} | ${escape(policy('w'))} | ${escape(policy('d'))} |`;
  });
  const markdown=`# Tenant/RLS audit — incomplete security acceptance\n\nObserved schema only, ${observation.observedAt}, canonical project ${observation.projectRef}; no customer rows read, no DDL run. ${counts.observedTables}/${counts.rlsEnabled} tables have RLS enabled. Enabled is NOT proven isolation. JSON contains complete observed columns, nullable flags, FKs, policy USING/WITH CHECK and grants. Ownership classification below is a candidate, not an invented workspace model. Profiles have safe community public access and restricted column grants; do not remove it.\n\n## Caller review\n\n${counts.privilegedFactorySites} explicit privileged factory call sites; ${counts.persistenceCandidates} conservative table/storage/RPC/factory candidates; ${counts.ownerPredicateCandidates} contain a direct owner-filter candidate. None is automatically certified from syntax. Every candidate is recorded in privileged-callers.json with source hash, location and review-required state. Parent checks, injected clients, dynamic RPC/table targets, global/admin/background and frontend user-client calls need semantic review. Zero certified scope count means incomplete review, not that every existing query is vulnerable. One new narrow readiness exception exists in serviceRoleGuard.ts; other legacy administrative/bootstrap/webhook operations are NOT silently exempted. Production release remains BLOCKED.\n\n## Every observed table\n\nFor ALL rows: service-role/BYPASSRLS behavior is outside these user policies; require explicit server ownership or a registered reviewed narrow exception. Nullable owner/inherited-owner rows require isolated orphan/remediation audit; count UNKNOWN, never delete unknown rows. Tables with no policies may be intentionally server-only; do not create generic permissive policies to make them readable.\n\n| Table | Ownership keys / nullable risks | Foreign keys | RLS | SELECT | INSERT | UPDATE | DELETE |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${tableRows.join('\n')}\n\n## Rollout status\n\nMigration 20261013150357 adds only restrictive owner/container guards to ten inspected private tables, preserving existing operation grants/policies. It has NOT been applied to production. No NOT NULL/FK tightening/backfill or orphan deletion. Fresh complete migration history, upgrade fixtures, dedicated authenticated Supabase E2E and staged security checks remain mandatory. Loopback transport fixtures are not PostgreSQL/RLS proof. See tenant-model.md and Command 007 evidence.\n`;
  const reviewedMarkdown=markdown.replace('One new narrow readiness exception exists in serviceRoleGuard.ts; other legacy administrative/bootstrap/webhook operations are NOT silently exempted.',`${counts.registeredNarrowGlobalExceptions} explicitly named exceptions exist in serviceRoleGuard.ts: readiness, stale-run maintenance, leased-worker shutdown, platform model-health aggregates, opt-in/owner-verified share resolution and the three existing database-admin/owner-only platform diagnostic/readiness reads. The latter preserve broader admin authorization, NOT founder exclusivity. Names are not blanket certification or a constrained query proxy. Other legacy bootstrap/webhook operations and full payload redaction remain unresolved.`);
  const finalMarkdown=reviewedMarkdown.replace('Every candidate is recorded in privileged-callers.json with source hash, location and review-required state.',`Every candidate is recorded with a unique source-bound identity. ${counts.reviewedCandidates} have manual dispositions, ${counts.reviewRequired} await review and ${counts.unresolvedSafetyCandidates} remain unresolved including reviewed gaps. Categories: ${Object.entries(outcomes).map(([name,count])=>`${name}=${count}`).join(', ')}. Stale, duplicate, unknown or unsupported manual reviews fail the integrity check; evidence paths/markers must resolve. A scoped helper disposition is not proof of every upstream actor or overall acceptance.`);
  const additionalRows=catalog.additionalTables.map(row=>`| ${row.schema}.${row.table_name} | ${escape(row.columns.map(c=>`${c.name}:${c.type}${c.nullable?' nullable':''}`).join(', '))} | ${escape(row.constraints.map(c=>c.definition).join('; '))} | ${row.rls_enabled?'enabled':'DISABLED'} | ${escape(JSON.stringify(row.policies))} | ${escape(row.grants.map(g=>`${g.role}:${g.privilege}`).join(', '))} |`);
  const supplement=`\n## Additional disposable-catalog tables, not production parity\n\nSource ${catalog.sourceSha}, actual CI run${catalog.runId}, catalog SHA256 ${catalog.catalogSha256}. Complete additional metadata is retained in disposable-catalog-reference.json. Original observed counts above remain unchanged. ${escape(catalog.ownershipReview)}\n\n| Table | Columns and nullable fields | Constraints and parent keys | RLS | Policies | Grants |\n| --- | --- | --- | --- | --- | --- |\n${additionalRows.join('\n')}\n\nOriginal observed tables missing from that disposable installer: ${catalog.missingObservedTables.join(', ')}. They remain listed in the original audit above. No production presence, policy parity, orphan count or service-role certification is inferred.\n`;
  return new Map([['docs/xroga/security/privileged-callers.json',json(report)],['docs/xroga/security/rls-audit.md',finalMarkdown+supplement]]);
}

export function main(args=process.argv.slice(2)) {
  const external=args.includes('--evidence')||args.includes('--observations');
  if(external&&(!args.includes('--evidence')||!args.includes('--observations')||args.includes('--write')))throw new Error('Exact-source evidence and independent observations are both required; external proof must not overwrite canonical source');
  const externalJson=flag=>{const path=args[args.indexOf(flag)+1];if(!/^artifacts\/[a-zA-Z0-9_./-]+\.json$/.test(path??'')||path.split('/').includes('..'))throw new Error('External acceptance proof must be a local artifact JSON');return JSON.parse(read(path));};
  const overrides=external?{admissionOverride:externalJson('--evidence'),observationOverride:externalJson('--observations')}:{};
  if(external)authenticateObservedReceipts(overrides.observationOverride.receipts??[],overrides.admissionOverride.sourceSha);
  else if(args.includes('--require-complete')){
    const path='docs/xroga/security/tenant-proof-observations.json';
    const receipts=existsSync(join(root,path))?JSON.parse(read(path)).receipts??[]:[];
    authenticateObservedReceipts(receipts,execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim());
  }
  const outputs=buildTenantAudit(overrides);
  for(const[path,content]of outputs) {
    if(args.includes('--write')){mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),content);}
    else if(!external&&(!existsSync(join(root,path))||read(path)!==content))throw new Error(`Tenant audit drift: ${path}`);
  }
  const report=JSON.parse(outputs.get('docs/xroga/security/privileged-callers.json'));
  // Review completion alone is insufficient. All original criteria and their
  // independently observed source-bound proof must pass the computed gate.
  if(args.includes('--require-complete')&&(report.counts.unresolvedSafetyCandidates>0||report.releaseGate!=='PASS'))throw new Error('Tenant security acceptance BLOCKED: unresolved caller review and integration gates');
  console.log(JSON.stringify({result:'PASS_AUDIT_INTEGRITY_NOT_TENANT_SECURITY_ACCEPTANCE',counts:report.counts,releaseGate:report.releaseGate}));
}

/** Exact-source acceptance cannot trust a locally fabricated CI receipt. Normal
 * inventory checks need no network. External acceptance re-reads authenticated
 * GitHub metadata and logs, including LOCAL tests originally executed in CI. */
export function authenticateObservedReceipts(receipts,sourceSha,loadRun=runId=>{
  const gh=args=>execFileSync('gh',args,{cwd:root,encoding:'utf8',maxBuffer:30*1024*1024,stdio:['ignore','pipe','ignore']});
  return {metadata:JSON.parse(gh(['run','view',runId,'--json','headSha,status,conclusion'])),log:normalized(gh(['run','view',runId,'--log']))};
}) {
  const runs=new Map();
  for(const receipt of receipts){
    if(!/^\d+$/.test(receipt.runId??''))throw new Error('Independent CI run identity required');
    if(!runs.has(receipt.runId))runs.set(receipt.runId,loadRun(receipt.runId));
    const {metadata,log}=runs.get(receipt.runId);
    if(metadata.headSha!==sourceSha||metadata.status!=='completed'||metadata.conclusion!=='success'
      ||hash(log)!==receipt.artifactSha256||receipt.sourceSha!==sourceSha)throw new Error('CI observation does not match independently retrieved exact-source log');
    if(!Array.isArray(receipt.passedTests)||receipt.passedTests.some(name=>!log.split(/\r?\n/).some(line=>/\bok \d+ - /.test(line)&&line.endsWith(name))))throw new Error('Claimed test was not observed passing in CI');
  }
  return receipts;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
