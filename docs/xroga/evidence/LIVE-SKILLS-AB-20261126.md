# Live run: 12 real-world tasks, with and without skills, 2026-11-26

What ran: the product build of the extension against the staging backend (`xroga-api-universal-staging`, tag `browser-op-1110`), the real Xroga model (DeepSeek through Zurelay), one throwaway staging user, headful Chrome. The model chose every step. All 12 tasks use public sites and files on the internet (none uses a local server). Tasks and scorers: `apps/xroga-browser-extension/fixtures/acceptance/` (`tasks.json`, `scorers.mjs`, `score.mjs`); answers were checked against the sources first. N5 (the latest React release tag, v19.3.1) is a live value and was true on 2026-11-26.

Two builds of the same code, differing only in one harness flag: `WXT_AUTORUN_NO_SKILLS=1` removes the skill tools (`find_skill`, `read_skill`, `save_skill`, `site_action`) and every automatic skill, guide and site hint (`loop.ts` `#announceSite`, `run-manager.ts`). The flag is read at build time and is never set in a product build.

| Task | Skills on: seconds, turns | Skills off: seconds, turns |
|---|---|---|
| R1 CSV airline passengers | 19.4, 3 | 13.2, 2 |
| R2 Excel rows and headings | 24.9, 3 | 18.7, 3 |
| R3 PowerPoint title and subtitle | 17.3, 2 | 19.8, 3 |
| R4 Essay title, date, qualities | 17.5, 2 | 26.8, 3 |
| R5 python.org social links and feeds | 79.8, 8 | 79.5, 8 |
| R6 Endless quotes list | 62.7, 7 | 62.9, 7 |
| N1 npm express version and licence | 10.4, 1 | 16.5, 2 |
| N2 PyPI requests version | 24.3, 2 | 24.6, 2 |
| N3 Wikipedia Go designers | 14.0, 1 | 9.8, 1 |
| N4 Selenium web form | 30.7, 4 | 31.7, 5 |
| N5 GitHub react latest release | 30.9, 3 | 32.1, 2 |
| N6 Python docs functools.cache | 12.8, 2 | 8.7, 1 |
| **Total** | **345 s, 38 turns** | **344 s, 39 turns** |

**Result: 12 of 12 correct in both conditions (score 1.00 each).** With the 6 tasks of the earlier run of the same day, that is 18 of 18 distinct task runs correct on the extension. For 12 of 12 the 95% lower confidence bound on the success rate is about 76%: a first real sample, not a proven rate.

**What it shows, plainly:** on general real-world tasks the skills made no measurable difference (345 s against 344 s, 38 against 39 turns), and in the skills-on run the model chose no skill tool at all. That agrees with the design rule that skills are optional help and the agent must work without them. It does not test the domain skills (Google Ads, Meta, Shopify), which need real accounts and were not touched.

## Cleanup (done)
The throwaway user, its identity row and every row created for it were deleted from the staging database (verified: 0 users, 0 browser runs). The `browser-op-1110` tag is back on `xroga-api-universal-staging-chk-554bf2cdb`. The earlier leftover revision `00186-duh` was deleted. The only temporary revision now is `xroga-api-universal-staging-00188-qux` (no traffic, no tag, scaled to zero; it holds only the id of the deleted user); Cloud Run will not delete the newest revision, so the next staging revision removes it. Local credential files were removed. Nothing of the Codex release line or production was touched.
