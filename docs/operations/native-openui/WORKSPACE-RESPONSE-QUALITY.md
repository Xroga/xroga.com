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

## Hosted architecture failure and corrective gate

The grouped staging run on `2c002362a7e6979f8b4ae0a13023eb239775646d` stopped on the first prompt. The API returned a complete native program. Cloud Run returned HTTP 429 for a frontend JavaScript chunk 606 ms after the answer was returned because it could not allocate an available instance. The test frontend was limited to one instance and one request per instance. The exact saved program passed the validator, and local Chrome rendered its nested table and connected diagram. [Cloud Run request-abort guidance](https://docs.cloud.google.com/run/docs/troubleshooting#abort-request).

Use a maximum of one frontend instance with concurrency eight for the next private acceptance candidate. Keep the existing API concurrency, request guards, instance limits, model cap and prompt sequence. Before enabling the provider, replay a known architecture answer through the normal signed-in hosted composer with controlled transport. Verify the native chunk, connected diagram, nested table and code, then record statuses for browser JavaScript assets. A missing or failed native asset stops the window before any inference. The paid check starts only after this preflight and the existing account, storage, isolation and ledger checks pass.

The native Workspace loader also reuses the existing one-time static asset retry. It retries only the renderer import. The answer remains readable during a persistent failure and the loader never resubmits the prompt. The authenticated browser regression exercises both a single HTTP 429 and a persistent chunk failure.

The captured prose also incorrectly said that a membership-only `WITH CHECK` prevents moving a row to another tenant. It checks the proposed row. Both tenant memberships can be valid for the same user, so immutability requires a separate column privilege or database trigger. The prompt now states this distinction and deterministic review flags the unsupported claim even in example comments. [PostgreSQL policy semantics](https://www.postgresql.org/docs/current/sql-createpolicy.html).

The corrected hosted run on `2cfe099146f49a67843a810c164b4b8e14aef3e9` rendered the provider-disabled architecture replay. The frontend served all 70 observed JavaScript and CSS assets successfully at concurrency eight. The first fresh DeepSeek response then failed the authority check on a presentation reference. Workspace preserved and reopened the readable answer, and the stop gate withheld the remaining prompts. The raw rejected program was not retained.

Recovery now checks the validated reachable program first. If an unused declaration is the only problem, the full layout remains. For a missing or cyclic reference in a displayed section, bounded recovery omits only the affected branch and records a partial presentation. The remaining program still passes all authority, schema and factual checks, and the original readable answer remains available. Diagnostics distinguish missing and cyclic references without including identifiers or model text. A future live result still needs separate acceptance.

The hosted reference-recovery run on `e7bdb71bfa17c263058518fffb8256f25d104ecc` passed its provider-disabled replay and observed successful delivery for 71 assets. The fresh answer then failed with a nested `Diagram` type mismatch. The rejected field and value were not retained. The table and code survived, and the first-case stop withheld the remaining prompts.

Workspace now normalizes exact string levels `"0"` through `"5"` and null optional diagram fields before revalidation. The admission check and React renderer share the same rules for node IDs, peer counts and edge endpoints. An unrenderable diagram cannot satisfy a requested graph, and validated sibling components remain available. Diagnostics can report allowlisted diagram field names without recording input values, IDs or positions. Offline checks exercise a representative malformed diagram through assembly, browser rendering and the existing Share snapshot format. This does not reproduce the undisclosed live field value.

The hosted run on `2af08d724ad22d1f2301d2a472e0e916323b99bb` passed the authenticated provider-disabled replay with 69 successful assets. The first fresh answer then reported a type mismatch at `/nodes/*/tone`. Workspace retained the table, code and readable text, and the stop gate withheld the other three prompts after verifying Save, Copy and Reopen. The diagnostic excluded the rejected value.

An unsupported optional tone now uses the renderer's neutral default. Recognized tones and all validated graph labels and relationships are preserved. The normalizer and renderer share the same tone list and Workspace revalidates the full repaired answer. The regression uses a representative unsupported tone to verify the reported field and preserves the diagram across Share. Hosted verification on `e56e7a332ee5c3e7f1db2257dfd18ee231d8be0c` passed the provider-disabled replay and a fresh six-node, five-link architecture answer. Its code and exact program persisted through Copy and Reopen.

The same run stopped on a fresh concise answer that correctly explained the seasons but measured Earth's axial tilt from the orbital plane. The native prompts now require quantitative details to pair the value with its unit and frame of reference. An explicit factual check catches the captured incorrect spin-axis claim in plain text and native components. Accurate descriptions of the equatorial plane, the spin axis's complement, and explanations without angles still pass. [NASA reference](https://pwg.gsfc.nasa.gov/stargaze/Sseason.htm).

The closed-data monthly comparison also recognizes prompts that ask for the largest dollar and percentage gains and say to use only the provided values without repeating the term month-over-month. The exact revenue acceptance wording now exercises deterministic verification of all six user values and the separate gain rankings. Fresh concise, revenue and file-backed calculator acceptance and the decoder rollback drill remain pending.
