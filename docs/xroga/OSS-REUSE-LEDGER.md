# Open-Source Reuse Ledger

Generated 2026-11-20T17:35:28.656Z from `docs/xroga/oss-capability-ledger.json` (72 repositories, the 2026-11-20 handoff catalog).

SHA, licence, archived flag and activity were fetched from GitHub for each repository. A row is **INSPECTED (metadata only)** unless the Evidence columns show source study, code and tests. A repository link, clone or README read is not an integration.

Classification: ALREADY IMPLEMENTED: 5, ADAPT CODE: 14, REJECT: 19, TEST REFERENCE: 14, INVOKE ON DEMAND: 20

Status: ALREADY PRESENT: 4, ADAPTED IN CODE: 1, SOURCE REVIEWED: 3, INSPECTED: 56, BEHAVIOR-COMPARED: 1, INTEGRATED/UNIT: 2, LIVE DEEPSEEK VERIFIED: 1, CODE INTEGRATED: 3, BLOCKED: 1

| # | Repository | Pinned SHA | Licence | Classification | Status | Xroga code path | Tests | Reason / rights note |
|--:|---|---|---|---|---|---|---|---|
| 1 | [nanobrowser/nanobrowser](https://github.com/nanobrowser/nanobrowser) | 291d5f3927 | Apache-2.0 | ALREADY IMPLEMENTED | ALREADY PRESENT | apps/xroga-browser-extension/NOTICE | - | Local Chrome foundation; not replaced. Diff against upstream fixes not yet done. / handoff: MAINTAIN + DIFF |
| 2 | [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) | 4605d82cfc | Apache-2.0 | ALREADY IMPLEMENTED | CODE INTEGRATED | src/browser-control/core/tools/observe.ts (screenshot ifChanged) | src/browser-control/core/tools/__tests__/picture-fingerprint.test.ts | Taken: screenshot --if-changed. Also taken: http_get outline/filter, endpoint map (diagnostics endpoints), HTTP replay of macros, site-qa playbook, audit_page. Not taken: WebMCP (no site offers it), HAR bodies (can hold tokens). See docs/xroga/donor-study/BATCH-01-20261124.md |
| 3 | [dylansantwani/openbrowser](https://github.com/dylansantwani/openbrowser) | 1f670809ca | MIT | ALREADY IMPLEMENTED | CODE INTEGRATED | src/agent/macro-tool.ts; src/agent/batch-plan.ts | src/agent/__tests__/macro-tool.test.ts; src/agent/__tests__/batch-plan.test.ts | Kept: batch control flow and one-call replay of a saved flow (macro). Secrets are never saved in a routine. |
| 4 | [Tencent/BrowserSkill](https://github.com/Tencent/BrowserSkill) | ae87b539fd | MIT | ADAPT CODE | CODE INTEGRATED | src/browser-control/core/tools/extract-rows.ts; probe extractRows | src/browser-control/core/tools/__tests__/extract-rows.test.ts; Chromium scenario S3-extract-rows | Kept: structured table, grid and list extraction with columns, links, merged cells, stated total and more-below evidence. Not taken: field-selector extraction, CSV export. |
| 5 | [browser-use/browser-harness](https://github.com/browser-use/browser-harness) | 22ecf8545d | MIT | ADAPT CODE | INSPECTED | - | - | handoff: ADAPT / FIXTURES |
| 6 | [alibaba/page-agent](https://github.com/alibaba/page-agent) | d8dd334487 | MIT | ALREADY IMPLEMENTED | BEHAVIOR-COMPARED | apps/xroga-browser-extension/fixtures/pages/clickable-zoo.html; apps/xroga-browser-extension/src/background/scenarios/clickable-zoo.ts | Chromium scenario ZOO-1-controls-without-roles | Its semantic element detection would add nothing for these classes: Xroga already finds and activates them. Reopen only if a fixture class is found where Xroga misses a control. / handoff: BENCHMARK + PORT |
| 7 | [derpx06/webgenie](https://github.com/derpx06/webgenie) | 56b5d8bccf | Apache-2.0 | REJECT | CODE INTEGRATED | - | - | Same lineage as the existing foundation; its checkpoint and replan idea is covered by the run journal, resume and progress tracker. No unique module identified yet; deeper diff deferred. / handoff: ADAPT RECOVERY | Taken: browser_data tab grouping and history/bookmarks tools (agent/browser-data.ts).
| 8 | [openbrowse-ai/openbrowse](https://github.com/openbrowse-ai/openbrowse) | 9c1bec9d92 | MIT | ADAPT CODE | CODE INTEGRATED | - | - | handoff: SELECTIVE ADAPT | Taken: tab organisation in browser_data (duplicates, group by site).
| 9 | [browserbase/stagehand](https://github.com/browserbase/stagehand) | 4d72a87ff7 | MIT | TEST REFERENCE | CODE INTEGRATED | src/browser-control/core/tools/extract-rows.ts (the extract idea) | Chromium scenario S3-extract-rows | Kept: extraction without the model reading cells. Not taken: cached action replay beyond macro; its benchmark needs a paid cloud. |
| 10 | [browser-use/browser-use](https://github.com/browser-use/browser-use) | ccbdb8095f | MIT | ADAPT CODE | CODE INTEGRATED | src/agent/data-ops.ts working set; src/browser-control/core/tools/web-search.ts; src/agent/search-redirect.ts | src/agent/__tests__/data-ops.test.ts; Chromium scenario S3-web-search; live task leads-dedupe | Kept: work on held rows, the search helper idea (in the browser), evidence discipline. Also taken: python_repl (isolated server sandbox, cells replayed), done-judge (task-judge.ts), data_ops validate. Not taken: captcha solver (no bypass), secrets by name. |
| 11 | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | eb9b030280 | Apache-2.0 | TEST REFERENCE | INSPECTED | - | - | handoff: TEST + PROFILING |
| 12 | [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | 2337aff021 | Apache-2.0 | TEST REFERENCE | INSPECTED | - | - | handoff: TEST / OPTIONAL CAPABILITY |
| 13 | [microsoft/playwright](https://github.com/microsoft/playwright) | 2f1592a70b | Apache-2.0 | TEST REFERENCE | ALREADY PRESENT | - | - | No change. / handoff: TEST INFRASTRUCTURE |
| 14 | [AliSharjeell/OpenBUA](https://github.com/AliSharjeell/OpenBUA) | 98d68ba43a | none found | REJECT | INSPECTED | - | - | handoff: REFERENCE ONLY UNTIL LICENSE |
| 15 | [anomalyco/browse](https://github.com/anomalyco/browse) | ae5d9d07ba | MIT | ALREADY IMPLEMENTED | ALREADY PRESENT | - | - | It is an MCP server plus extension for other agents; Xroga already hands a tab back to the user and continues. Flight-recorder and redaction ideas remain candidates, not done. / handoff: ADAPT SESSION POLICY |
| 16 | [uiuing/browser-agent](https://github.com/uiuing/browser-agent) | a8517e2c5c | MIT | ADAPT CODE | INTEGRATED/UNIT | apps/xroga-browser-extension/src/agent/failure-diagnosis.ts; apps/xroga-browser-extension/src/agent/progress-tracker.ts; apps/xroga-browser-extension/src/agent/loop.ts (errorCode into the tracker) | src/agent/__tests__/failure-diagnosis.test.ts | Kept: terminal failures (needs a person) stop at once, others get a diagnosis-specific chain. Its postcondition vocabulary (verify.ts) is already covered by the expect schema in src/browser-control/protocol/schemas.ts (url, text, textGone, value, checked, gone, exists, count); element_state is now covered by the `enabled` postcondition (2026-11-22; schemas.ts, interaction/evidence.ts; Chromium scenario S3-expect-enabled); attribute_equals is covered too (`expect.attribute` as name=value, new probe operation `attribute`; Chromium scenario S3-expect-attribute). Both gaps closed 2026-11-22. / handoff: ADAPT VERIFICATION |
| 17 | [jeet-dhandha/agent-webbridge](https://github.com/jeet-dhandha/agent-webbridge) | a14cd1dcdf | MIT | REJECT | INSPECTED | - | - | handoff: REFERENCE ONLY |
| 18 | [pinchtab/pinchtab](https://github.com/pinchtab/pinchtab) | a62662027f | MIT | TEST REFERENCE | INSPECTED | - | - | handoff: BENCHMARK IDEAS ONLY |
| 19 | [motailab/open-browser-agent](https://github.com/motailab/open-browser-agent) | b0791b8c44 | Apache-2.0 | TEST REFERENCE | INSPECTED | - | - | handoff: REFERENCE / TEST |
| 20 | [web-infra-dev/midscene](https://github.com/web-infra-dev/midscene) | 4afc9fd110 | MIT | ADAPT CODE | INSPECTED | - | - | handoff: BENCHMARK + PORT COMPATIBLE METHODS |
| 21 | [microsoft/OmniParser](https://github.com/microsoft/OmniParser) | 3540212013 | CC-BY-4.0 | REJECT | INSPECTED | - | - | handoff: REFERENCE; LICENSE + MODEL REVIEW |
| 22 | [bytedance/UI-TARS](https://github.com/bytedance/UI-TARS) | 582f3a7ea5 | Apache-2.0 | REJECT | INSPECTED | - | - | archived upstream / handoff: RESEARCH ONLY |
| 23 | [bytedance/UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) | 3ac2cb8d94 | Apache-2.0 | REJECT | INSPECTED | - | - | archived upstream / handoff: ARCHIVED REFERENCE |
| 24 | [A9T9/RPA](https://github.com/A9T9/RPA) | 17b6302f16 | NOASSERTION | REJECT | INSPECTED | - | - | handoff: REFERENCE; GPL/AGPL REVIEW |
| 25 | [fabricjs/fabric.js](https://github.com/fabricjs/fabric.js) | ab604137e0 | MIT | TEST REFERENCE | INSPECTED | - | - | handoff: TEST FIXTURES |
| 26 | [konvajs/konva](https://github.com/konvajs/konva) | bf1927c1cf | NOASSERTION | TEST REFERENCE | INSPECTED | - | - | handoff: TEST FIXTURES |
| 27 | [tracedraw/tracedraw](https://github.com/tracedraw/tracedraw) | 118f9657d6 | NOASSERTION | TEST REFERENCE | LIVE DEEPSEEK VERIFIED | - | scripts/verify-a4-svg.test.mjs | One regression case, not the product direction. / handoff: REGRESSION ONLY |
| 28 | [agentskills/agentskills](https://github.com/agentskills/agentskills) | 83021e2be4 | Apache-2.0 | ADAPT CODE | INTEGRATED/UNIT | apps/xroga-browser-extension/src/agent/skill-md.ts; apps/xroga-browser-extension/src/agent/skill-catalog.ts (find_skill, read_skill) | src/agent/__tests__/skill-catalog.test.ts | Kept: on-demand discovery instead of prompt dumps. allowed-tools is recorded, never granted. / handoff: SKILL REGISTRY ADAPTER |
| 29 | [anthropics/skills](https://github.com/anthropics/skills) | e4bb5d960d | none found | ADAPT CODE | INSPECTED | - | - | licence not machine-verified: read the LICENSE file before copying any code / handoff: ADAPT ELIGIBLE SKILLS |
| 30 | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | c799c8552b | NOASSERTION | ADAPT CODE | INSPECTED | - | - | licence not machine-verified: read the LICENSE file before copying any code / handoff: COMPATIBLE MCP TOOL ADAPTER |
| 31 | [Shopify/agent-skills](https://github.com/Shopify/agent-skills) | - | none found | INVOKE ON DEMAND | INSPECTED | - | - | handoff: DOMAIN SKILLS ON DEMAND |
| 32 | [Shopify/Shopify-AI-Toolkit](https://github.com/Shopify/Shopify-AI-Toolkit) | 0388268a61 | MIT | INVOKE ON DEMAND | INSPECTED | - | - | handoff: DOMAIN SKILLS; REVIEW TELEMETRY |
| 33 | [googleads/google-ads-api-developer-assistant](https://github.com/googleads/google-ads-api-developer-assistant) | dbb730a199 | Apache-2.0 | INVOKE ON DEMAND | INSPECTED | - | - | handoff: DOMAIN KNOWLEDGE / SANDBOX PLUGIN |
| 34 | [googleads/google-ads-python](https://github.com/googleads/google-ads-python) | f253b400dc | Apache-2.0 | INVOKE ON DEMAND | INSPECTED | - | - | handoff: ON-DEMAND API WORKER |
| 35 | [meta/facebook-python-business-sdk](https://github.com/meta/facebook-python-business-sdk) | 947c427b4a | NOASSERTION | INVOKE ON DEMAND | INSPECTED | - | - | handoff: ON-DEMAND API WORKER |
| 36 | [mozilla/readability](https://github.com/mozilla/readability) | ab4027a8b3 | Apache-2.0 | ADAPT CODE | INSPECTED | - | - | handoff: EMBED / PORT READER |
| 37 | [apify/crawlee](https://github.com/apify/crawlee) | 446c6898fd | Apache-2.0 | INVOKE ON DEMAND | INSPECTED | - | - | handoff: BACKEND SANDBOX ON DEMAND |
| 38 | [microsoft/markitdown](https://github.com/microsoft/markitdown) | ed178952a6 | MIT | INVOKE ON DEMAND | INSPECTED | - | - | handoff: BACKEND PARSER |
| 39 | [docling-project/docling](https://github.com/docling-project/docling) | f93ee6bc72 | MIT | INVOKE ON DEMAND | INSPECTED | - | - | handoff: BACKEND PARSER |
| 40 | [ServiceNow/BrowserGym](https://github.com/ServiceNow/BrowserGym) | 62a678feef | NOASSERTION | TEST REFERENCE | INSPECTED | - | - | handoff: EVALUATION HARNESS |
| 41 | [ServiceNow/AgentLab](https://github.com/ServiceNow/AgentLab) | 8488c564ee | NOASSERTION | TEST REFERENCE | INSPECTED | - | - | handoff: EVALUATION HARNESS |
| 42 | [Aepzie/cutline](https://github.com/Aepzie/cutline) | ab71520285 | MIT | INVOKE ON DEMAND | INSPECTED | - | - | handoff: ON-DEMAND / TEST |
| 43 | [heychintan/openreel](https://github.com/heychintan/openreel) | 5f3c85e5fc | MIT | TEST REFERENCE | INSPECTED | - | - | handoff: TEST / REFERENCE |
| 44 | [openfilm/openfilm](https://github.com/openfilm/openfilm) | - | MIT | TEST REFERENCE | INSPECTED | - | - | handoff: TEST / REFERENCE |
| 45 | [opencutvideo/Opencut](https://github.com/opencutvideo/Opencut) | a7dc1f8fa9 | none found | TEST REFERENCE | INSPECTED | - | - | handoff: TEST / REFERENCE |
| 46 | [Panoptik-Studio/Panoptik](https://github.com/Panoptik-Studio/Panoptik) | e16fcb0901 | AGPL-3.0 | REJECT | INSPECTED | - | - | AGPL-3.0: no code may be copied into the extension; concepts only / handoff: REVIEW / TEST |
| 47 | [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) | 7b91435c30 | MIT | INVOKE ON DEMAND | INSPECTED | - | - | handoff: ON-DEMAND ARTIFACT WORKER |
| 48 | [ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | f876f907c7 | MIT | INVOKE ON DEMAND | INSPECTED | - | - | handoff: ON-DEMAND / ISOLATED |
| 49 | [Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) | 6bb7c03241 | MPL-2.0 | INVOKE ON DEMAND | INSPECTED | - | - | handoff: ON-DEMAND (MPL REVIEW) |
| 50 | [mifi/editly](https://github.com/mifi/editly) | dc46674052 | MIT | INVOKE ON DEMAND | INSPECTED | - | - | handoff: ON-DEMAND SANDBOX |
| 51 | [lovell/sharp](https://github.com/lovell/sharp) | 9a34cfeda1 | Apache-2.0 | INVOKE ON DEMAND | INSPECTED | - | - | handoff: BACKEND ARTIFACT PRIMITIVE |
| 52 | [visioncortex/vtracer](https://github.com/visioncortex/vtracer) | aede2c6197 | MIT | INVOKE ON DEMAND | INSPECTED | - | - | handoff: ON-DEMAND SANDBOX |
| 53 | [xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | a4abfb2979 | BSD-3-Clause | INVOKE ON DEMAND | INSPECTED | - | - | handoff: ON-DEMAND AFTER LICENSE/COST REVIEW |
| 54 | [manimCommunity/manim](https://github.com/ManimCommunity/manim) | 04002e069e | MIT | INVOKE ON DEMAND | INSPECTED | - | - | handoff: ON-DEMAND SANDBOX |
| 55 | [eracle/OpenOutreach](https://github.com/eracle/OpenOutreach) | e3f6baf373 | Apache-2.0 | INVOKE ON DEMAND | INSPECTED | - | - | handoff: ON-DEMAND SCOPED READS |
| 56 | [Mahanaicoach/google-maps-scraper-kit](https://github.com/Mahanaicoach/google-maps-scraper-kit) | c3e63f1934 | AGPL-3.0 | REJECT | INSPECTED | - | - | AGPL-3.0: no code may be copied into the extension; concepts only / handoff: EVALUATE SOURCE PERMISSIONS |
| 57 | [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) | fdd8518c5f | MIT | INVOKE ON DEMAND | INSPECTED | - | - | handoff: ON-DEMAND SANDBOX |
| 58 | [browser-use/workflow-use](https://github.com/browser-use/workflow-use) | f00e27edd7 | AGPL-3.0 | REJECT | INSPECTED | - | - | AGPL-3.0: no code may be copied into the extension; concepts only / handoff: CONCEPTS ONLY UNTIL LEGAL REVIEW |
| 59 | [alibaba/qz-browser-agent](https://github.com/alibaba/qz-browser-agent) | 96d1c8f66c | Apache-2.0 | ADAPT CODE | CODE INTEGRATED | apps/xroga-browser-extension/src/agent/site-context.ts; apps/xroga-browser-extension/src/agent/skill-catalog.ts | src/agent/__tests__/site-context.test.ts | Rule matching is dot-boundary strict (look-alike hosts never match); skills never limit the model. / handoff: ADAPT SITE MATCHING AND SKILL ACTIVATION |
| 60 | [browsing-skills/browsing-skills](https://github.com/browsing-skills/browsing-skills) | 07855b500d | MIT | ADAPT CODE | CODE INTEGRATED | apps/xroga-browser-extension/src/agent/site-actions.ts | src/agent/__tests__/site-actions.test.ts; src/agent/__tests__/site-tools.test.ts | Steps are declarative data over an allowlist of page tools; no downloaded code runs in a page. / handoff: ADAPT REVIEWED ACTION CONTRACTS (NO ARBITRARY PAGE.EVALUATE) |
| 61 | [ComeOnOliver/skillshub](https://github.com/ComeOnOliver/skillshub) | def8531e65 | MIT | REJECT | BLOCKED | apps/xroga-browser-extension/src/agent/online-skills.ts | src/agent/__tests__/online-skills.test.ts; src/agent/__tests__/site-tools.test.ts | THIRD-PARTY: the live endpoint answered HTTP 402 DEPLOYMENT_DISABLED on 2026-11-20, so the real contract could not be verified. The client fails closed to no candidates; nothing depends on it. / handoff: OPTIONAL ONLINE DISCOVERY PROVIDER WITH FALLBACK AND CACHE |
| 62 | [vercel-labs/skills](https://github.com/vercel-labs/skills) | 57217cf86b | MIT | ADAPT CODE | INSPECTED | - | - | handoff: ADAPT REMOTE SKILL RESOLVER (NO NODE CLI IN EXTENSION) |
| 63 | [browserbase/browse-plugin](https://github.com/browserbase/browse-plugin) | 5a538bd0d4 | none found | REJECT | INSPECTED | - | - | handoff: STUDY CATALOG AND DISCOVERY; NO CLOUD DEPENDENCY |
| 64 | [ScottSyms/Browser-Agent](https://github.com/ScottSyms/Browser-Agent) | 6e5eea8736 | none found | REJECT | INSPECTED | - | - | handoff: IDEAS ONLY UNTIL CODE LICENSE CONFIRMED |
| 65 | [cloudflare/agent-skills-discovery-rfc](https://github.com/cloudflare/agent-skills-discovery-rfc) | 1bd1167983 | Apache-2.0 | REJECT | CODE INTEGRATED | apps/xroga-browser-extension/src/agent/well-known-skills.ts | src/agent/__tests__/well-known-skills.test.ts; src/agent/__tests__/site-tools.test.ts | Same origin, no credentials, no redirects, size and time bounds, digest must match. / handoff: EXPERIMENTAL OPT-IN WELL-KNOWN RESOLVER |
| 66 | [esterhuizen/opensidekick](https://github.com/esterhuizen/opensidekick) | 6f11eeea67 | MIT | REJECT | SOURCE REVIEWED | - | - | Its optional safety verdicts send page text (up to 60,000 characters) to a third-party decision service (OpenRouter alpha or TypeSafe). That is new paid egress of page content, so it is rejected. Its null-on-any-failure wrapper contract is already how online-skills.ts behaves. / handoff: COMPARE CONTROL AND RECORDING FEATURES; ADAPT MISSING PRIMITIVES |
| 67 | [fullselfbrowsing/FSB](https://github.com/fullselfbrowsing/FSB) | 28284b8c4d | MIT | REJECT | SOURCE REVIEWED | - | - | Its loop ends runs deterministically (iteration circuit breaker, stuck force-stop after 5 warnings). The owner directive forbids artificial ceilings, and Xroga already detects repetition, no-change and no-progress as advisories that never stop a run. Its recipe catalog is unverified selector data, weaker than reviewed, hash-checked VerifiedSiteAction. / handoff: SELECTIVELY PORT MISSING PRIMITIVES |
| 68 | [sickn33/agentic-awesome-skills](https://github.com/sickn33/agentic-awesome-skills) | a99b3d3bb6 | MIT (code), CC BY 4.0 (content) | ADAPT CODE | CODE INTEGRATED | apps/xroga-browser-extension/src/agent/aas-skills.ts; scripts/build-aas-index.mjs; src/agent/data/aas-index.json; loop.ts (find_skill, read_skill, once-per-run suggestion) | src/agent/__tests__/aas-skills.test.ts | 2,980 of 3,131 skills indexed (151 offensive left out); ranked on the device, bodies read on demand from the pinned commit over one static host; skills grant no permission; attribution in NOTICE; each skill keeps its own upstream licence |
| 69 | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | 5b2b400eec | MIT | ADAPT TEXT | INTEGRATED/UNIT | apps/xroga-browser-extension/src/agent/skills.ts (google-ads, meta-ads: default audits, Andromeda-era Meta structure, budget steps, universal negatives); NOTICE | src/agent/__tests__ (suite) | Only expert points, rewritten; loaded only when an ads task matches. 2026-11-23 |
| 70 | [amzn/selling-partner-agentic-toolkit](https://github.com/amzn/selling-partner-agentic-toolkit) | 4563bfcb17 | NOASSERTION | INVOKE ON DEMAND | INSPECTED | - | - | handoff: AUTHORIZED BACKEND WORKER; REAL SELLER SCOPES REQUIRED |
| 71 | [remotion-dev/skills](https://github.com/remotion-dev/skills) | 6f55706d10 | none found | REJECT | INSPECTED | - | - | handoff: MEDIA WORKER GUIDANCE ON DEMAND |
| 72 | [VelvetAbyss/browser-agent-recorder](https://github.com/VelvetAbyss/browser-agent-recorder) | 9e632a32ac | MIT | ADAPT CODE | INSPECTED | - | - | handoff: ADAPT CAPTURE TO SANITIZE TO VERIFY TO REPLAY IN EXPERIENCE ENGINE |

## Deliberately rejected or deferred for code reuse

- **derpx06/webgenie** (Apache-2.0): ADAPT RECOVERY.
- **AliSharjeell/OpenBUA** (no licence found): REFERENCE ONLY UNTIL LICENSE.
- **jeet-dhandha/agent-webbridge** (MIT): REFERENCE ONLY.
- **microsoft/OmniParser** (CC-BY-4.0): REFERENCE; LICENSE + MODEL REVIEW.
- **bytedance/UI-TARS** (Apache-2.0): archived upstream.
- **bytedance/UI-TARS-desktop** (Apache-2.0): archived upstream.
- **A9T9/RPA** (NOASSERTION): REFERENCE; GPL/AGPL REVIEW.
- **Panoptik-Studio/Panoptik** (AGPL-3.0): AGPL-3.0: no code may be copied into the extension; concepts only.
- **Mahanaicoach/google-maps-scraper-kit** (AGPL-3.0): AGPL-3.0: no code may be copied into the extension; concepts only.
- **browser-use/workflow-use** (AGPL-3.0): AGPL-3.0: no code may be copied into the extension; concepts only.
- **ComeOnOliver/skillshub** (MIT): OPTIONAL ONLINE DISCOVERY PROVIDER WITH FALLBACK AND CACHE.
- **browserbase/browse-plugin** (no licence found): STUDY CATALOG AND DISCOVERY; NO CLOUD DEPENDENCY.
- **ScottSyms/Browser-Agent** (no licence found): IDEAS ONLY UNTIL CODE LICENSE CONFIRMED.
- **cloudflare/agent-skills-discovery-rfc** (Apache-2.0): EXPERIMENTAL OPT-IN WELL-KNOWN RESOLVER.
- **esterhuizen/opensidekick** (MIT): COMPARE CONTROL AND RECORDING FEATURES; ADAPT MISSING PRIMITIVES.
- **fullselfbrowsing/FSB** (MIT): SELECTIVELY PORT MISSING PRIMITIVES.
- **sickn33/agentic-awesome-skills** (MIT): TRUSTED SUBSET ON DEMAND; LICENCE PER SKILL.
- **coreyhaines31/marketingskills** (MIT): TASK-SCOPED PROFESSIONAL EXPERTISE ON DEMAND.
- **remotion-dev/skills** (no licence found): MEDIA WORKER GUIDANCE ON DEMAND.

## Not yet measured

No row has a before/after performance measurement. The only live DeepSeek evidence is in `LIVE-TRIAL-20261120.md` and `LIVE-RUNS-20261120-B.md` (one TraceDraw pass, one fail, one public form pass).
