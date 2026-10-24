/** Read-only npm advisory inventory. Severity is not a runtime-exposure waiver. */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, npmCli } from '../ci/toolchain.mjs';

export function summarizeAudit(audit, lock) {
  if (audit.auditReportVersion !== 2 || !audit.metadata?.vulnerabilities || !audit.vulnerabilities) throw new Error('Missing actual npm audit evidence');
  return { counts: audit.metadata.vulnerabilities, findings: Object.entries(audit.vulnerabilities).map(([name, finding]) => ({
    name, severity: finding.severity, direct: finding.isDirect, affectedRange: finding.range,
    installed: finding.nodes.map(path => ({ path, version: lock.packages[path]?.version ?? 'UNRESOLVED_LOCK_PATH' })),
    via: finding.via.map(item => typeof item === 'string' ? { dependency: item } : { title: item.title, url: item.url, severity: item.severity, range: item.range }),
    effects: finding.effects, fixAvailable: finding.fixAvailable,
    exposure: 'REQUIRES_SEMANTIC_RUNTIME_REVIEW_NOT_WAIVED',
  })).sort((a,b) => a.name.localeCompare(b.name)) };
}

export function collectAdvisories() {
  const graphs = [];
  for (const [scope, directory] of [['workspace-aggregate', ''], ['frontend-standalone', 'frontend'], ['backend-standalone', 'backend']]) {
    const lockBytes = readFileSync(resolve(root, directory, 'package-lock.json'));
    const args = [npmCli(), 'audit', '--json', ...(directory ? ['--workspaces=false'] : [])];
    const result = spawnSync(process.execPath, args, { cwd: resolve(root, directory), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180_000 });
    if (result.error || ![0,1].includes(result.status)) throw new Error(`Audit execution failed: ${scope}`);
    const audit = JSON.parse(result.stdout);
    if (audit.error) throw new Error(`Audit service failure: ${scope}`);
    graphs.push({ scope, command: `npm audit --json${directory ? ' --workspaces=false' : ''}`, cwd: directory || '.', exitCode: result.status,
      lockSha256: createHash('sha256').update(lockBytes.toString('utf8').replace(/\r\n/g,'\n')).digest('hex'),
      ...summarizeAudit(audit, JSON.parse(lockBytes)) });
  }
  return { version: 1, observedAt: new Date().toISOString(), result: 'ADVISORY_INVENTORY_NOT_RELEASE_APPROVAL', graphs };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = collectAdvisories();
  if (process.argv.includes('--write')) writeFileSync(resolve(root, 'docs/xroga/security/dependency-advisories.json'), `${JSON.stringify(report,null,2)}\n`);
  console.log(JSON.stringify(report.graphs.map(({scope,counts}) => ({scope,counts}))));
}
