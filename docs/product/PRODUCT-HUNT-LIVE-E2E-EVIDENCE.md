# Product Hunt live end-to-end evidence

No secret values are recorded. “Live” means the normal production Workspace and external provider UI were observed, not inferred from source.

## E2E-REPO-001 — focused existing-repository edit

| Field | Evidence |
| --- | --- |
| Prompt ID | E2E-REPO-001 |
| Persona | Developer making a narrowly scoped Python change |
| Prompt | `/build Update only normalize.py. Preserve the existing normalize(items) function unchanged. Add exactly this public function: def normalize_whitespace(text: str) -> str: return " ".join(text.split()) Do not modify or remove any other file. Run the existing pytest suite and push a review branch only. Do not merge and do not deploy.` |
| Expected result | One-file edit; existing function preserved; tests run; review branch and commit; no merge/deploy |
| Selected capability | Universal repository implementation and GitHub publication |
| Project | Disposable private repository `Xroga/xroga-universal-e2e-20260911-b92bf7`, source branch `feature/semantic-proof` |
| Files read | Five-file repository snapshot (Workspace evidence) |
| Files changed | Authoritative GitHub diff: `normalize.py` only |
| Commands/checks | Workspace recorded deterministic validation and review before publication; exact command output was not exposed in the final card |
| Repair/retries | Two earlier runs failed closed at review; the third completed after reviewer availability/recovery |
| Preview | Not applicable to this Python library fixture |
| GitHub | Review branch `xroga/264411c8-b6c5-4684-b7fe-117ee8fdbccf`; commit `ab260dc78cd46a343798e3e7f447cb58a055b931`; pull request #1 |
| Deployment | Correctly not attempted |
| Duration | Not recoverable precisely from the rendered record; not fabricated |
| Cost/usage | Not shown per run in the rendered record; not fabricated |
| Visible result | Workspace said “Verified” and showed the remote SHA, but incorrectly listed all five snapshot files as changed |
| Verdict | FAIL for artifact accuracy; PASS for repository scope and write integrity |
| Evidence | [GitHub commit](https://github.com/Xroga/xroga-universal-e2e-20260911-b92bf7/commit/ab260dc78cd46a343798e3e7f447cb58a055b931) and authenticated Workspace DOM snapshot captured 2026-09-12 |

## Pending production retest

After the reporting fix is deployed, run a semantically different focused edit in the disposable repository. Passing evidence requires Workspace and GitHub to agree on the changed path count and names. No test may merge or deploy the fixture.

## E2E-CHAT-001 — direct conceptual question in a connected project

| Field | Evidence |
| --- | --- |
| Prompt ID | E2E-CHAT-001 |
| Persona | Developer asking a normal conceptual question while a repository remains selected |
| Prompt | `What is the difference between optimistic and pessimistic locking? Answer in three concise bullets. Do not change this project.` |
| Expected result | Three concise bullets; no Builder, file, Preview, GitHub, or deployment action |
| Visible result | Three relevant bullets covering mechanism and trade-off; project header remained stable; no execution artifact appeared |
| Duration | 25.4 seconds to completed response; acknowledgement timing was not captured reliably |
| Verdict | PASS |
| Evidence | Authenticated production Workspace DOM snapshot, 2026-09-12 |

## E2E-WEB-001 — current official technical fact

| Field | Evidence |
| --- | --- |
| Prompt ID | E2E-WEB-001 |
| Persona | Developer checking a current runtime release |
| Prompt | `As of September 2026, what is the current Node.js LTS line? Search the web, cite the official Node.js release page, and answer concisely. Do not change project files.` |
| Expected result | Short current answer from official Node.js evidence; no project mutation |
| Visible result | Correctly identified Node.js 24.x “Krypton” and v24.20.0 with nodejs.org citations; explicitly stated no files changed. The response ignored “concisely” and expanded into a long report and table. |
| Timing | Prompt visible in 0.53 seconds; completion in approximately 32.1 seconds |
| Verdict | FAIL for instruction-following; PASS for retrieval freshness, source authority, and no-mutation boundary |
| Evidence | Authenticated production Workspace DOM snapshot with official nodejs.org source cards, 2026-09-12 |
