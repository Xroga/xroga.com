import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from '../ci/toolchain.mjs';
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
        calls.push({id:hash(`${path}:${line}:${node.pos}`).slice(0,20),path,line,enclosing,kind:factory?'PRIVILEGED_FACTORY':property==='rpc'?'RPC_CANDIDATE':'TABLE_OR_BUCKET_CANDIDATE',target:factory?node.expression.getText(source):literal(node.arguments[0])??'<dynamic>',ownerPredicateCandidate:ownerPredicate,review:'REVIEW_REQUIRED',sourceSha256:hash(normalized(content))});
      }
    }
    ts.forEachChild(node,visit);
  };visit(source);return calls;
}

export function buildTenantAudit() {
  const observation=JSON.parse(read(metadataPath));
  if(observation.scope!=='READ_ONLY_SCHEMA_METADATA_NO_CUSTOMER_ROWS'||observation.securityCertification!=='NOT_CERTIFIED'||!observation.tables.length)throw new Error('Unapproved schema observation');
  const paths=execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(path=>/^(?:backend|frontend)\/src\/.*\.[jt]sx?$/.test(path)&&!/(?:\.test\.|\.spec\.|\.local\.integration\.|\/e2e\/|\/tests?\/)/.test(path));
  const callers=paths.flatMap(path=>discoverPersistenceCalls(path,read(path)));
  const tableNames=new Set(observation.tables.map(row=>`${row.schema}.${row.table_name}`));
  if(tableNames.size!==observation.tables.length)throw new Error('Duplicate schema table');
  const guard=ts.createSourceFile('serviceRoleGuard.ts',read('backend/src/security/serviceRoleGuard.ts'),ts.ScriptTarget.Latest,true);
  let exceptions=0;
  const inspect=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(guard)==='globalServiceExceptions'&&ts.isCallExpression(node.initializer)&&ts.isObjectLiteralExpression(node.initializer.arguments[0])) exceptions=node.initializer.arguments[0].properties.length;ts.forEachChild(node,inspect);};inspect(guard);
  if(!exceptions) throw new Error('Missing explicit global service exception registry');
  const counts={observedTables:tableNames.size,rlsEnabled:observation.tables.filter(row=>row.rls_enabled).length,privilegedFactorySites:callers.filter(row=>row.kind==='PRIVILEGED_FACTORY').length,persistenceCandidates:callers.length,ownerPredicateCandidates:callers.filter(row=>row.ownerPredicateCandidate).length,reviewRequired:callers.length,certifiedScopedPrivilegedCallers:0,registeredNarrowGlobalExceptions:exceptions};
  const report={version:'1.0',schemaObservationSha256:hash(read(metadataPath)),scope:'STATIC_CANDIDATES_NOT_SECURITY_CERTIFICATION',releaseGate:'BLOCKED_INCOMPLETE_CALLER_REVIEW_AND_ISOLATED_STAGING_PROOF',counts,callers};
  const escape=value=>String(value??'none').replaceAll('|','/').replaceAll('\n',' ');
  const tableRows=observation.tables.map(row=>{
    const owners=row.columns.filter(column=>['user_id','tenant_id','owner_id','author_id','member_user_id'].includes(column.name)||(row.table_name==='profiles'&&column.name==='id'));
    const foreign=(row.constraints??[]).filter(item=>item.definition.startsWith('FOREIGN KEY')).map(item=>item.definition).join('; ');
    const policy=command=>(row.policies??[]).filter(item=>item.command===command||item.command==='*').map(item=>item.policy).join('; ')||'none (default deny if no other permissive policy)';
    return `| ${row.schema}.${row.table_name} | ${escape(owners.map(item=>`${item.name}${item.nullable?' nullable':''}`).join(', ')||'inherited/global — REVIEW REQUIRED')} | ${escape(foreign)} | ${row.rls_enabled?'enabled':'DISABLED'} | ${escape(policy('r'))} | ${escape(policy('a'))} | ${escape(policy('w'))} | ${escape(policy('d'))} |`;
  });
  const markdown=`# Tenant/RLS audit — incomplete security acceptance\n\nObserved schema only, ${observation.observedAt}, canonical project ${observation.projectRef}; no customer rows read, no DDL run. ${counts.observedTables}/${counts.rlsEnabled} tables have RLS enabled. Enabled is NOT proven isolation. JSON contains complete observed columns, nullable flags, FKs, policy USING/WITH CHECK and grants. Ownership classification below is a candidate, not an invented workspace model. Profiles have safe community public access and restricted column grants; do not remove it.\n\n## Caller review\n\n${counts.privilegedFactorySites} explicit privileged factory call sites; ${counts.persistenceCandidates} conservative table/storage/RPC/factory candidates; ${counts.ownerPredicateCandidates} contain a direct owner-filter candidate. None is automatically certified from syntax. Every candidate is recorded in privileged-callers.json with source hash, location and review-required state. Parent checks, injected clients, dynamic RPC/table targets, global/admin/background and frontend user-client calls need semantic review. Zero certified scope count means incomplete review, not that every existing query is vulnerable. One new narrow readiness exception exists in serviceRoleGuard.ts; other legacy administrative/bootstrap/webhook operations are NOT silently exempted. Production release remains BLOCKED.\n\n## Every observed table\n\nFor ALL rows: service-role/BYPASSRLS behavior is outside these user policies; require explicit server ownership or a registered reviewed narrow exception. Nullable owner/inherited-owner rows require isolated orphan/remediation audit; count UNKNOWN, never delete unknown rows. Tables with no policies may be intentionally server-only; do not create generic permissive policies to make them readable.\n\n| Table | Ownership keys / nullable risks | Foreign keys | RLS | SELECT | INSERT | UPDATE | DELETE |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${tableRows.join('\n')}\n\n## Rollout status\n\nMigration 20261013150357 adds only restrictive owner/container guards to ten inspected private tables, preserving existing operation grants/policies. It has NOT been applied to production. No NOT NULL/FK tightening/backfill or orphan deletion. Fresh complete migration history, upgrade fixtures, dedicated authenticated Supabase E2E and staged security checks remain mandatory. Loopback transport fixtures are not PostgreSQL/RLS proof. See tenant-model.md and Command 007 evidence.\n`;
  const reviewedMarkdown=markdown.replace('One new narrow readiness exception exists in serviceRoleGuard.ts; other legacy administrative/bootstrap/webhook operations are NOT silently exempted.',`${counts.registeredNarrowGlobalExceptions} explicitly named exceptions exist in serviceRoleGuard.ts: readiness, stale-run maintenance, leased-worker shutdown, platform model-health aggregates and opt-in/owner-verified share resolution. Names are not blanket certification or a constrained query proxy. Other legacy administrative/bootstrap/webhook operations remain unresolved.`);
  return new Map([['docs/xroga/security/privileged-callers.json',json(report)],['docs/xroga/security/rls-audit.md',reviewedMarkdown]]);
}

export function main(args=process.argv.slice(2)) {
  const outputs=buildTenantAudit();
  for(const[path,content]of outputs) {
    if(args.includes('--write')){mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),content);}
    else if(!existsSync(join(root,path))||read(path)!==content)throw new Error(`Tenant audit drift: ${path}`);
  }
  const report=JSON.parse(outputs.get('docs/xroga/security/privileged-callers.json'));
  if(args.includes('--require-complete')&&report.counts.reviewRequired>0)throw new Error('Tenant security acceptance BLOCKED: unresolved caller review and integration gates');
  console.log(JSON.stringify({result:'PASS_AUDIT_INTEGRITY_NOT_TENANT_SECURITY_ACCEPTANCE',counts:report.counts,releaseGate:report.releaseGate}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
