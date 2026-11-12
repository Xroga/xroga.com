# Workspace response reliability

Authenticated Workspace keeps one automatic native response path for eligible DeepSeek turns. The existing planner and canonical ledger remain responsible for routing and accounting. Earlier conversations and unsupported routes keep their compatible text readers. Activity and execution events stay separate from final answer presentation.

## Failure boundaries

| Failure | Behavior |
| --- | --- |
| Missing or wrapped native separator | Separate recognizable transport from prose, preserve ordinary fenced programming examples, and send the candidate program through the existing validator. |
| Unknown or unsafe structure | Preserve readable prose. The existing bounded recovery can retain independent valid sections when the authority and evidence checks allow it. |
| Requested chart, table, diagram or calculator omitted | Record an incomplete presentation with bounded diagnostic categories. Keep valid text and independently accepted components. A calculator needs a rendered control whose state is read by a result. |
| Provider output limit | Retain the readable portion and report the existing partial status. |
| Historical native source text contains presentation syntax | The Workspace answer and clipboard use the readable projection. |
| Native shared program cannot be validated | Serve the readable projection through the existing Share access checks. Ordinary JSON remains valid user content. |
| Native asset fails to load | The existing local error boundary displays the readable answer. The authenticated regression blocks the real asset, checks Copy and verifies a reload restores the interactive answer. |

## Verification layers

- The offline assembly tests cover alternative transports, every character prefix of a marked stream, literal Markdown and code, malformed or incomplete output, omitted visuals, reachable widget coverage and reactive calculator state. They also exercise native Share projection, the earlier chart accuracy guards and the single-call planner settlement path.
- Run `node scripts/verify-native-openui-browser.mjs <evidence-directory>` for the 30-scenario Chrome matrix. It covers five viewport widths and both themes. Assertions include code, math, identifiers, charts, diagram relationships, calculator keyboard and reset behavior, citation navigation and readable fallback. Axe checks exercise the chart and architecture cases. The runner records actual case executions.
- The isolated `Isolated Supabase authenticated browser verification` workflow exercises the normal signed-in composer, attachment handoff, Copy, Share, Refresh, Reopen and account isolation with controlled model transport. The saved-answer test uses an explicit stale transport fixture. The workflow provides no live-model acceptance evidence.

## Hosted and production release

Run the exact frontend and API pair once in a bounded private staging window. Group concise prose, architecture with code and a connected diagram, a numeric series with a chart and table, and the file-backed calculator with keyboard, touch and reset. Verify settled provider receipts, signed access, theme and viewport screenshots, exact persistence, Copy, owner-only Share, Reopen and decoder-compatible recovery. Record a missing required visual separately from a successful rich answer. Use controlled source-backed research evidence until private staging Search storage can be verified.

The previous paid window is closed. A grouped window and a production canary each need their applicable approval. Keep the existing verified frontend, API and canonical Job rollback references until the deployed candidate passes acceptance.
