# Live run with the real model, 2026-11-26

What ran: the product build of the extension (current branch, commit `debaf824e`) against the staging backend (`xroga-api-universal-staging`, tag `browser-op-1110`, staging Supabase project `xroga-p3-staging-20261024`), with one throwaway staging user, the real Xroga model (DeepSeek through Zurelay, vision on for staging), in a headful Chrome. The model chose every step. Pool skills, `read_pdf`, `ocr`, `parse_screen` and the rest were available; the model used what it judged useful.

Earlier note corrected: this run first looked impossible because the wrong address was probed; the staging revision with the operator routes had been there all along.

| Task | Result | Time, turns | Tools the model used | Checked by hand against the answer |
|---|---|---|---|---|
| **L1 PDF paper**: title, page count, big-Transformer English-to-German BLEU with page and table, training FLOPs | done | 19 s, 3 | `read_pdf` ×2, `done` | Title and 15 pages, 28.4 BLEU, Table 2 on page 8, 2.3e19 FLOPs: all as in the paper. It also flagged an inconsistency in the paper (French BLEU 41.8 vs 41.0 in the text). |
| **L2 Wikipedia multi-hop** across two tabs | done | 39 s, 6 | `snapshot`, `tabs`, `read` | Guido van Rossum, first appeared 20 February 1991, born 31 January 1956 in The Hague; Python 3.15.2 from the infobox, corroborated in the body; preview 3.16.0a1 correctly kept apart. |
| **L3 Excalidraw** (canvas app): rectangle, ellipse, arrow | done | 134 s, 12 | `screenshot`, `batch`, `press` | Three shapes drawn; checked by screenshots, by clicking each shape and reading which controls the app offers per type (the arrow showed arrowhead controls), and by Select-all. A reasonable check, not a count read from the app. |
| **L4 web form**: every field, submit, read confirmation | done | 26 s, 4 | `read`, `fill_form` | Confirmation "Form submitted / Received!"; the submitted address shows every value. |
| **L5 pricing comparison** of Asana, Trello, monday.com on their own pages, in parallel | done | 132 s, 10 | `plan`, `tabs`, `read`, `find`, `screenshot` | Cheapest paid plan, annual price, free limits, top-plan feature and source for each; said plainly that Enterprise tiers are quote-only and that monday.com shows a promo and a 10-seat setting. |
| **L6 GitHub research**: latest release, three most recently merged PRs, open issues labelled bug | done | 316 s, 25 | `navigate`, `read`, `http_get`, `delegate`, `plan` | v1.65.1 published 2026-11-13 21:46:58Z (cross-checked in the page and the public API); three merged PRs with authors and merge times; **said that the repository has no label named bug, so 0 is not a real count**, rather than reporting 0 as a figure. |

Not measured: a with and without skills comparison; success rate over many runs (six tasks is a first sample, all six completed); cost (model spend was a few minutes of a flash-class model per task).

## Cleanup (done)
- The throwaway user, its identity row and every row the backend created for it were deleted from the staging database (verified: 0 users left).
- The `browser-op-1110` tag is back on its original revision (`xroga-api-universal-staging-chk-554bf2cdb`), whose allowlist is the original three ids.
- The temporary revision `xroga-api-universal-staging-00184-vuf` carries no traffic and no tag but cannot be deleted while it is the newest revision; it is scaled to zero and holds the deleted user's id in its allowlist. The next staging revision will let it be removed.
