// Builds docs/xroga/oss-capability-ledger.json from the 58-repository handoff (Xroga_Complete_Open_Source_Repository_Capability_Handoff_2026-11-20.md).
// The seed rows below are the handoff's own catalog (class, priority, default treatment, provenance). Everything else is fetched live from GitHub:
// default branch, HEAD commit SHA, SPDX licence, archived flag, last push, language. A row stays INSPECTED (metadata only) until a human or a later
// step records source-level study, an adaptation, tests and a measured result in the `evidence` fields. Nothing here marks a repository integrated.
//
// Usage: node scripts/xroga/oss-ledger.mjs   (needs the gh CLI signed in; read-only API calls)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// [slug, class, priority, default treatment, provenance]
const SEED = [
  ['nanobrowser/nanobrowser', 'A', 'CORE', 'MAINTAIN + DIFF', 'H'],
  ['vercel-labs/agent-browser', 'A', 'P0', 'ADAPT TARGETING', 'H'],
  ['dylansantwani/openbrowser', 'A', 'CORE/P0', 'EXTEND EXISTING PORT', 'H'],
  ['Tencent/BrowserSkill', 'A', 'P0', 'ADAPT TAB LENDING', 'H'],
  ['browser-use/browser-harness', 'A', 'P0', 'ADAPT / FIXTURES', 'H'],
  ['alibaba/page-agent', 'A', 'P0', 'BENCHMARK + PORT', 'H+W'],
  ['derpx06/webgenie', 'A', 'P0', 'ADAPT RECOVERY', 'H'],
  ['openbrowse-ai/openbrowse', 'A', 'P1', 'SELECTIVE ADAPT', 'H'],
  ['browserbase/stagehand', 'A', 'P1', 'BENCHMARK (NO PAID CLOUD)', 'H'],
  ['browser-use/browser-use', 'A', 'P1', 'ADAPT PRIMITIVES', 'H'],
  ['ChromeDevTools/chrome-devtools-mcp', 'A', 'P0', 'TEST + PROFILING', 'H'],
  ['microsoft/playwright-mcp', 'A', 'P1', 'TEST / OPTIONAL CAPABILITY', 'H'],
  ['microsoft/playwright', 'A', 'P0', 'TEST INFRASTRUCTURE', 'H'],
  ['AliSharjeell/OpenBUA', 'A', 'P1', 'REFERENCE ONLY UNTIL LICENSE', 'H'],
  ['anomalyco/browse', 'A', 'P0', 'ADAPT SESSION POLICY', 'H'],
  ['uiuing/browser-agent', 'A', 'P0', 'ADAPT VERIFICATION', 'H'],
  ['jeet-dhandha/agent-webbridge', 'A', 'P2', 'REFERENCE ONLY', 'H'],
  ['pinchtab/pinchtab', 'A', 'P2', 'BENCHMARK IDEAS ONLY', 'H'],
  ['motailab/open-browser-agent', 'A', 'P2', 'REFERENCE / TEST', 'H'],
  ['web-infra-dev/midscene', 'B', 'P0', 'BENCHMARK + PORT COMPATIBLE METHODS', 'H'],
  ['microsoft/OmniParser', 'B', 'P2', 'REFERENCE; LICENSE + MODEL REVIEW', 'H'],
  ['bytedance/UI-TARS', 'B', 'P2', 'RESEARCH ONLY', 'N'],
  ['bytedance/UI-TARS-desktop', 'B', 'P3', 'ARCHIVED REFERENCE', 'N'],
  ['A9T9/RPA', 'B', 'P2', 'REFERENCE; GPL/AGPL REVIEW', 'N'],
  ['fabricjs/fabric.js', 'B', 'P1', 'TEST FIXTURES', 'H'],
  ['konvajs/konva', 'B', 'P1', 'TEST FIXTURES', 'H'],
  ['tracedraw/tracedraw', 'B', 'TEST', 'REGRESSION ONLY', 'H'],
  ['agentskills/agentskills', 'C', 'P0', 'SKILL REGISTRY ADAPTER', 'H'],
  ['anthropics/skills', 'C', 'P1', 'ADAPT ELIGIBLE SKILLS', 'H+W'],
  ['modelcontextprotocol/servers', 'C', 'P0', 'COMPATIBLE MCP TOOL ADAPTER', 'H'],
  ['Shopify/agent-skills', 'C', 'P0', 'DOMAIN SKILLS ON DEMAND', 'N+W'],
  ['Shopify/Shopify-AI-Toolkit', 'C', 'P0', 'DOMAIN SKILLS; REVIEW TELEMETRY', 'N+W'],
  ['googleads/google-ads-api-developer-assistant', 'C', 'P0', 'DOMAIN KNOWLEDGE / SANDBOX PLUGIN', 'N+W'],
  ['googleads/google-ads-python', 'C', 'P0', 'ON-DEMAND API WORKER', 'N+W'],
  ['meta/facebook-python-business-sdk', 'C', 'P0', 'ON-DEMAND API WORKER', 'N+W'],
  ['mozilla/readability', 'D', 'P0', 'EMBED / PORT READER', 'H'],
  ['apify/crawlee', 'D', 'P1', 'BACKEND SANDBOX ON DEMAND', 'H'],
  ['microsoft/markitdown', 'D', 'P1', 'BACKEND PARSER', 'H'],
  ['docling-project/docling', 'D', 'P1', 'BACKEND PARSER', 'H'],
  ['ServiceNow/BrowserGym', 'D', 'P0', 'EVALUATION HARNESS', 'H'],
  ['ServiceNow/AgentLab', 'D', 'P1', 'EVALUATION HARNESS', 'H'],
  ['Aepzie/cutline', 'E', 'P1', 'ON-DEMAND / TEST', 'H'],
  ['heychintan/openreel', 'E', 'P1', 'TEST / REFERENCE', 'H'],
  ['openfilm/openfilm', 'E', 'P2', 'TEST / REFERENCE', 'H'],
  ['opencutvideo/Opencut', 'E', 'P1', 'TEST / REFERENCE', 'H'],
  ['Panoptik-Studio/Panoptik', 'E', 'P2', 'REVIEW / TEST', 'H'],
  ['motion-canvas/motion-canvas', 'E', 'P1', 'ON-DEMAND ARTIFACT WORKER', 'H'],
  ['ffmpegwasm/ffmpeg.wasm', 'E', 'P1', 'ON-DEMAND / ISOLATED', 'H'],
  ['Vanilagy/mediabunny', 'E', 'P1', 'ON-DEMAND (MPL REVIEW)', 'H'],
  ['mifi/editly', 'E', 'P1', 'ON-DEMAND SANDBOX', 'H'],
  ['lovell/sharp', 'E', 'P0', 'BACKEND ARTIFACT PRIMITIVE', 'H'],
  ['visioncortex/vtracer', 'E', 'P2', 'ON-DEMAND SANDBOX', 'H'],
  ['xinntao/Real-ESRGAN', 'E', 'P2', 'ON-DEMAND AFTER LICENSE/COST REVIEW', 'H'],
  ['manimCommunity/manim', 'E', 'P2', 'ON-DEMAND SANDBOX', 'H'],
  ['eracle/OpenOutreach', 'F', 'P2', 'ON-DEMAND SCOPED READS', 'H'],
  ['Mahanaicoach/google-maps-scraper-kit', 'F', 'P3', 'EVALUATE SOURCE PERMISSIONS', 'H'],
  ['speedyapply/JobSpy', 'F', 'P2', 'ON-DEMAND SANDBOX', 'H'],
  ['browser-use/workflow-use', 'F', 'P3', 'CONCEPTS ONLY UNTIL LEGAL REVIEW', 'H'],
  // The 14 sources added by the 2026-11-20 site-intelligence order (class S = site awareness and skill discovery, class T = general capacity and professional skill packs).
  ['alibaba/qz-browser-agent', 'S', 'P0', 'ADAPT SITE MATCHING AND SKILL ACTIVATION', 'N'],
  ['browsing-skills/browsing-skills', 'S', 'P0', 'ADAPT REVIEWED ACTION CONTRACTS (NO ARBITRARY PAGE.EVALUATE)', 'N'],
  ['ComeOnOliver/skillshub', 'S', 'P0', 'OPTIONAL ONLINE DISCOVERY PROVIDER WITH FALLBACK AND CACHE', 'N'],
  ['vercel-labs/skills', 'S', 'P1', 'ADAPT REMOTE SKILL RESOLVER (NO NODE CLI IN EXTENSION)', 'N'],
  ['browserbase/browse-plugin', 'S', 'P2', 'STUDY CATALOG AND DISCOVERY; NO CLOUD DEPENDENCY', 'N'],
  ['ScottSyms/Browser-Agent', 'S', 'P1', 'IDEAS ONLY UNTIL CODE LICENSE CONFIRMED', 'N'],
  ['cloudflare/agent-skills-discovery-rfc', 'S', 'P1', 'EXPERIMENTAL OPT-IN WELL-KNOWN RESOLVER', 'N'],
  ['esterhuizen/opensidekick', 'T', 'P0', 'COMPARE CONTROL AND RECORDING FEATURES; ADAPT MISSING PRIMITIVES', 'N'],
  ['fullselfbrowsing/FSB', 'T', 'P0', 'SELECTIVELY PORT MISSING PRIMITIVES', 'N'],
  ['sickn33/agentic-awesome-skills', 'T', 'P1', 'TRUSTED SUBSET ON DEMAND; LICENCE PER SKILL', 'N'],
  ['coreyhaines31/marketingskills', 'T', 'P1', 'TASK-SCOPED PROFESSIONAL EXPERTISE ON DEMAND', 'N'],
  ['amzn/selling-partner-agentic-toolkit', 'T', 'P1', 'AUTHORIZED BACKEND WORKER; REAL SELLER SCOPES REQUIRED', 'N'],
  ['remotion-dev/skills', 'T', 'P1', 'MEDIA WORKER GUIDANCE ON DEMAND', 'N'],
  ['VelvetAbyss/browser-agent-recorder', 'T', 'P1', 'ADAPT CAPTURE TO SANITIZE TO VERIFY TO REPLAY IN EXPERIENCE ENGINE', 'N'],
];


