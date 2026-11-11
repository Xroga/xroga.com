# Xroga live activity implementation and verification

Workspace extends the existing Swarm and Software Agent V2 adapters. The canonical event retains its run, event and sequence identities and carries the original Software Agent V2 event category when present. Events for the same command use its command ID. Replay of a stable event ID is ignored, and generic messages with the same label are no longer merged as though they were one operation. Command output remains attached after completion, with a bounded log, the runtime exit code and the existing redaction applied on receipt and reopen.

An incoming answer chunk changes the inline status on the existing Swarm streaming path. The marker records receipt of answer text without retaining another copy of that text. Ordinary Phase 1 JSON calls do not expose a provider lifecycle or incremental response. Native OpenUI continues to withhold unvalidated model output until it passes the existing presentation and accounting boundary. Activity grouping stays memoized while the elapsed clock ticks. Expanded history renders up to 25 groups and 25 entries per group at a time. The existing saved conversation reader retains its 80-row cap.

Background recovery uses the existing authorized run endpoint. It scopes browser-local pending entries to the signed-in account and saves each replay batch on the matching assistant message. The first poll after refresh rebuilds from the server's retained events, then polling uses the recorded cursor. Pending entries from older builds without a saved owner are excluded from automatic recovery. Existing saved conversations remain readable.

| Reference | Pinned source and license | Xroga equivalent and decision | Verification |
| --- | --- | --- | --- |
| TUFFUI | `dec908d8`, MIT | Use status, tool block, terminal and checkpoint timeline patterns in the existing activity UI. Background agents, file changes and approvals use existing Xroga runtime surfaces. Full workflow screens are outside this scope. | Command details and chronology covered by the terminal tests. |
| assistant-ui | `316fb062`, MIT | Adapt the small disclosure and separate stream/tool parts. Keep Xroga message state, its keyboard controls and authorized summaries. | Local browser disclosure and command result tests. |
| CopilotKit and AG-UI | `60f468ca`, MIT | Keep Xroga's typed events, IDs, state and approval adapters. Reuse the distinction among tool start, output and terminal state. Leave the existing OpenUI runtime in place. | Source-level deduplication and failure checks. |
| LangStage | `f02f8fb6`, MIT | Use progressive history, interruption and milestone disclosure patterns with existing conversation history. Recovery remains with Xroga's existing run controls. | Terminal reconnect and stopped-run tests. |
| Vercel AI Elements | `ca8be600`, Apache 2.0 | Tool, terminal, task, plan, checkpoint and reasoning disclosures are useful references. The checked package expects React 19 and upstream shadcn components. Xroga uses React 18 and existing controls. Vercel has directed users to the [maintained shadcn patterns](https://ui.shadcn.com/docs/ai-elements). | Source and package inspection. No upstream code or package was imported. |
| Xroga OpenUI, Open Intelligent UI and CopilotKit presentation | PR #951 base | Existing renderer still owns the answer, rich artifacts and validation. The activity view remains a sibling. | Workspace component check and existing rendering tests. |

Current provider wait, screenshot, source reading, file diff, approval decisions and checkpoint summaries can only be shown if their corresponding trusted runtime produces a public event or scoped evidence. This change does not create new receipts, expose raw private reasoning or add model requests.

The Chrome proposal is for review against Claude's Browser Operator PR #960. Cursor-to-action verification belongs in that owner branch. The separate Chrome commit from the prior pass, `b910ff401`, implements status and history from existing tool rows. No source was written to Claude's active worktrees.

Local verification includes 89 focused Workspace tests, including a real local subprocess that printed 42 and exited 7, whose output, exit status and failure survived overlapping replay. The Chrome component browser harness uses controlled event input at narrow widths. Source and scope of authenticated CI, hosted execution, performance and screenshots are reported separately from controlled tests. A clean production type check and build require the complete dependencies used by CI.

Rollback is to revert the stacked Workspace activity commits and, if separately adopted, the Chrome UI commit. There is no migration. Deploy only after the actual candidate has passed the authorized release process.
