import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../ci/toolchain.mjs';

const ts = createRequire(import.meta.url)('typescript');
const envName = value => /^(?:[A-Z][A-Z0-9]*_)+[A-Z0-9_]+$/.test(value) || ['PORT', 'CI', 'HOME', 'PATH', 'USERPROFILE', 'TEMP', 'TMP'].includes(value);
const literal = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
const sorted = values => [...new Set(values)].sort();

export function discoverRuntimeSource(path, content) {
  const source = ts.createSourceFile(path, content.replace(/\r\n/g, '\n'), ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const aliases = new Set(['process.env', 'import.meta.env']), constants = new Map(), readers = [], dynamic = [], declarations = [], hosts = [], fallbackCandidates = [];
  const secretHelpers = new Set(path.endsWith('/config/envSecrets.ts') ? ['getSecret', 'hasSecret'] : []);
  if (path.endsWith('/lib/platformReady.ts')) secretHelpers.add('has');
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && /envSecrets/.test(literal(statement.moduleSpecifier) ?? '')) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
        if (['getSecret', 'hasSecret'].includes((binding.propertyName ?? binding.name).text)) secretHelpers.add(binding.name.text);
      }
    }
  }
  const line = node => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const environmentObject = node => {
    if (!node) return false;
    if (aliases.has(node.getText(source))) return true;
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) return environmentObject(node.expression);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) return environmentObject(node.left) || environmentObject(node.right);
    return false;
  };
  const visit = node => {
    const scoped = ts.isFunctionLike(node) || ts.isBlock(node) || ts.isCatchClause(node);
    const outerAliases = scoped ? new Set(aliases) : null, outerConstants = scoped ? new Map(constants) : null;
    if (ts.isFunctionLike(node)) for (const parameter of node.parameters ?? []) if (ts.isIdentifier(parameter.name)) {
      aliases.delete(parameter.name.text); constants.delete(parameter.name.text);
    }
    if (ts.isParameter(node) && ts.isIdentifier(node.name) &&
      (node.initializer && aliases.has(node.initializer.getText(source)) || node.type && ts.isTypeReferenceNode(node.type) && /^(?:NodeJS\.)?ProcessEnv$/.test(node.type.typeName.getText(source)))) aliases.add(node.name.text);
    if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name) && node.initializer) {
        const value = literal(node.initializer); if (value !== null) constants.set(node.name.text, value); else constants.delete(node.name.text);
        if (environmentObject(node.initializer)) aliases.add(node.name.text);
        else aliases.delete(node.name.text);
      }
      if (path.endsWith('/config/envSecrets.ts') && ts.isIdentifier(node.name) && node.name.text === 'ALIASES' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        for (const property of node.initializer.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isArrayLiteralExpression(property.initializer)) continue;
          for (const element of property.initializer.elements) if (literal(element)) readers.push({ name: literal(element), path, line: line(element), mechanism: 'DECLARED_SECRET_ALIAS' });
        }
      }
      if (ts.isObjectBindingPattern(node.name) && node.initializer && aliases.has(node.initializer.getText(source))) {
        for (const element of node.name.elements) {
          const name = (element.propertyName ?? element.name).getText(source).replace(/^['"]|['"]$/g, '');
          if (envName(name)) readers.push({ name, path, line: line(element), mechanism: 'DESTRUCTURED_ENV_READER' });
        }
      }
    }
    if (ts.isPropertyAccessExpression(node) && aliases.has(node.expression.getText(source))) {
      readers.push({ name: node.name.text, path, line: line(node), mechanism: 'STATIC_ENV_READER' });
    }
    if (ts.isElementAccessExpression(node) && aliases.has(node.expression.getText(source))) {
      const name = literal(node.argumentExpression) ?? (ts.isIdentifier(node.argumentExpression) ? constants.get(node.argumentExpression.text) : null);
      if (name && envName(name)) readers.push({ name, path, line: line(node), mechanism: 'RESOLVED_ENV_INDEX' });
      else dynamic.push({ path, line: line(node), expression: node.argumentExpression?.getText(source).slice(0, 100) ?? '<missing>', status: 'REQUIRES_BINDING_REVIEW' });
    }
    if (ts.isCallExpression(node) && secretHelpers.has(node.expression.getText(source))) {
      const name = literal(node.arguments[0]);
      if (name) readers.push({ name, path, line: line(node), mechanism: 'SECRET_HELPER_CALL' });
      else dynamic.push({ path, line: line(node), expression: node.arguments[0]?.getText(source).slice(0, 100) ?? '<missing>', status: 'REQUIRES_BINDING_REVIEW' });
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) {
      if (envName(node.text) && node.text.includes('_')) declarations.push({ name: node.text, path, line: line(node), mechanism: 'LITERAL_KEY_CANDIDATE_REQUIRES_REVIEW' });
      if (/^https?:\/\//.test(node.text)) {
        try { const url = new URL(node.text); hosts.push({ hostname: url.hostname, protocol: url.protocol, path, line: line(node), credentialsInUrl: Boolean(url.username || url.password) }); } catch { /* Dynamic URL needs call-site review. */ }
      }
    }
    if ((ts.isNewExpression(node) && ['Map', 'Set'].includes(node.expression.getText(source))) ||
      (ts.isCallExpression(node) && /(?:writeFile|writeFileSync|mkdtemp|mkdir|mkdirSync|saveLocalMedia)$/.test(node.expression.getText(source)))) {
      let scope = 'MODULE_LIFETIME';
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isFunctionLike(parent)) { scope = 'FUNCTION_LOCAL'; break; }
        if (ts.isPropertyDeclaration(parent)) { scope = 'INSTANCE_LIFETIME'; break; }
      }
      fallbackCandidates.push({ path, line: line(node), scope, mechanism: ts.isNewExpression(node) ? 'PROCESS_MEMORY_CANDIDATE' : 'FILESYSTEM_WRITE_CANDIDATE', status: 'REQUIRES_SEMANTIC_REVIEW' });
    }
    ts.forEachChild(node, visit);
    if (outerAliases) { aliases.clear(); for (const alias of outerAliases) aliases.add(alias); }
    if (outerConstants) { constants.clear(); for (const [name, value] of outerConstants) constants.set(name, value); }
  };
  visit(source);
  return { readers, dynamic, declarations, hosts, fallbackCandidates };
}
export function discoverRuntime() {
  const paths = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/)
    .filter(path => /^(?:backend|frontend)\/src\//.test(path) && /\.[cm]?[jt]sx?$/.test(path) && !/(?:\.test\.|\.spec\.|\/__fixtures__\/|\/e2e\/)/.test(path));
  const findings = paths.map(path => discoverRuntimeSource(path, readFileSync(join(root, path), 'utf8')));
  return { sourcePaths: paths, readers: findings.flatMap(item => item.readers), dynamic: findings.flatMap(item => item.dynamic),
    declarations: findings.flatMap(item => item.declarations), hosts: findings.flatMap(item => item.hosts),
    fallbackCandidates: findings.flatMap(item => item.fallbackCandidates), envNames: sorted(findings.flatMap(item => item.readers.map(reader => reader.name))) };
}
if (process.argv[1]?.endsWith('runtime-discovery.mjs')) {
  const discovery = discoverRuntime();
  console.log(JSON.stringify({ sourceFiles: discovery.sourcePaths.length, envNames: discovery.envNames, dynamic: discovery.dynamic,
    literalKeyCandidates: sorted(discovery.declarations.map(item => item.name)).filter(name => !discovery.envNames.includes(name)),
    externalHosts: sorted(discovery.hosts.map(item => item.hostname)), fallbackCandidates: discovery.fallbackCandidates.length }, null, 2));
}
