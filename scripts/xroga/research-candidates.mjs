import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const candidates = [
  ['Activepieces', 'activepieces/activepieces', 'Work-pack/automation contract reference; review community versus enterprise rights', '005'],
  ['Playwright', 'microsoft/playwright', 'Existing browser testing and isolated browser acceptance', '005'],
  ['Expo EAS CLI', 'expo/eas-cli', 'Existing mobile publishing adapter acceptance', '005'],
  ['Fastlane', 'fastlane/fastlane', 'Later native publishing adapter reference', '005'],
  ['Iconify', 'iconify/iconify', 'Later response icon system; icon-set rights remain separate', 'LATER_PENDING_HISTORICAL_EXPORT'],
  ['json-render', 'vercel-labs/json-render', 'Later controlled structured UI adapter reference', 'LATER_PENDING_HISTORICAL_EXPORT'],
  ['assistant-ui/tool-ui', 'assistant-ui/tool-ui', 'Receipt/UI reference; maintenance and archival review required', 'LATER_PENDING_HISTORICAL_EXPORT'],
  ['LLMCompiler', 'SqueezeAILab/LLMCompiler', 'Later parallel planning comparison; preserve existing execution', 'LATER_PENDING_HISTORICAL_EXPORT'],
  ['AppWorld', 'stonybrooknlp/appworld', 'Evaluation ideas; bundled asset licenses separately reviewed', '005'],
  ['MCPMark', 'eval-sys/mcpmark', 'MCP evaluation contract reference', '005'],
  ['Schemathesis', 'schemathesis/schemathesis', 'Later API schema/property testing', '003'],
  ['Pact JS', 'pact-foundation/pact-js', 'Provider/consumer contracts; verify license before adoption', '003'],
  ['Testcontainers', 'testcontainers/testcontainers-node', 'Disposable integration dependencies if current tests benefit', '003'],
  ['Toxiproxy', 'Shopify/toxiproxy', 'Deterministic resilience/network failure references', '003'],
  ['Uppy', 'transloadit/uppy', 'Later upload UX reference', 'LATER_PENDING_HISTORICAL_EXPORT'],
  ['Motion', 'motiondivision/motion', 'Existing frontend animation dependency; retain current pinned lockfile', 'LATER_PENDING_HISTORICAL_EXPORT'],
  ['Monaco Editor', 'microsoft/monaco-editor', 'Later code workspace reference; avoid duplicate editor stacks', 'LATER_PENDING_HISTORICAL_EXPORT'],
  ['MapLibre GL JS', 'maplibre/maplibre-gl-js', 'Later maps/location results reference', 'LATER_PENDING_HISTORICAL_EXPORT'],
  ['OpenFGA', 'openfga/openfga', 'Relationship/account authorization reference', '007'],
  ['Open Policy Agent', 'open-policy-agent/opa', 'Deterministic policy reference; do not install a competing policy engine by default', '008'],
  ['ToolHive', 'stacklok/toolhive', 'Tool isolation and execution-security reference', '010'],
  ['Snyk Agent Scan', 'snyk/agent-scan', 'Agent/tool metadata scanning reference; no external source upload by default', '010'],
  ['Trivy', 'aquasecurity/trivy', 'Container/dependency/misconfiguration/secret scanning candidate', '010'],
];

export function collectCandidates(names = []) {
  return candidates.filter(([name]) => !names.length || names.includes(name)).map(([name, repository, purpose, owner]) => {
    const base = { name, repository, url: `https://github.com/${repository}`, purpose, owner, decision: 'REFERENCE_ONLY',
      integrationSurface: owner === 'LATER_PENDING_HISTORICAL_EXPORT' ? 'Later frontend/runtime adapter; owner deferred' : `Batch One Command ${owner} reference`,
      buildVsBuy: 'Preserve existing Xroga subsystem; justify any future integration with acceptance evidence',
      dependencyRisk: 'No new runtime dependency introduced; license/transitive dependencies require review before adoption',
      observedAtUtc: new Date().toISOString() };
    try {
      const metadata = JSON.parse(execFileSync('gh', ['api', `repos/${repository}`], { encoding: 'utf8', timeout: 30000 }));
      const commit = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/commits/${metadata.default_branch}`, '--jq', '{sha:.sha}'], { encoding: 'utf8', timeout: 30000 }));
      let license;
      try { license = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/license?ref=${commit.sha}`], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] })); } catch { license = null; }
      return { ...base, verification: 'PRIMARY_GITHUB_METADATA', commit: commit.sha, archived: metadata.archived,
        license: license?.license?.spdx_id ?? metadata.license?.spdx_id ?? 'UNVERIFIED',
        licensePath: license?.path ?? null, licenseBlobSha: license?.sha ?? null,
        licenseUrl: license ? `https://github.com/${repository}/blob/${commit.sha}/${license.path}` : null,
        maintenanceStatus: metadata.archived ? 'ARCHIVED_REFERENCE_ONLY' : 'NOT_ARCHIVED; maintenance quality requires separate review',
        pushedAt: metadata.pushed_at, metadataSha256: createHash('sha256').update(JSON.stringify({ repository, commit: commit.sha, archived: metadata.archived, license: license?.license?.spdx_id, licenseBlobSha: license?.sha })).digest('hex') };
    } catch {
      return { ...base, verification: 'METADATA_UNAVAILABLE', commit: null, archived: null, license: 'UNVERIFIED', licensePath: null,
        licenseBlobSha: null, licenseUrl: null, maintenanceStatus: 'UNKNOWN_PENDING_PRIMARY_EVIDENCE', pushedAt: null, metadataSha256: null };
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/xroga/research/repository-candidates.json');
  mkdirSync(dirname(target), { recursive: true });
  const previous = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : [];
  const collected = collectCandidates(process.argv.slice(2));
  const results = candidates.map(([name]) => collected.find(item => item.name === name) ?? previous.find(item => item.name === name));
  if (results.some(item => !item)) throw new Error('Candidate metadata collection incomplete');
  writeFileSync(target, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({ candidates: results.length, primaryMetadata: results.filter(item => item.verification === 'PRIMARY_GITHUB_METADATA').length,
    unavailable: results.filter(item => item.verification !== 'PRIMARY_GITHUB_METADATA').map(item => item.name), adopted: 0 }));
}