// Classification from the handoff default treatment, gated by the verified licence. A copyleft or unknown licence blocks code copying.
function classify(row) {
  const t = row.default_treatment;
  const lic = row.license_spdx;
  const copyleft = lic && /AGPL|(^|-)GPL/.test(lic);
  const unknown = !lic || lic === 'NOASSERTION';
  let c;
  if (/MAINTAIN|EXTEND EXISTING/.test(t)) c = 'ALREADY IMPLEMENTED';
  else if (/ADAPT|PORT|EMBED|REGISTRY ADAPTER/.test(t)) c = 'ADAPT CODE';
  else if (/ON-DEMAND|BACKEND|DOMAIN|API WORKER|MCP TOOL/.test(t)) c = 'INVOKE ON DEMAND';
  else if (/TEST|EVALUATION|FIXTURES|REGRESSION|BENCHMARK/.test(t)) c = 'TEST REFERENCE';
  else c = 'REJECT';
  let note = null;
  if (copyleft) { c = 'REJECT'; note = `${lic}: no code may be copied into the extension; concepts only`; }
  else if (c === 'ADAPT CODE' && unknown) { note = 'licence not machine-verified: read the LICENSE file before copying any code'; }
  if (row.archived) note = `${note ? note + '; ' : ''}archived upstream`;
  return { classification: c, rights_note: note };
}

