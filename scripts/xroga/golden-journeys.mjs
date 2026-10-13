import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { root } from '../ci/toolchain.mjs';
import { fixtureContracts } from '../../tests/golden/fixtures/fixtures.mjs';
import { goldenJsonSchema, validateGoldenMatrix } from './golden-schema.mjs';
export function outputs({sourceSha} = {}) {
  const matrix = {version: '1.0', sourceSha: sourceSha ?? execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),scope:'ACCEPTANCE_CONTRACTS_NOT_PRODUCT_COMPLETION',journeys: fixtureContracts};
  const ledger = JSON.parse(readFileSync(join(root,'docs/xroga/requirements-ledger.json'),'utf8'));
  validateGoldenMatrix(matrix,new Set(ledger.requirements.map(row=>row.requirement_id)),path=>existsSync(join(root,path)));
  const json = value => JSON.stringify(value,null,2)+'\n';
  return new Map([
    ['docs/xroga/golden-journey-matrix.json',json(matrix)],['docs/xroga/golden-journey-matrix.schema.json',json(goldenJsonSchema)],
    ['tests/golden/fixtures/goals.json',json(fixtureContracts.map(({id,fixtureId,goal})=>({id,fixtureId,goal})))],
    ['docs/xroga/golden-journeys.md',`# Golden journey acceptance contracts\n\nSource SHA: \`${matrix.sourceSha}\`. Twelve stable contracts; **zero live journeys certified**. A passing stub/component test is not a passing authenticated, provider-backed user journey.\n\n| Journey | State | Missing evidence/capability |\n| --- | --- | --- |\n${matrix.journeys.map(row=>`| ${row.id} | ${row.state} | ${row.blockers[0].missingCapability} |`).join('\n')}\n\nThe JSON is canonical and declares actor, connections, graph, authority, budget, durability, provider isolation, verification, events/blocks, timeout/retry, cleanup and positive/negative assertions. Unavailable historical mission ownership remains explicitly deferred, not invented.\n\nExisting Node/tsx and frontend Playwright infrastructure are extended, not replaced. Deterministic transport stubs test actual action/session/SSE/rendering/recovery boundaries. All external fetches in action fixtures are intercepted in-process and reject unknown hosts/paths. Browser fixtures run only against loopback, with external browser requests blocked. Authenticated-browser testing stays BLOCKED_PENDING_TEST_CONFIGURATION and needs an approved isolated frontend auth realm.\n\nTier 1: PR-safe fixture/component/browser suite. Tier 2: approved provider sandbox with namespaced resources and cleanup; unavailable credentials/capabilities remain blocked, never passing. Tier 3: existing \`launch-production-verification.yml\` read-only release smoke; no service-role users or paid actions. No customer email, charge, publishing, Git write or durable production upload occurs in this harness. Existing independent security tests are retained.\n\nPrimary repository references/license metadata: \`docs/xroga/repository-candidate-register.md\` (Playwright Apache-2.0, AppWorld/MCPMark/Expo/Fastlane/Activepieces individually recorded). Evaluation ideas only; no dataset, code or runtime from these projects is newly adopted.\n`],
  ]);
}
export function main() {for(const[path,content]of outputs()){mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),content);} console.log('GENERATED_GOLDEN_CONTRACTS_NOT_LIVE_COMPLETION');}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
