# Browser Operator v4 directive: gap register and open-source registry, 19 November 2026

Source: `Xroga_Browser_Operator_Complete_Claude_Master_Command_v4_2026-11-19.md` (front matter read in full; the preserved v3/v2 body was not re-read in full this session). The founder's v4 correction takes precedence: browser operation of the user's own logged-in sites needs no MCP or API; media generation without a connected provider is a Workspace concern, not an extension feature.

## 1. What already exists (checked in source, not rebuilt)
- Browser actions through Chrome's debugger: click, hover, drag (including native HTML5 drag interception), scroll, keyboard, fill, upload, dialogs, tabs, wait, observe, screenshot (`browser-control/core/tools`, `interaction/pointer.ts`).
- Click and drag accept `at` fractions inside a known element for canvas pages; the playbooks `design-editor` and `video-editor` exist and already say to work through panels, check results and use `confirm_download`.
- Custom MCP through the existing connector path: server definitions are pinned per tenant (`backend/src/services/integrations/customMcpPins.ts`, stage 1), tools are offered only when pinned and unchanged, calls are digest-bound, writes need approval. Composio connected apps, repository execution, skill inspection, multi-worker scheduling and the cost ledger also exist.

## 2. Built this session
- `find_color` (new, `src/agent/pixels.ts`, wired in `agent/loop.ts` and `extension/run-manager.ts`): a deterministic pixel search for canvas-painted pages. It takes a page screenshot through the existing layer and returns the centre of areas of a colour as fractions of the page, for `at` points. It is not a second model. It is offered only for editor-like tasks (the existing `pointAt` flag), so the base tool catalogue did not grow (the catalogue size test still passes). 4 unit tests. Extension suite: 1260 pass, 4 skipped; typecheck clean.
- A line in the `design-editor` playbook for canvas-only interfaces: read the app's own help for shortcuts, close dialogs with keys, use `find_color`, never click blind, say what could not be done.
- Previously this session (see the handover): isolated pip, licence gate fixes, approval-word hardening, token-before-body for the document route, safer permission save, second-account isolation test.

## 3. Live test: TraceDraw (vector editor), real Chrome, real DeepSeek, staging
Task: close the welcome dialog, create a document, draw one rectangle, fill it red, save an SVG, confirm the red rectangle.
- Result: **not completed; blocked.** TraceDraw is a Rust/WASM app that paints its whole interface on a canvas, so the page has no elements to select. Two runs (before and after `find_color` and the playbook line) read the app's own docs and shortcut table correctly (F6 rectangle), then stopped and reported plainly that nothing could be verified. No false completion was claimed.
- Why it stopped: the model route reads text, not pixels; in the second run the agent reported the page screenshot returned a 0×0 image to `find_color` and that key presses did not register on the canvas. Whether that 0×0 capture is a limit of capturing that WebGPU/WASM canvas, a tab-visibility effect, or a bug in the new tool was **not determined**. `find_color` is therefore unit-tested but **not proven live**.
- What is needed next (no external account): diagnose the 0×0 capture on that page (capture a screenshot of the same tab through the layer and inspect its size and pixels), check how key events reach a focused WASM canvas (the debugger's key dispatch versus the app's own listener), and test `find_color` on a canvas page whose capture works (for example a Fabric.js or Konva demo) to separate tool correctness from this app's behaviour. Until then do not claim vector or video editing in canvas-only apps.
- The DeepSeek route's image understanding is not verified and was not assumed. The backend admits images to the model only through an operator-pinned probe and only when the model spec supports images; this was not changed. Midscene-style screenshot grounding therefore stays research until image support is proven for the sole route.

