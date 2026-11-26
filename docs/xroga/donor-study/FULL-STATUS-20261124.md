# Donor repositories: full status of all 72 (2026-11-24)

Plain answer: **no repository is yet fully used.** "Fully complete" means every capability, skill and tool the repository offers that helps Xroga is in the product and tested. Thirteen repositories have working code in Xroga, each only partly mined; the rest are not started. The work goes in batches of ten rows of the ledger: study at source level, clone at the pinned commit, integrate, test, record. Batch 1 (rows 1 to 10) has its first pass done and a second pass owed.

| State | Repos |
|---|--:|
| NOT STARTED (links and licences recorded only) | 52 |
| PARTLY IN CODE | 13 |
| ALREADY COVERED / NOTHING TO TAKE (as far as read) | 4 |
| READ, NOTHING TAKEN YET | 2 |
| BLOCKED | 1 |

## Every repository

| # | Batch | Repository | Licence | State | In Xroga now |
|--:|--:|---|---|---|---|
| 1 | 1 | nanobrowser/nanobrowser | Apache-2.0 | ALREADY COVERED / NOTHING TO TAKE (as far as read) | NOTICE |
| 2 | 1 | vercel-labs/agent-browser | Apache-2.0 | PARTLY IN CODE | src/browser-control/core/tools/observe.ts (screenshot ifChanged) |
| 3 | 1 | dylansantwani/openbrowser | MIT | PARTLY IN CODE | src/agent/macro-tool.ts; src/agent/batch-plan.ts |
| 4 | 1 | Tencent/BrowserSkill | MIT | PARTLY IN CODE | src/browser-control/core/tools/extract-rows.ts; probe extractRows |
| 5 | 1 | browser-use/browser-harness | MIT | NOT STARTED (links and licences recorded only) |  |
| 6 | 1 | alibaba/page-agent | MIT | ALREADY COVERED / NOTHING TO TAKE (as far as read) | fixtures/pages/clickable-zoo.html; src/background/scenarios/clickable-zoo.ts |
| 7 | 1 | derpx06/webgenie | Apache-2.0 | NOT STARTED (links and licences recorded only) |  |
| 8 | 1 | openbrowse-ai/openbrowse | MIT | NOT STARTED (links and licences recorded only) |  |
| 9 | 1 | browserbase/stagehand | MIT | PARTLY IN CODE | src/browser-control/core/tools/extract-rows.ts (the extract idea) |
| 10 | 1 | browser-use/browser-use | MIT | PARTLY IN CODE | src/agent/data-ops.ts working set; src/browser-control/core/tools/web-search.ts; src/agent/search-redirect.ts |
| 11 | 2 | ChromeDevTools/chrome-devtools-mcp | Apache-2.0 | NOT STARTED (links and licences recorded only) |  |
| 12 | 2 | microsoft/playwright-mcp | Apache-2.0 | NOT STARTED (links and licences recorded only) |  |
| 13 | 2 | microsoft/playwright | Apache-2.0 | ALREADY COVERED / NOTHING TO TAKE (as far as read) |  |
| 14 | 2 | AliSharjeell/OpenBUA | none found | NOT STARTED (links and licences recorded only) |  |
| 15 | 2 | anomalyco/browse | MIT | ALREADY COVERED / NOTHING TO TAKE (as far as read) |  |
| 16 | 2 | uiuing/browser-agent | MIT | PARTLY IN CODE | src/agent/failure-diagnosis.ts; src/agent/progress-tracker.ts; src/agent/loop.ts (errorCode into the tracker) |
| 17 | 2 | jeet-dhandha/agent-webbridge | MIT | NOT STARTED (links and licences recorded only) |  |
| 18 | 2 | pinchtab/pinchtab | MIT | NOT STARTED (links and licences recorded only) |  |
| 19 | 2 | motailab/open-browser-agent | Apache-2.0 | NOT STARTED (links and licences recorded only) |  |
| 20 | 2 | web-infra-dev/midscene | MIT | NOT STARTED (links and licences recorded only) |  |
| 21 | 3 | microsoft/OmniParser | CC-BY-4.0 | NOT STARTED (links and licences recorded only) |  |
| 22 | 3 | bytedance/UI-TARS | Apache-2.0 | NOT STARTED (links and licences recorded only) |  |
| 23 | 3 | bytedance/UI-TARS-desktop | Apache-2.0 | NOT STARTED (links and licences recorded only) |  |
| 24 | 3 | A9T9/RPA | NOASSERTION | NOT STARTED (links and licences recorded only) |  |
| 25 | 3 | fabricjs/fabric.js | MIT | NOT STARTED (links and licences recorded only) |  |
| 26 | 3 | konvajs/konva | NOASSERTION | NOT STARTED (links and licences recorded only) |  |
| 27 | 3 | tracedraw/tracedraw | NOASSERTION | PARTLY IN CODE |  |
| 28 | 3 | agentskills/agentskills | Apache-2.0 | PARTLY IN CODE | src/agent/skill-md.ts; src/agent/skill-catalog.ts (find_skill, read_skill) |
| 29 | 3 | anthropics/skills | none found | NOT STARTED (links and licences recorded only) |  |
| 30 | 3 | modelcontextprotocol/servers | NOASSERTION | NOT STARTED (links and licences recorded only) |  |
| 31 | 4 | Shopify/agent-skills | none found | NOT STARTED (links and licences recorded only) |  |
| 32 | 4 | Shopify/Shopify-AI-Toolkit | MIT | NOT STARTED (links and licences recorded only) |  |
| 33 | 4 | googleads/google-ads-api-developer-assistant | Apache-2.0 | NOT STARTED (links and licences recorded only) |  |
| 34 | 4 | googleads/google-ads-python | Apache-2.0 | NOT STARTED (links and licences recorded only) |  |
| 35 | 4 | meta/facebook-python-business-sdk | NOASSERTION | NOT STARTED (links and licences recorded only) |  |
| 36 | 4 | mozilla/readability | Apache-2.0 | NOT STARTED (links and licences recorded only) |  |
| 37 | 4 | apify/crawlee | Apache-2.0 | NOT STARTED (links and licences recorded only) |  |
| 38 | 4 | microsoft/markitdown | MIT | NOT STARTED (links and licences recorded only) |  |
| 39 | 4 | docling-project/docling | MIT | NOT STARTED (links and licences recorded only) |  |
| 40 | 4 | ServiceNow/BrowserGym | NOASSERTION | NOT STARTED (links and licences recorded only) |  |
| 41 | 5 | ServiceNow/AgentLab | NOASSERTION | NOT STARTED (links and licences recorded only) |  |
| 42 | 5 | Aepzie/cutline | MIT | NOT STARTED (links and licences recorded only) |  |
| 43 | 5 | heychintan/openreel | MIT | NOT STARTED (links and licences recorded only) |  |
| 44 | 5 | openfilm/openfilm | MIT | NOT STARTED (links and licences recorded only) |  |
| 45 | 5 | opencutvideo/Opencut | none found | NOT STARTED (links and licences recorded only) |  |
| 46 | 5 | Panoptik-Studio/Panoptik | AGPL-3.0 | NOT STARTED (links and licences recorded only) |  |
| 47 | 5 | motion-canvas/motion-canvas | MIT | NOT STARTED (links and licences recorded only) |  |
| 48 | 5 | ffmpegwasm/ffmpeg.wasm | MIT | NOT STARTED (links and licences recorded only) |  |
| 49 | 5 | Vanilagy/mediabunny | MPL-2.0 | NOT STARTED (links and licences recorded only) |  |
| 50 | 5 | mifi/editly | MIT | NOT STARTED (links and licences recorded only) |  |
| 51 | 6 | lovell/sharp | Apache-2.0 | NOT STARTED (links and licences recorded only) |  |
| 52 | 6 | visioncortex/vtracer | MIT | NOT STARTED (links and licences recorded only) |  |
| 53 | 6 | xinntao/Real-ESRGAN | BSD-3-Clause | NOT STARTED (links and licences recorded only) |  |
| 54 | 6 | ManimCommunity/manim | MIT | NOT STARTED (links and licences recorded only) |  |
| 55 | 6 | eracle/OpenOutreach | Apache-2.0 | NOT STARTED (links and licences recorded only) |  |
| 56 | 6 | Mahanaicoach/google-maps-scraper-kit | AGPL-3.0 | NOT STARTED (links and licences recorded only) |  |
| 57 | 6 | speedyapply/JobSpy | MIT | NOT STARTED (links and licences recorded only) |  |
| 58 | 6 | browser-use/workflow-use | AGPL-3.0 | NOT STARTED (links and licences recorded only) |  |
| 59 | 6 | alibaba/qz-browser-agent | Apache-2.0 | PARTLY IN CODE | src/agent/site-context.ts; src/agent/skill-catalog.ts |
| 60 | 6 | browsing-skills/browsing-skills | MIT | PARTLY IN CODE | src/agent/site-actions.ts |
| 61 | 7 | ComeOnOliver/skillshub | MIT | BLOCKED | src/agent/online-skills.ts |
| 62 | 7 | vercel-labs/skills | MIT | NOT STARTED (links and licences recorded only) |  |
| 63 | 7 | browserbase/browse-plugin | none found | NOT STARTED (links and licences recorded only) |  |
| 64 | 7 | ScottSyms/Browser-Agent | none found | NOT STARTED (links and licences recorded only) |  |
| 65 | 7 | cloudflare/agent-skills-discovery-rfc | Apache-2.0 | PARTLY IN CODE | src/agent/well-known-skills.ts |
| 66 | 7 | esterhuizen/opensidekick | MIT | READ, NOTHING TAKEN YET |  |
| 67 | 7 | fullselfbrowsing/FSB | MIT | READ, NOTHING TAKEN YET |  |
| 68 | 7 | sickn33/agentic-awesome-skills | MIT (code), CC BY 4.0 (content) | PARTLY IN CODE | src/agent/aas-skills.ts; scripts/build-aas-index.mjs; src/agent/data/aas-index.json; loop.ts (find_skill, read |
| 69 | 7 | coreyhaines31/marketingskills | MIT | PARTLY IN CODE | src/agent/skills.ts (google-ads, meta-ads: default audits, Andromeda-era Meta structure, budget steps, univers |
| 70 | 7 | amzn/selling-partner-agentic-toolkit | NOASSERTION | NOT STARTED (links and licences recorded only) |  |
| 71 | 8 | remotion-dev/skills | none found | NOT STARTED (links and licences recorded only) |  |
| 72 | 8 | VelvetAbyss/browser-agent-recorder | MIT | NOT STARTED (links and licences recorded only) |  |

## Batches

- Batch 1 (rows 1 to 10): 10 repositories, 5 partly in code. First pass done; second pass owed.
- Batch 2 (rows 11 to 20): 10 repositories, 1 partly in code. Next.
- Batch 3 (rows 21 to 30): 10 repositories, 2 partly in code. Waiting.
- Batch 4 (rows 31 to 40): 10 repositories, 0 partly in code. Waiting.
- Batch 5 (rows 41 to 50): 10 repositories, 0 partly in code. Waiting.
- Batch 6 (rows 51 to 60): 10 repositories, 2 partly in code. Waiting.
- Batch 7 (rows 61 to 70): 10 repositories, 3 partly in code. Waiting.
