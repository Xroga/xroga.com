import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './toolchain.mjs';

const ts = createRequire(import.meta.url)('typescript');
export function analyzeTestSkips(path, content) {
  const source = ts.createSourceFile(path, content.replace(/\r\n/g, '\n'), ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [];
  const titleFor = node => {
    for (let current = node; current; current = current.parent) {
      if (ts.isCallExpression(current) && /^(?:test|it|describe)(?:\.\w+)?$/.test(current.expression.getText(source))) {
        const first = current.arguments[0];
        return first && ts.isStringLiteral(first) ? first.text : first?.getText(source).slice(0, 200) ?? '<unnamed>';
      }
    }
    return '<runtime-context-skip>';
  };
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      let kind = /\.(?:only)$|^(?:fit|fdescribe)$/.test(callee) ? 'FOCUSED' : /\.(?:skip|todo)$|^(?:xit|xdescribe)$/.test(callee) ? 'SKIPPED' : null;
      let condition = kind ? (node.arguments[0]?.getText(source).slice(0, 240) ?? '') : '';
      if (/^(?:test|it|describe)$/.test(callee)) {
        const options = node.arguments[1];
        const skip = options && ts.isObjectLiteralExpression(options) ? options.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === 'skip') : null;
        if (skip && skip.initializer.getText(source) !== 'false') { kind = 'SKIPPED'; condition = skip.initializer.getText(source); }
      }
      if (kind) {
        const title = titleFor(node);
        const id = createHash('sha256').update(`${path}:${kind}:${callee}:${title}:${condition}`).digest('hex');
        findings.push({ id, path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind, title, condition });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}
export function validateSkips(findings, registry, today = new Date().toISOString().slice(0, 10)) {
  const ids = new Set();
  for (const record of registry.entries ?? []) {
    if (ids.has(record.id)) throw new Error('Duplicate known-skip entry');
    ids.add(record.id);
    if (!record.owner || !record.reason || !record.issue_or_command || !record.review_date) throw new Error('Known skip lacks owner/reason/issue/review date');
    if (record.review_date < today) throw new Error(`Known skip review expired: ${record.path}`);
  }
  for (const finding of findings) {
    if (finding.kind === 'FOCUSED') throw new Error(`Focused test is forbidden: ${finding.path}:${finding.line}`);
    const entry = (registry.entries ?? []).find(record => record.id === finding.id && record.path === finding.path);
    if (!entry) throw new Error(`Unregistered skipped test: ${finding.path}:${finding.line}`);
  }
  for (const entry of registry.entries ?? []) if (!findings.some(finding => finding.id === entry.id)) throw new Error(`Stale known-skip entry: ${entry.path}`);
  return { registeredSkips: findings.length, focusedTests: 0 };
}
export function discoverSkips(repositoryRoot = root) {
  const files = execFileSync('git', ['ls-files'], { cwd: repositoryRoot, encoding: 'utf8' }).trim().split(/\r?\n/)
    .filter(path => /(?:\.test\.|\.spec\.)[cm]?[jt]sx?$/.test(path));
  return files.flatMap(path => analyzeTestSkips(path, readFileSync(join(repositoryRoot, path), 'utf8')));
}
export function main() {
  const registryPath = join(root, 'tests/ci/known-skips.json');
  if (!existsSync(registryPath)) throw new Error('Known-skip registry is missing; inspect each existing skip before registering it');
  const result = validateSkips(discoverSkips(), JSON.parse(readFileSync(registryPath, 'utf8')));
  console.log(JSON.stringify({ result: 'PASS_SKIP_GOVERNANCE', ...result }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