// Evidence recorded by hand where Xroga code actually reuses upstream. Everything not listed stays at metadata level.
const EVIDENCE = {
  'nanobrowser/nanobrowser': { status: 'ALREADY PRESENT', inspected_level: 'foundation', xroga_current_equivalent: 'apps/xroga-browser-extension (Nanobrowser v0.3.0 fork, see NOTICE)', chosen_reuse_method: 'maintain', xroga_file_paths: ['apps/xroga-browser-extension/NOTICE'], adoption_or_rejection_reason: 'Local Chrome foundation; not replaced. Diff against upstream fixes not yet done.' },
  'dylansantwani/openbrowser': { status: 'ADAPTED IN CODE', inspected_level: 'source adapted (batch planner)', xroga_current_equivalent: 'src/agent/batch-plan.ts', chosen_reuse_method: 'port of extension/background/batch.js, MIT, attributed in the file header', xroga_file_paths: ['apps/xroga-browser-extension/src/agent/batch-plan.ts', 'apps/xroga-browser-extension/src/agent/loop.ts (#runBatchTool)'], new_tests: ['src/agent/__tests__/batch-plan.test.ts', 'src/agent/__tests__/batch-tool.test.ts'], deepseek_check: 'used in live runs (httpbin form one-pass fill, TraceDraw trial 1); no before/after measurement', adoption_or_rejection_reason: 'Kept: removes one model turn per known step.' },
  'uiuing/browser-agent': { status: 'INTEGRATED/UNIT', inspected_level: 'source read: orchestrator/healing.ts, contracts/verification.ts, page/verify.ts', xroga_current_equivalent: 'none before (tracker reacted to repetition only)', chosen_reuse_method: 'adapt diagnose -> strategy chain -> terminal check (MIT); Xroga codes, directives and terminal rule are new', xroga_file_paths: ['apps/xroga-browser-extension/src/agent/failure-diagnosis.ts', 'apps/xroga-browser-extension/src/agent/progress-tracker.ts', 'apps/xroga-browser-extension/src/agent/loop.ts (errorCode into the tracker)'], new_tests: ['src/agent/__tests__/failure-diagnosis.test.ts'], adoption_or_rejection_reason: 'Kept: terminal failures (needs a person) stop at once, others get a diagnosis-specific chain. Its postcondition vocabulary (verify.ts) is already covered by the expect schema in src/browser-control/protocol/schemas.ts (url, text, textGone, value, checked, gone, exists, count); element_state and attribute_equals are the only gaps.' },
  'agentskills/agentskills': { status: 'INTEGRATED/UNIT', inspected_level: 'specification fields implemented', xroga_current_equivalent: 'src/agent/skills.ts playbooks (keyword regex, always in prompt when matched)', chosen_reuse_method: 'implement the SKILL.md frontmatter format for parsing and validation; bundled skills stored as SKILL.md', xroga_file_paths: ['apps/xroga-browser-extension/src/agent/skill-md.ts', 'apps/xroga-browser-extension/src/agent/skill-catalog.ts (find_skill, read_skill)'], new_tests: ['src/agent/__tests__/skill-catalog.test.ts'], adoption_or_rejection_reason: 'Kept: on-demand discovery instead of prompt dumps. allowed-tools is recorded, never granted.' },

  'vercel-labs/agent-browser': { status: 'ALREADY PRESENT', classification: 'ALREADY IMPLEMENTED', inspected_level: 'README and package structure read', xroga_current_equivalent: 'snapshot with refs, find, compact outline (src/browser-control/core/tools, src/agent/loop.ts)', chosen_reuse_method: 'none: upstream is a native Rust CLI; its core idea (accessibility-tree snapshot with a ref per element) is already how Xroga targets elements', adoption_or_rejection_reason: 'No code taken. Not an MV3-compatible component.' },
  'anomalyco/browse': { status: 'ALREADY PRESENT', classification: 'ALREADY IMPLEMENTED', inspected_level: 'README read', xroga_current_equivalent: 'tab group per run, shared and adopted tabs, handover to the user for login or approval (afterToolCall handover, tabs adopt)', chosen_reuse_method: 'none', adoption_or_rejection_reason: 'It is an MCP server plus extension for other agents; Xroga already hands a tab back to the user and continues. Flight-recorder and redaction ideas remain candidates, not done.' },
  'derpx06/webgenie': { status: 'INSPECTED', classification: 'REJECT', inspected_level: 'README read: a Nanobrowser-style extension agent', xroga_current_equivalent: 'Xroga already forks Nanobrowser', chosen_reuse_method: 'none', adoption_or_rejection_reason: 'Same lineage as the existing foundation; its checkpoint and replan idea is covered by the run journal, resume and progress tracker. No unique module identified yet; deeper diff deferred.' },
  'alibaba/page-agent': { status: 'BEHAVIOR-COMPARED', classification: 'ALREADY IMPLEMENTED', inspected_level: 'README read; behavior comparison by fixture', xroga_current_equivalent: 'CDP accessibility snapshot with refs and clickable detection (src/browser-control)', chosen_reuse_method: 'none: no gap found', xroga_file_paths: ['apps/xroga-browser-extension/fixtures/pages/clickable-zoo.html', 'apps/xroga-browser-extension/src/background/scenarios/clickable-zoo.ts'], new_tests: ['Chromium scenario ZOO-1-controls-without-roles'], chrome_check: 'ZOO-1 passes: 10 of 10 control types without button or link roles (div onclick, pointer span, role button div, anchor without href, focusable li, image button, shadow-DOM button, label checkbox, summary, SVG shape) are listed with a ref and their click reaches the page', adoption_or_rejection_reason: 'Its semantic element detection would add nothing for these classes: Xroga already finds and activates them. Reopen only if a fixture class is found where Xroga misses a control.' },
  'microsoft/playwright': { status: 'ALREADY PRESENT', inspected_level: 'used', xroga_current_equivalent: 'backend dependency (AGENTS.md); playwright-core for disposable Chromium; Xroga fixtures use plain Chrome through the extension', chosen_reuse_method: 'test infrastructure', adoption_or_rejection_reason: 'No change.' },
  'tracedraw/tracedraw': { status: 'LIVE DEEPSEEK VERIFIED', inspected_level: 'regression target only', chosen_reuse_method: 'regression', new_tests: ['scripts/verify-a4-svg.test.mjs'], deepseek_check: 'trial 1 pass (about 4 min), trial 2 fail; see LIVE-TRIAL-20261120.md and LIVE-RUNS-20261120-B.md', adoption_or_rejection_reason: 'One regression case, not the product direction.' },
};