## 4. Open-source registry (licences read from the GitHub API and licence files on 19 November 2026; keep or reject reasons are engineering judgement)
| Project | Licence (verified) | Activity | Decision |
| --- | --- | --- | --- |
| web-infra-dev/midscene | MIT | active, 15.6k stars | Research only. Its core path needs a vision model; not usable on the text-only route until image support is verified. |
| Tencent/BrowserSkill | MIT | active, 10.6k | Pattern only (borrowed-tab and takeover handling). The extension already has run-owned tab groups, leases and a pause/takeover control. No code taken. |
| dylansantwani/openbrowser | MIT | 0 stars, last push September | Pattern only; too small and quiet to depend on. |
| vercel-labs/agent-browser | Apache-2.0 | active, 52.8k | Pattern only (stable element refs, short observations). Xroga already has refs and diffs. |
| browser-use/browser-harness, browserbase/stagehand | MIT | active | Not integrated; would duplicate the scheduler and the layer. |
| ChromeDevTools/chrome-devtools-mcp, microsoft/playwright-mcp | Apache-2.0 | active | Test tooling only; not a product dependency. |
| tracedraw/tracedraw | MIT OR Apache-2.0 (LICENSE-MIT, LICENSE-APACHE, Cargo.toml) | active, alpha | Used as a live test target (section 3). The API reports NOASSERTION only because there are two licence files. |
| Aepzie/cutline, heychintan/openreel | MIT | 1 and 0 stars; openreel last push August | Test targets for a timeline editor not yet run. Treat as unproven prototypes. |
| openfilm/openfilm, motion-canvas/motion-canvas, mifi/editly | MIT | active (editly last push May 2025) | Candidates for an authorised backend worker that produces a file; not built. |
| fabricjs/fabric.js | MIT | active | Candidate canvas test fixture (section 3, next step); not added. |
| konvajs/konva | MIT (LICENSE file; API shows NOASSERTION) | active | Candidate test fixture; not added. |
| ffmpegwasm/ffmpeg.wasm | MIT wrapper; FFmpeg build licences not reviewed | active | Not in the extension. Backend worker only, after a codec and licence review. |
| Vanilagy/mediabunny | MPL-2.0 | active | Candidate for metadata checks of exported files in a worker; MPL file-level obligations apply. Not added. |
| lovell/sharp, visioncortex/vtracer | Apache-2.0, MIT | active | Candidates for an authorised image worker (resize, crop, vectorise); not built. |
| xinntao/Real-ESRGAN | BSD-3-Clause (repo only) | last push August 2024 | Rejected for now: stale, model weights carry separate terms, needs GPU. |
| manimCommunity/manim | MIT | active | Candidate for a deterministic motion-graphics worker; not built. |
| opencutvideo/Opencut | none found | quiet | Rejected: no licence, so no code may be reused. |
| Panoptik-Studio/Panoptik | AGPL-3.0 (per the directive) | not checked | Rejected for code reuse (strong copyleft). |
Nothing from this list was vendored. The only new code is `pixels.ts`, written here.

## 5. v4 acceptance scenarios: status
| Scenario | Status |
| --- | --- |
| Signed-in site, no MCP, change a draft setting and prove persistence | Partly shown earlier (Notion, Sheets through connected apps, browser read/write on logged-in sites); a GUI-only project edit with reload was not run this session. |
| TraceDraw vector editing with SVG export | **Blocked** (section 3). |
| Complex video editor (Cutline/OpenReel) import, edit, export, inspect | Not run. |
| Logged-in media website with real credits | Not run; needs a consenting test account with credits. Mark external test BLOCKED, browser layer not missing. |
| Workspace separation (plain image/video request with no provider) | Not changed. Workspace generation is a separate roadmap item; not verified against current Workspace code in this session. |
| User-supplied MCP/API (for example Higgsfield `https://mcp.higgsfield.ai/mcp`) | Not run. The existing custom-MCP pin path discovers and pins a tool definition per tenant; connecting a real Higgsfield account and running a generation needs the user's own account and credits. No Higgsfield-specific code exists or was added. |
| Pure non-media tasks (research, SEO, Sheets/API, repo execution, parallel workers, resume, account separation) | Sheets, repo and package runs, account separation re-verified live this session; five- and six-worker runs were verified earlier in the integration branch notes and not repeated today. |
| Speed comparison (p50/p95, model calls, screenshot bytes) | Not run; the Sheets task remains over the 60 s / 3-turn target. No benchmark claim is made. |

## 6. Remaining prerequisites
A consenting test account with media credits (Higgsfield or similar); a decision on whether the sole DeepSeek route may be probed for image input (an operator probe exists); a Workspace owner to decide the native generation route; human security sign-off before launch (unchanged).
