# Automations & AI Workforce frontend

## Scope and architecture

`/dashboard/automations` now mounts `AutomationsWorkspace` inside the existing authenticated shell and `TerminalChatProvider`. No homepage, chat provider, scheduler, backend route, database policy, or authentication behavior was changed. The original `#workflows`, `#scheduled-tasks`, `#ai-employees`, `#work-packs`, and `#run-history` fragments remain valid. New fragments are `#overview`, `#browser-automation`, `#apps-mcp`, and `#activity`; `#live-activity`, `#apps`, and `#connections` are accepted aliases. Pack/run detail fragments support browser history.

The supplied near-black Super Intelligence screenshot drives the typography, composer, capability cards and restrained icon treatment. Status pills use compact dots and text, with color supplementary to the label. CSS is scoped to this page, including responsive layouts, focus indicators and reduced-motion support.

Selection writes a visible capability chip and editable instructions into the launcher. Enter (Shift+Enter inserts a newline; IME composition is respected) calls the existing `TerminalChatProvider.submit` and navigates to `/workspace`. It does not create a second orchestrator. Merely selecting a card never starts execution.

## Screens and implementation files

All component paths below are under `frontend/src/components/automations/`.

| Screen | Implemented interactions | Files |
|---|---|---|
| Overview | Outcome search, six capability entry points, featured packs, real activity counts, approval-needed work, saved setup and planned schedule summaries | `AutomationsWorkspace.tsx`, `DraftSummary.tsx` |
| Workflows | Lazy-loaded React Flow canvas, template picker, draggable nodes, edge handles, accessible configuration/connection controls, node removal, undo/redo, minimap/zoom, structural validation, local persistence, read-only example journey and workspace handoff | `WorkflowEditor.tsx` |
| Scheduled Tasks | Month navigation, calendar/agenda, date selection, one-time/daily/weekly/monthly drafts, IANA timezone validation, edit/pause/resume/remove, run-once handoff | `Schedules.tsx` |
| AI Employees | Ten role templates, category/search, editable custom employees, assignment workbench, instructions/inputs/deliverables, tool and approval boundaries, related packs, example output structure | `PeopleAndPacks.tsx`, `catalog.ts` |
| Work Packs | Thirteen outcome packs, search/category/availability filters, four-step contents/connections/permissions/review setup, role alternatives, cadence preference, saved setup and full outcome handoff | `PeopleAndPacks.tsx`, `catalog.ts` |
| Browser Automation | Four task templates, validated target URL, three-pane session preview, collapsible evidence, step playback, existing browser-related runs and evidence links | `BrowserStudio.tsx` |
| Apps & MCP | Existing plugin discovery and connection manager, custom MCP manager, five multi-app combinations, capability search and schema/permission inspection | `Connections.tsx`; existing integration components reused unchanged |
| Live Activity / Run History | API-backed status/search filters, refresh and visibility-aware polling, run details, recorded event inputs/outputs, evidence links, usage, cancellation, recorded-conversation restoration | `Activity.tsx`, `evidence.ts` |

`useDrafts.ts` namespaces local drafts by account and schema version, validates persisted data, and reports read/write errors. Drafts are browser-local, not team-shared or server installations. The workflow canvas waits for hydration before initializing its editable graph. Request sequencing prevents stale run detail/history responses replacing newer selections.

## Backend contracts and honest boundaries

| Capability | Existing contract used | Boundary |
|---|---|---|
| Start work | `TerminalChatContext.submit` | Existing auth, billing, capability and approval logic still applies. This change does not promise every requested tool is available. |
| Activity and run evidence | `api.swarm.history`, `getRun`, `cancelRun`; `backend/src/routes/swarm.ts` | Only returned records are displayed. Unknown statuses stay unknown; missing evidence is not synthesized. |
| Recorded conversation | `getRun` returns recorded `messages`; existing `restoreTerminalSession` restores validated user/assistant messages | Disabled when no usable recorded messages were returned. Opening history does not restart execution. |
| Managed apps | Existing `IntegrationsPanel` / `PluginMarketplace`, `xrogaConnect`, native integration APIs | Catalog membership is not a connected account. Existing OAuth and account-specific authorization remain in charge. |
| Custom MCP | Existing `CustomMcpManager` / `xrogaConnect.customMcp` | Cloud remote-server support only; no claim of local STDIO access. |
| Tool inspection | `xrogaConnect.search`, `toolDetails` | Read-only inspection. Sample execution is explicitly unavailable. |
| Workflow deployment | No public workflow lifecycle contract identified | Interactive editable local draft; deployment disabled. Workspace submission sends a proposed plan, not a deployed graph. |
| Schedules | No user-facing schedule CRUD/activation contract identified | Calendar/recurrence previews only. Activation disabled; existing scheduler untouched. |
| Employees / packs | No managed employee or pack-installation lifecycle contract identified | Custom role/setup drafts are useful frontend state; managed activation is disabled. |
| Browser session | No live session/stream/takeover contract exposed to this page | Clearly marked illustrative viewer; pause/takeover disabled. Actual browser outcomes use existing workspace execution and recorded evidence. |