function gh(path) {
  try {
    return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
  } catch (error) {
    return { error: String(error.stderr || error.message).split('\n')[0].slice(0, 200) };
  }
}

const rows = [];
for (const [slug, cls, priority, treatment, provenance] of SEED) {
  const repo = gh(`repos/${slug}`);
  const row = { upstream_repo: slug, class: cls, priority, default_treatment: treatment, provenance, status: 'NOT INSPECTED' };
  if (repo.error) {
    Object.assign(row, { metadata_error: repo.error, status: 'NOT INSPECTED' });
  } else {
    const head = gh(`repos/${repo.full_name}/commits/${repo.default_branch}`);
    Object.assign(row, {
      canonical_url: repo.html_url,
      resolved_slug: repo.full_name,
      default_branch: repo.default_branch,
      source_sha: head.sha ?? null,
      source_sha_date: head.commit?.committer?.date ?? null,
      license_spdx: repo.license?.spdx_id ?? null,
      license_name: repo.license?.name ?? null,
      archived: !!repo.archived,
      pushed_at: repo.pushed_at,
      language: repo.language,
      stars: repo.stargazers_count,
      status: 'INSPECTED',
      inspected_level: 'github-metadata-only',
      xroga_current_equivalent: null,
      chosen_reuse_method: null,
      xroga_file_paths: [],
      new_tests: [],
      chrome_check: null,
      deepseek_check: null,
      performance_before_after: null,
      adoption_or_rejection_reason: null,
    });
  }
  if (!row.metadata_error) Object.assign(row, classify(row), EVIDENCE[slug] ?? {});
  rows.push(row);
  process.stderr.write(`${row.status.padEnd(13)} ${slug} ${row.license_spdx ?? row.metadata_error ?? ''}\n`);
}

const out = resolve(import.meta.dirname, '../../docs/xroga/oss-capability-ledger.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), source: 'Xroga_Complete_Open_Source_Repository_Capability_Handoff_2026-11-20.md', count: rows.length, rows }, null, 2) + '\n');
console.log(`wrote ${rows.length} rows to ${out}`);
