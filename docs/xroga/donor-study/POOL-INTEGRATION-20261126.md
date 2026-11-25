# The skill pool (agentic-awesome-skills), fully integrated, 2026-11-26

Owner request: all of the pool's skills wired into the extension end to end and working, tested locally one by one. Separate from batch 4.

## What was there before
An index of 2,980 skills (id, category, name, a one-line description) ranked on the device, and each skill's text fetched from GitHub when the agent read it. So a skill needed the network and a working GitHub address, was ranked only on a line of text, and nothing proved that each one opened.

## What is there now
| | |
|---|---|
| Pinned commit | `f6f686855a` of sickn33/agentic-awesome-skills (the earlier pin was `a99b3d3b`; the pool has moved on) |
| Skills | **2,800** in the index. 255 of the pool's 3,055 are left out: 151 the pool itself marks "offensive" (attack tooling, never suggested), 104 listed without a skill file |
| Bundled offline | **2,774** skills: each skill's own text, gzip-compressed, in `public/pool/skills.bin` (9.9 MB), read through the extension's own address, unzipped with the browser's gzip, no network |
| Remote by licence | 26 skills whose upstream licence does not allow redistribution (AGPL, GPL, source-available, unknown) are still found and still open, from the pinned commit of the pool; their text is not copied into the extension |
| Ranking | name, category, description and now the skill's own headings (what it really covers); a request of three or more words needs two matching words; common words weigh less than rare ones |
| Files beside a skill (1,233 skills have references, templates, scripts to read) | `read_skill` with `file` fetches one from the pinned commit when the skill points to it; not bundled (86 MB) |
| Safety | the text is third-party data: it informs the work, grants no permission and never runs; skills the pool marks high-impact keep their approval notice |
| Rebuild | `node scripts/build-aas-bundle.mjs <clone of the pool>` rewrites the index and the bundle from any commit |

## Beyond the skill files: the rest of the pool repo
The pool repo is more than its skills; its data folder and docs were read too, and what helps an agent was wired in:
- **Role bundles** (data/bundles.json): after a pool skill is read, the agent is told which other skills belong with it ("Related skills in the same pool bundles").
- **Workflows** (data/workflows.json: ship a SaaS MVP, security-audit a web app, build an AI agent system, QA with browser automation, design a domain core): find_skill shows the matching workflow with its steps and the skill to read at each step.
- **Aliases** (213 renamed skills): an old id still opens the skill it became.
- Read and judged: the pool's security guardrails (offensive skills never run without written authorisation: the extension leaves them out entirely; defensive skills must not upload data without consent: skills here never run anything); its quality bar and skill anatomy (the format Xroga's reader already follows); the web app, plugin and remote-core folders (distribution of the pool to other clients, not content).

## Tested locally, every skill (`src/agent/__tests__/aas-pool-all.test.ts`, no network)
- The bundle is the file the index was built with (sha-256).
- All 26 remote skills have a valid address at the pinned commit.
- **All 2,774 bundled skills open, parse as a skill (name and description) and have a real body.** Finding them exposed that the skill reader refused the YAML 97 of them use (lists written at the left edge, quoted descriptions over several lines, names with an underscore); the reader now accepts those, and only a skill that must be read strictly (site-published ones) is refused for them.
- **Asking in each skill's own words finds it in the first five: 2,800 of 2,800.**
- A skill opens through the path the agent uses (`loadBundledCandidate`).
- Through the agent loop (pool-in-the-loop.test.ts, scripted model, network cut): find_skill offers the right pool skills for a specific task and nothing for a vague one, read_skill opens them from the bundle, and 40 skills spread across the whole file each open through the loop.
- Aliases, bundles and workflows: an old id resolves, related skills are named, a QA request finds the browser-automation workflow, and every skill a workflow names exists.
- Chromium scenario `S4-pool-bundle`: four skills across the file open inside the real extension.

## What this does not prove
That a given skill makes a task better. The pool's quality is its authors'; the extension treats each skill as optional help, and every general tool stays available when no skill fits.
