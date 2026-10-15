# S03 V12: animation storyboard

The guided tour drives the real components: it dispatches the same state actions a visitor's clicks would. It does not play a video.

**How it runs:**
- **Start:** plays once per visit, when the stage is at least half visible.
  - The run-once guard is the sessionStorage key `s03-tour-seen`. Reloading or scrolling back in the same visit never replays it.
- **Interrupt:** any click, tap or key inside S03 stops it at once and keeps exactly the state the visitor chose. Tab and Shift are excluded so keyboard users can move focus.
- **Pause and resume:** it pauses when the stage drops below 20 % visibility or the page is hidden. On return it resumes the same beat from the elapsed time; steps already shown are not repeated.
- **Controls:** while it plays, the stage head shows progress, one stage word (**Found / Compared / Prepared / Needs approval**), one caption and **Skip**. Afterwards it shows the example's name, "· Your turn: explore any part" and a quiet "About this walkthrough" note. There is no Replay, Start over, Play or Interactive preview control.
- **Reduced motion:** no autoplay and no running animations. The default state is complete and fully usable.

## Desktop and tablet (≥ 701 px): 10 beats, 20.5 s

| # | t (s) | Mode / lens | Stage | Caption | What visibly changes |
|---|---|---|---|---|---|
| 0 | 0 | — | — | — | The founder's headline "Get found. Get chosen. Grow." is in view (static; no headline animation). Both modes and the top of the stage are visible. |
| 1 | 0.0–2.2 | Search · Fix my website | Found | Found a broken product page; prepared the repair. | A crawl tracer runs the internal links and stops at `/protein/whey-isolate` (404). At 1.3 s the repair proposal appears ("Proposed · not applied"). |
| 2 | 2.2–4.8 | Search opportunities | Compared | Compared buyer searches; drafted the missing page. | Buyer searches cluster by intent (Buy, Compare, Learn, Nearby; the other intents stay muted). The chosen search leads to the competitor page ("Also cited in the AI answer"), then to PeakForm's empty slot. At +1.4 s the slot becomes a page brief with an approval chain: Needs your approval → publish → check results after publishing. |
| 3 | 4.8–7.4 | Appear in AI answers | Found | Checked which sources an AI answer cites. | "AI shopping question" (0–0.3 s). Answer sentences (0.3–0.6 s). Two numbered "Cited source" cards and "Brand mentioned, not cited" (0.5–0.8 s). Citation lines with anchored end dots (0.8–1.0 s, low contrast). PeakForm's product card, "Not cited in this checked example" (1.3 s). The finding (1.7 s) and the four missing facts (1.9–2.2 s). |
| 4 | 7.4–9.3 | Appear in AI answers | Prepared | Prepared clearer product facts for your review. | The four facts become drafted values ("Draft · awaiting approval"), with a line naming what else was drafted (comparison FAQ, product structured data, links from guides). At +1.0 s the card reads "Ready to publish after review", and its closing line becomes "Recheck mentions & citations · needs a connected source". |
| 5 | 9.3–11.3 | Earn authority · Competitor gap | Found | Found a site linking only to a competitor. | Sources in one lane: a verified link (solid blue, to PeakForm), competitor-only links (dashed, to the competitor) and the missing link (dotted, open end, stops short). PeakForm's node shows "No link from liftmag.example yet". |
| 6 | 11.3–12.8 | Earn authority · Outreach | Prepared | Drafted an outreach note for your review. | The graph steps back (hidden, not overlapped) and the draft note appears, "Draft · awaiting your review". No edge is created. |
| 7 | 12.8–14.5 | Show up locally | Needs approval | Drafted a listing fix that needs your approval. | The missing Saturday hours, then (0.6 s) the proposed correction, which needs the owner's sign-in and approval. |
| 8 | 14.5–16.7 | Marketing · Build search ads | Prepared | Matched ads to buyers; excluded the wrong searches. | The ad group drives the search ad and the landing page. At 0.9 s the irrelevant searches become negative keywords. |
| 9 | 16.7–18.5 | Create social ads | Prepared | Reshaped one offer for each placement. | Feed, then (0.8 s) Story comes forward with the same offer reshaped. |
| 10 | 18.5–20.5 | Trace conversions | Found | Traced visits to subscribers; found the drop-off. | Search path, then (0.8 s) the social path lights, and the bottleneck gate is highlighted. The tour ends: "Your turn: explore any part". |

**Timing against the V12.C brief for the AI scene:**

| Step | Brief | V12 |
|---|---|---|
| Question | < 0.5 s | in at 0–0.3 s |
| Source connection | ~0.6 s | sources 0.5–0.8 s, lines 0.8–1.0 s |
| Brand status | 0.5 s | 1.3 s |
| Gap | 0.7 s | 1.7–2.2 s |
| Draft | 0.7 s | the next beat, held 1.9 s |

Entrances are opacity-only (no translate), so measured line ends never drift while text arrives.

## Phones (≤ 700 px): 7 beats, 13.2 s

The beats are crawl (1.7 s), keywords (2.1 s), AI check (2.6 s), AI fix (1.4 s), link gap (1.8 s), search ads (1.9 s) and conversions (1.7 s). Outreach, local and social are left out, so there is no draft overlay on the small graph.

The intro plays once, the same way as on desktop. Scrolling is never blocked, and a tap anywhere hands over.

## Evidence

- `40-tour-desktop-contact-sheet.jpg`: time-coded frames from one untouched desktop run.
- `41-tour-mobile-contact-sheet.jpg`: time-coded frames from the 390 px run.
- `42-ai-sequence-frames.jpg`: the AI scene at 0.15, 0.6, 1.0, 1.5, 2.2 s and after the fix.
- The QA run measures the untouched tour end to end; see QA.md.