Pack configuration is not an approval to send, publish, spend or change production. Every generated assignment retains verification and explicit-approval boundaries. No sample execution, connection success, installed pack or live screenshot is fabricated.

## Repository and licensing evaluation

Official repository/license pages were researched before selecting dependencies. No application source from the reference products was copied.

| Repository | License / decision |
|---|---|
| [React Flow / xyflow](https://github.com/xyflow/xyflow) | MIT core. Reused `@xyflow/react` **12.12.0** for the canvas; no Pro assets. |
| [FlowGram](https://github.com/bytedance/flowgram.ai) | MIT. Evaluated its richer form/editor framework; not installed because Xroga needs one primary canvas, not two competing frameworks. |
| [OpenBot](https://github.com/CopilotKit/openbot) | MIT template. Studied employee/workbench patterns; did not adopt its agent/runtime stack. |
| [MCPJam Inspector](https://github.com/MCPJam/inspector) | Apache-2.0. Studied capability/schema inspection; reused Xroga's own MCP API/UI instead of shipping another inspector service. |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) | MIT. Evaluated conversation primitives; existing Xroga chat provider already owns execution and restoration, so no second chat runtime was introduced. |
| [Activepieces](https://github.com/activepieces/activepieces) | MIT community core with commercial enterprise exclusions. Studied guided setup only; no enterprise code or orchestrator adopted. |
| [Trigger.dev](https://github.com/triggerdotdev/trigger.dev) | Apache-2.0. Studied execution-history presentation; no scheduling/orchestration replacement. |

React Flow integration follows its [ReactFlow API](https://reactflow.dev/api-reference/react-flow) and [node state documentation](https://reactflow.dev/api-reference/hooks/use-nodes-state). Dependency and lockfile changes are limited to the selected canvas and its dependency tree.

## Verification

- `npm run lint --workspace=frontend`: passes; pre-existing warnings elsewhere. Scoped Automations lint: no warnings/errors.
- Four new unit tests cover complete catalogs, pack context/approval preservation, truthful status mapping, and safe evidence URLs.
- `node scripts/test-automations-ui.mjs`: bundles the actual components with explicit test-only navigation/identity/API boundary fixtures. Checks launcher submission/handoff, nine sections, graph undo/redo/save/reload, schedule persistence, employee creation/assignment, pack setup, combinations, actual tool-discovery client paths, evidence rendering, API failure state, mobile overflow, corrupt storage and account isolation. It does not weaken production auth or call paid execution/OAuth.
- Responsive checks: 320, 390, 768 and 1440 pixels; all nine sections checked at mobile width. Desktop/mobile screenshots were inspected.
- Full frontend suite: **1,127 tests; 1,088 pass; 39 fail**. Failures concern existing homepage, sidebar, composer, popover and SQL source-contract assertions in untouched files. All new Automations tests pass.
- Full application TypeScript check: passes. The homepage component was renamed to `WorkforceStage.tsx` to resolve a Windows case-insensitive collision with `workforce.ts`, with its import and source test updated. Test source is excluded from the application build typecheck; tests still run through their own test runner.
- Production build: `npm run build --workspace=frontend` passed, including compilation, typecheck, and 172 generated static pages.

Live signed-in backend execution, OAuth, connection mutation and billed work were deliberately not exercised by the fixture suite.

Other changed files: `frontend/src/app/(shell)/dashboard/automations/page.tsx`, `frontend/src/components/homepage-next/s02/{WorkforceStage.tsx,Theater.tsx,s02.test.ts}`, `frontend/tsconfig.json`, `frontend/package.json`, root `package-lock.json`, `scripts/test-automations-ui.mjs`, this report. Existing untracked `previews/` was left untouched.
