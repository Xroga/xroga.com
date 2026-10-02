# Xroga UI/UX Step 1: Unified Workspace Foundation

This UI/UX migration is separate from Xroga's existing platform Steps 1–7. It preserves the production execution, runtime, verification, persistence, recovery, and delivery architecture. Its scope is the frontend contract between those systems and the workspace presentation layer.

## Repository-aware migration map

| Desired capability | Existing implementation | Files | Decision | Risk | Validation |
| --- | --- | --- | --- | --- | --- |
| Conversation runtime | TerminalChatContext and persisted messages | `frontend/src/context/TerminalChatContext.tsx` | PRESERVE | High | Existing frontend suite |
| Prompt composer | Current chatbar and attachment flow | terminal chatbar components | PRESERVE | High | Existing prompt tests/build |
| SSE transport | `streamSwarmExecute` and `/api/swarm/execute` | `frontend/src/lib/api.ts`, `backend/src/routes/swarm.ts` | PRESERVE | High | Stream/reconnect tests |
| Agent V2 transport | Public `SoftwareRunEvent` payloads | `frontend/src/lib/swarm.ts` | ADAPT | Medium | Canonical adapter tests |
| Run persistence/reconnect/resume | Durable run record, sequence replay, resume | current API/context/recovery modules | PRESERVE | High | Existing recovery suites |
| Canonical events | Terminal events already normalize current streams | `terminalEvent*`, `xrogaEvent*` | EXTEND | Medium | Schema and adapter tests |
| Live activity | Real append-only terminal rows | `TerminalLiveActivity.tsx` | REFACTOR | Medium | Activity and UI contract tests |
| Message rendering | Markdown and plain response renderers | current response components | PRESERVE | Medium | Markdown/plain response tests |
| Feature outputs | Historical feature output switch | `FeatureOutputView.tsx` | ADAPT | High | Legacy adapter tests |
| UniversalOutput | MIME-based result envelope | `universalOutput.ts` | ADAPT | Medium | Output adapter tests |
| Engineering artifacts | Verified build result contract | `engineeringArtifact.ts` | ADAPT | High | Engineering artifact tests |
| Project state/files/code/changes | Canonical Zustand project workspace | `useProjectWorkspaceStore.ts` | PRESERVE | High | Snapshot/delete/rename tests |
| Terminal | Existing command evidence and workspace tab | `DevWorkspacePanel.tsx` | PRESERVE | High | Workspace tests |
| Preview | Sandbox, runtime, persisted and GitHub recovery | `ProjectPreviewDock.tsx` | PRESERVE | High | Preview/runtime tests |
| Deployment | DeliveryState and provider evidence | delivery modules | PRESERVE | High | Delivery tests |
| GitHub/Vercel/Supabase | Existing server-authorized integrations | integration routes/UI | PRESERVE | High | Existing auth/integration tests |
| Evidence | Several real evidence shapes | canonical evidence block | ADAPT | Medium | Evidence schema/link tests |
| Approvals/connections | Existing GitHub/Vercel/repo gates | canonical approval/connection blocks | EXTEND | High | Schema tests; backend remains authority |
| Receipts | Git/deployment evidence | canonical receipt block | EXTEND | High | Receipt validation tests |
| Rollback/history/memory | Existing project and run systems | current backend/frontend modules | PRESERVE | High | Existing Steps 6–7 tests |
| Mobile and themes | Existing responsive shell and four themes | current components and CSS variables | PRESERVE | Medium | Frontend build/UI contracts |
| Copy formatting | Several local copy buttons | `InlineCopyButton.tsx` | EXTEND | Low | Copy interaction contract test |
| Accessibility | Existing semantics plus focused live regions | new renderers/activity | EXTEND | Medium | Source and build validation |
| Testing | Node/tsx regression suites | frontend and backend tests | EXTEND | Low | Full repository gates |

## Implemented flow

```text
Existing swarm SSE + Software Agent V2 events
  -> terminalEventAdapter
  -> XrogaCanonicalEvent
  -> existing append-only TerminalRunState
  -> TerminalLiveActivity

Existing UniversalOutput / EngineeringArtifact / supported historical output
  -> compatibility adapters
  -> XrogaBlock[]
  -> renderer registry
  -> current workspace UI
```

AG-UI, assistant-ui, A2UI, office suites, editor frameworks, graph libraries, and terminal emulators are not dependencies of UI/UX Step 1. A future transport may implement `XrogaCanonicalEventAdapter` without changing UI components.

## Baseline

Before edits, backend and frontend tests passed, both production builds passed, resilience checks passed, project check scored 100/100, and lint passed with existing warnings. The only contract defect found in the requested scope was the development API fallback using port 4000 while the backend and repository instructions specify port 8080.
