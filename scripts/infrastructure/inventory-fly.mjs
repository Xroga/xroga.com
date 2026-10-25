import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Report paths and line numbers only. Never echo configuration or secret values.
// Historical references remain evidence, not operational migration exemptions.
const indicators = [
  ['fly_domain', /\b(?:[\w-]+\.)*(?:fly\.io|fly\.dev|flycast)\b/i],
  ['fly_environment', /\b(?:FLY_[A-Z0-9_]+|XROGA_[A-Z0-9_]*FLY[A-Z0-9_]*)\b/],
  ['fly_runtime', /\b(?:Fly(?=[A-Z])|fly(?=[A-Z])|flyctl\b|fly_launch_runtime\b)/],
  ['fly_command_or_documentation', /\bfly(?:\.io)?\b/i],
  ['fly_private_dns', /\.vm\.\$?\{?\w*.*\.internal/],
];

export function classifyFlyPath(path) {
  if (/^docs\/xroga\/(?:evidence|research-archive)\//.test(path)) return 'preserved_evidence';
  if (/(?:\.test\.[cm]?[jt]s$|\.spec\.[jt]s$|\.integration\.ts$|(?:^|\/)e2e\/)/.test(path)) return 'test';
  if (/^(?:backend|frontend)\/src\//.test(path)) return 'runtime';
  if (/^\.github\/workflows\//.test(path)) return 'deployment';
  if (/^scripts\//.test(path)) return 'operational_script';
  if (/\.md$/.test(path)) return 'documentation';
  return 'configuration_or_asset';
}

export function inspectFlyReferences(path, content) {
  if (content.includes('\0')) return null;
  const lines = content.split(/\r?\n/);
  const references = [];
  for (let index = 0; index < lines.length; index++) {
    const kinds = indicators.filter(([, expression]) => expression.test(lines[index])).map(([kind]) => kind);
    if (kinds.length) references.push({ line: index + 1, kinds });
  }
  const flyNamedPath = /(?:^|[\/_-])fly|fly(?=[A-Z])|flyctl/i.test(path);
  if (!references.length && !flyNamedPath) return null;
  return { path, category: classifyFlyPath(path), flyNamedPath, references };
}

export function inventoryFly(root = process.cwd()) {
  const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean);
  const entries = paths.map(path => inspectFlyReferences(path, readFileSync(resolve(root, path), 'utf8'))).filter(Boolean);
  const counts = Object.fromEntries([...new Set(entries.map(entry => entry.category))]
    .sort().map(category => [category, entries.filter(entry => entry.category === category).length]));
  return { schemaVersion: 1, sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
    scope: 'tracked repository files, working content at sourceSha plus current diff',
    containsSecretValues: false, counts, entries };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inventoryFly();
  console.log(JSON.stringify(result, null, 2));
  // This inventory cannot establish live infrastructure independence on its own.
  if (process.argv.includes('--require-zero-active') && result.entries.some(entry =>
    ['runtime', 'deployment', 'operational_script', 'configuration_or_asset'].includes(entry.category))) process.exitCode = 1;
}
