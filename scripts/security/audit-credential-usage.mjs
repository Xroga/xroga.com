import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const ts = createRequire(import.meta.url)('typescript');
const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.replace(/\r\n/g, '\n');
const secretTables = /^(user_integrations|github_integrations|project_runtime_secrets|.*credential.*|.*oauth.*token.*)$/i;
const secretRpc = /(?:oauth|credential|secret|provider_key|supabase_bundle|github_connection|vercel_connection)/i;
const readFunctions = new Set(['getUserProviderKey', 'getGitHubToken', 'getGitHubTokenFromStorage', 'getVercelToken',
  'loadProviderToken', 'resolveProviderEnvForDeploy', 'readUserSupabaseBundle', 'getSecret', 'revealCredential']);
const rawField = /^(?:p_)?(?:access_token|refresh_token|api_key|apiKey|serviceRoleKey|password|secret|privateKey|verifier|encrypted_value)$/;

/** Conservative AST grouping, never a reachability or security certificate.
 * Only names/locations/hashes are returned, never credential expressions/values. */
export function discoverCredentialUsage(path, input) {
  const content = normalize(input), source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true,
    path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const declarations = new Map(), rows = [], vaultImports = [];
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const values = declarations.get(node.name.text) ?? []; values.push(node.initializer); declarations.set(node.name.text, values);
    }
    ts.forEachChild(node, collect);
  }; collect(source);
  const literal = (node, depth = 0) => {
    if (!node || depth > 3) return null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isIdentifier(node) && declarations.get(node.text)?.length === 1) return literal(declarations.get(node.text)[0], depth + 1);
    return null;
  };
  const owner = node => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isFunctionDeclaration(parent) || ts.isMethodDeclaration(parent)) return parent.name?.getText(source) ?? '<anonymous>';
      if (ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) {
        if (ts.isVariableDeclaration(parent.parent)) return parent.parent.name.getText(source);
      }
    }
    return '<module>';
  };
  const receiverTarget = node => {
    let current = node.expression;
    for (let depth = 0; current && depth < 30; depth++) {
      if (ts.isCallExpression(current)) {
        if (ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === 'from') return literal(current.arguments[0]) ?? '<dynamic>';
        current = current.expression;
      } else if (ts.isPropertyAccessExpression(current)) current = current.expression;
      else break;
    }
    return '<dynamic>';
  };
  const fields = node => {
    const found = new Set();
    const visit = child => {
      if (ts.isPropertyAssignment(child) && rawField.test(child.name.getText(source).replace(/^['"]|['"]$/g, ''))) found.add(child.name.getText(source).replace(/^['"]|['"]$/g, ''));
      ts.forEachChild(child, visit);
    }; for (const arg of node.arguments) visit(arg); return [...found].sort();
  };
  const record = (node, kind, target, method) => rows.push({
    id: hash(`${path}:${node.getStart(source)}:${kind}`).slice(0, 20), path,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    enclosing: owner(node), kind, target, method, fieldNames: fields(node),
    sourceSha256: hash(content), disposition: 'SOURCE_CANDIDATE_NOT_A_CONFIRMED_VULNERABILITY_OR_CUTOVER_PROOF',
  });
  const visit = node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && /credentialVault(?:\.js)?$/.test(node.moduleSpecifier.text) && path.startsWith('backend/')) vaultImports.push(path);
    if (ts.isCallExpression(node)) {
      const method = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : ts.isIdentifier(node.expression) ? node.expression.text : null;
      if (['insert', 'upsert', 'update'].includes(method)) {
        const target = receiverTarget(node); if (secretTables.test(target)) record(node, 'DATABASE_CREDENTIAL_WRITE_CANDIDATE', target, method);
      } else if (method === 'rpc') {
        const target = literal(node.arguments[0]) ?? '<dynamic>';
        if (secretRpc.test(target) || (target === '<dynamic>' && /integrations|credentials/.test(path))) {
          record(node, /^(save|store|begin|persist|set)_/.test(target) ? 'CREDENTIAL_RPC_WRITE_CANDIDATE' : 'CREDENTIAL_RPC_LIFECYCLE_CANDIDATE', target, method);
        }
      } else if (method === 'upload') {
        const target = receiverTarget(node);
        if (/token|secret|credential|vault/i.test(target) || /integrations\/.*(?:Auth|TokenStore|ProviderKeys|Pkce|credential)/i.test(path)) record(node, 'PRIVATE_OBJECT_CREDENTIAL_WRITE_CANDIDATE', target, method);
      } else if (method === 'setItem') {
        const target = literal(node.arguments[0]) ?? '<dynamic>';
        if (/vault|credential|secret|token|password/i.test(target)) record(node, 'BROWSER_CREDENTIAL_WRITE_CANDIDATE', target, method);
      } else if (readFunctions.has(method)) record(node, 'PRIVATE_CREDENTIAL_CONSUMER_CANDIDATE', method, method);
      else if (method === 'json' && fields(node).length && /\/routes\//.test(path)) record(node, 'POTENTIAL_PUBLIC_SECRET_PROJECTION', '<response>', method);
    }
    ts.forEachChild(node, visit);
  }; visit(source);
  return { rows, vaultImports };
}

export function buildCredentialAudit() {
  const paths = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/)
    .filter(path => /^(?:backend|frontend)\/src\/.*\.[jt]sx?$/.test(path)
      && !/(?:\.test\.|\.spec\.|\.local\.integration\.|\/e2e\/|\/tests?\/)/.test(path));
  assert.ok(paths.length > 0, 'An empty source tree is not credential cutover proof.');
  const parsed = paths.map(path => discoverCredentialUsage(path, readFileSync(resolve(root, path), 'utf8')));
  const rows = parsed.flatMap(value => value.rows).sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
  const groups = [...new Set(rows.map(row => row.path))].map(path => ({ path,
    sourceSha256: rows.find(row => row.path === path).sourceSha256,
    sites: rows.filter(row => row.path === path).map(row => row.id),
    state: 'FINITE_SOURCE_GROUP_REQUIRES_SEMANTIC_CUTOVER_EVIDENCE' }));
  return { version: 1, criterion: 'XB01-C009-AC11', scope: 'SOURCE_BOUND_CREDENTIAL_CANDIDATES_NOT_CREDENTIAL_SECURITY_ACCEPTANCE',
    acceptedPhaseTwoSource: 'a21a82029276d38d53c9e17c580a15f57b653fe3',
    sourceTreeDigest: hash(JSON.stringify(groups.map(group => [group.path, group.sourceSha256]))),
    counts: { candidates: rows.length, groups: groups.length, byKind: Object.fromEntries([...new Set(rows.map(row => row.kind))].map(kind => [kind, rows.filter(row => row.kind === kind).length])) },
    staticBackendVaultImporters: [...new Set(parsed.flatMap(value => value.vaultImports))].sort(), groups, rows,
    limitations: ['Static syntax is not runtime reachability or proof of plaintext.',
      'Policy preferences and account identifiers can be non-secret. Preserve candidates until their exact scope is reconciled.',
      'Dynamic aliases, computed response objects, indirect prompts and opaque external SDKs require semantic tracing.',
      'Canonical vault file presence or a nearby encrypt call never proves writer cutover.',
      'No source expressions, environment values, customer rows or credentials are emitted.'],
    productionChanges: false, phase3Accepted: false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = 'docs/xroga/security/credential-usage-audit.json', report = buildCredentialAudit(), content = JSON.stringify(report, null, 2) + '\n';
  if (process.argv.includes('--write')) writeFileSync(resolve(root, path), content);
  else assert.equal(normalize(readFileSync(resolve(root, path), 'utf8')), content, 'Credential source inventory drift. Reconcile actual changed callers, not acceptance criteria.');
  console.log(JSON.stringify({ result: 'PASS_CREDENTIAL_SOURCE_INVENTORY_NOT_SECURITY_ACCEPTANCE', ...report.counts, staticBackendVaultImporters: report.staticBackendVaultImporters.length }));
}
