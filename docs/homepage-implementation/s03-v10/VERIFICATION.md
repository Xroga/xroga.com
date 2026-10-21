# S03 V10: verification

All results below were measured in the local worktree on 14 Oct 2026. The browser QA and screenshots ran against a production build (`next build`, then `next start`).

| Check | Command | Result |
|---|---|---|
| S03 unit tests | `tsx --test frontend/src/components/homepage-next/s03/s03.test.ts` | 26 of 26 pass |
| Repository tests | `npm test` (root) | Backend 2717 of 2717, frontend 1029 of 1029 |
| Lint (S03) | `eslint src/components/homepage-next/s03` | Clean |
| Typecheck | `tsc --noEmit` | No errors in S03. Errors already present in unrelated test files are unchanged |
| Formatting | `prettier --check` (single quotes, width 160) | Clean |
| Builds | `npm run build --workspace=frontend` and `--workspace=backend` | OK |
| Browser QA | `qa10.mjs` (Playwright and Chromium, production build) | 80 of 80 checks pass |

## Tour measurements (production build, 1440×900)
- An untouched tour ran 24.4 s: 11 beats across both modes, ending in "Your turn". The view ended on Launch & Marketing with Conversions selected.
- Captions observed in order: see `21-tour-search-contact-sheet.jpg` and `22-tour-marketing-contact-sheet.jpg`. Each frame is labelled with the time it was captured after S03 came into view.
- S03 cumulative layout shift during the QA run: 0.0003.

## Coverage checklist (each item is exercised by a browser QA check)

**Structure and tour**
- [x] One `<section>`; modes are panels of one stage. Arrow keys and Home move between the two mode tabs, and the stage's `aria-labelledby` follows.
- [x] The tour autoplays once the stage is in view, on Search & Visibility.
- [x] Hovering does not stop it.
- [x] Scrolled out of view it pauses and does not advance; back in view it resumes.
- [x] A hidden page pauses it; returning resumes it.
- [x] Tab does not stop it.
- [x] A click stops it immediately and the clicked lens stays.
- [x] Replay restarts from beat 1.
- [x] A key press stops it; switching modes mid-tour simply switches.
- [x] Skip leaves a usable state with "Your turn".
- [x] A visitor who acts before the tour starts is never taken over.
- [x] Reduced motion: no autoplay, a manual "Watch Xroga work" button, and no running animations.
- [x] Phones: no autoplay; the tour starts only on request.
- [x] Nothing in the tour claims anything was published, sent or launched (also enforced by a unit test).

**Search & Visibility: all 5 lenses**
- [x] **Fix my website:**
  - The crawl tracer covers all 7 links.
  - Each issue maps to its page.
  - The repair is "Proposed · not applied" and has a verification step.
- [x] **Find search opportunities:**
  - A buying gap shows next to the competitor's page.
  - The content brief is a draft that fills the slot.
  - Changing the intent switches the cluster.
- [x] **Appear in AI answers:**
  - Three real questions; the sources update per question.
  - Statuses shown: cited, conflicting, not cited and not tested.
  - No "Sample" labels.
  - The method note promises nothing.
  - The page change is a draft.
- [x] **Earn authority:**
  - Verified edges point to the site and competitor-only edges to the competitor.
  - A mention is an open line.
  - Outreach is a draft and adds no new link edge.
  - The paid-link source is excluded.
  - "My links" shows verified links only.
- [x] **Show up locally:**
  - The listing update drafts the two missing details only, and needs sign-in and approval.
- [x] **Providers:**
  - Ahrefs shows what it reads and "Available to connect".
  - Business Profile shows "Not in directory".
  - AI answers names no provider and says why.

**Launch & Marketing**
- [x] An ad group drives the search ad and the landing page together.
- [x] Negative keywords exclude irrelevant searches.
- [x] The campaign review reflects ad group, match type, negatives, a £45 proposed cap and location. It shows "Nothing is launched or charged".
- [x] The audience changes tone, line and offer in both the feed and story placements; the chosen placement comes forward.
- [x] The launch asset shows its state.
- [x] The ribbon traces into Conversions.
- [x] Gates and insight agree.
- [x] The method is labelled with illustrative figures.
- [x] HubSpot shows "Available to connect"; Tag Manager shows "Not in directory".

**Shared**
- [x] Links go only to /auth/signup, /workspace or /integrations.
- [x] One "Interactive preview" disclosure opens a single note.
- [x] All tab stops have a visible focus ring. There are 11 tab stops: roving tabindex in both tablists and a single stage.
- [x] Rapid switching (15 lens, 6 mode and 12 mission changes) ends in one consistent state, and each mode keeps its own choice.
- [x] Header shield: content under the sticky header is covered at top, intro, stage, foot and back-scroll, and the shield is off while S03's heading is in view.
- [x] Phone evidence sheet: opens focused and locks the page; Escape closes it and returns focus.
- [x] Mobile tap targets are at least 32 px.
- [x] No horizontal overflow and no element escaping its stage at 1920, 1440, 1280, 1100, 1024, 768, 430, 390, 360 or 320 px. Checked for the mode selector, the tour bar, all 5 lenses and all 4 marketing jobs, plus 200% zoom and phone landscape (844×390).
- [x] No page errors.

Browser back and forward were not tested: S03 keeps no state in the URL, so the history stack is unaffected.

## Regression (S00–S02)
S00–S02 were rendered at 1440×900 and 390×844 with reduced motion and compared with the stored pre-V10 baseline.
- **S01 and S02:** pixel-identical.
- **S00:** differs only in the animated orb region, and no pixel differs by more than 16 levels.

## Evidence files
| File | What it shows |
|---|---|
| 01 | 1440 opening frame: tour beat 1 |
| 02, 03 | At rest: each mode after Skip and Start over |
| 04 | AI answers: a real question |
| 05 | Interactive preview note |
| 06 | Tour interrupted by a click |
| 07 | Tour finished: "Your turn" |
| 08–11 | 1920, 1280, 1024 and 768 px |
| 12–15 | 390 px: opening with no autoplay, search stage, marketing stage, tour on request |
| 16–17 | 360 px |
| 18 | 320 px |
| 19 | Reduced motion |
| 20 | 200% zoom |
| 21, 22 | Timestamped tour contact sheets |
| 23 | S02 → S03 boundary |
