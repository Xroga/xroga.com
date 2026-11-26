# Live acceptance run on real files and sites, 2026-11-26

What ran: the product build of the extension (commit of this branch after the reader fix) against the staging backend (`xroga-api-universal-staging`, tag `browser-op-1110`), the real Xroga model (DeepSeek through Zurelay), one throwaway staging user, headful Chrome. The model chose every step. All tasks use public sites and files on the internet; none uses a local server. The tasks and scorers are `apps/xroga-browser-extension/fixtures/acceptance/` (answers were checked by hand against the sources first).

| Task | Source | Result | Time, turns | Tools used |
|---|---|---|---|---|
| R1 CSV: best month 1960, July difference | people.sc.fsu.edu airtravel.csv | PASS 1.00 | 12.5 s, 2 | `http_get` |
| R2 Excel: headings and number of data rows | freetestdata.com 100 KB xlsx (2,721 data rows, blank rows below) | PASS 1.00 (after fix below) | 22.6 s, 3 | `read_file` |
| R3 PowerPoint: slide count, title, subtitle | python-pptx test.pptx on GitHub | PASS 1.00 (after fix below) | 14.9 s, 2 | `read_file` |
| R4 Essay: title, date, three qualities | paulgraham.com/greatwork.html | PASS 1.00 | 18.6 s, 2 | `find`, `read` |
| R5 Page data: social links and RSS feed titles | python.org | PASS 1.00 | 171.5 s, 17 | `read`, `find`, `http_get`, `snapshot`, others (did not choose `read` format `data`) |
| R6 Endless list: total and last author | quotes.toscrape.com/scroll | PASS 1.00 (100 quotes, George R.R. Martin) | 97.3 s, 10 | `scroll` (to the end), `find`, `read` |

## A real defect this run found, fixed

The first pass on R2 took 658 s and 48 turns: `read_file` threw on the real Excel file and the model worked around it through Microsoft's online viewer. Cause: the XML reader took the first child of a document as its root, but real files have a newline after the `<?xml ?>` declaration (a text child), which no hand-made fixture had. The same fault broke PowerPoint (11 turns) and every package relationship file. Fixed in `office-read.ts` (`relMap` takes the first element). A second real-file difference was fixed in the CSV reader: `"Month", "1958"` (a space before a quote) kept the quotes. Both have regression tests. Re-run on the fixed build: R2 22.6 s, 3 turns; R3 14.9 s, 2 turns.

## What it did not prove

- Six tasks, one run each: a first sample, not a success rate.
- The press-and-hold control (`holdMs`) is tested only on a fixture page in Chromium; no public page with a hold button was found that is safe to automate.
- The model did not choose `read` format `data` for R5 (it used other tools and was correct); `read` format `article` was not chosen for R4 either (the essay is short enough for `read`).

## Cleanup (done)

The throwaway user, its identity row and every row created for it were deleted from the staging database (verified: 0 users, 0 browser runs). The `browser-op-1110` tag is back on `xroga-api-universal-staging-chk-554bf2cdb` (original allowlist). Revision `00184-vuf` was deleted. Revision `00186-duh` (zero traffic, no tag, scaled to zero, holds the deleted user's id) cannot be deleted while it is the newest revision; the next staging revision removes it. Local credential files were removed.
